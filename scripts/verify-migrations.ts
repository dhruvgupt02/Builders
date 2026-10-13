// npm run migrate:verify — checks that migrations 002 and 003 are live.
// 1. (needs SUPABASE_DB_URL) the expected policies exist in pg_policies
// 2. behaviour, through the public API exactly as the app uses it: the demo creator can delete their own
//    test item, cannot delete another creator's item, and a non-owner can read brief rights.
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { adminClient, requireEnv } from './env.js'
import { connectDb } from './db.js'

const EXPECTED: [table: string, policy: string, command: string][] = [
  ['brief_rights', 'brief_rights_select_authenticated', 'SELECT'],
  ['portfolio_items', 'portfolio_delete_own', 'DELETE'],
  ['workflow_steps', 'steps_delete_own', 'DELETE'],
  ['verifications', 'verifications_delete_own_pending', 'DELETE'],
]

let failures = 0
const report = (ok: boolean, text: string) => {
  if (!ok) failures++
  console.log(`${ok ? '✓' : '✗'} ${text}`)
}

// ── 1. policies ──
console.log('Policies')
if (process.env.SUPABASE_DB_URL) {
  const client = await connectDb()
  const { rows } = await client.query<{ tablename: string; policyname: string; cmd: string }>(
    `select tablename, policyname, cmd from pg_policies where schemaname = 'public' and tablename = any($1) order by tablename, policyname`,
    [EXPECTED.map(([t]) => t)],
  )
  for (const [table, policy, cmd] of EXPECTED) report(rows.some((r) => r.tablename === table && r.policyname === policy && r.cmd === cmd), `${table}: ${policy} (${cmd})`)
  const migrations = await client.query<{ name: string }>('select name from public.schema_migrations order by name').catch(() => ({ rows: [] }))
  console.log(`  schema_migrations: ${migrations.rows.map((r) => r.name).join(', ') || 'none recorded'}`)
  await client.end()
} else {
  console.log('  skipped: SUPABASE_DB_URL is not set, so pg_policies cannot be read')
}

// ── 2. behaviour ──
console.log('\nBehaviour (as the demo creator, through the public API)')
const admin = adminClient()
const user = createClient(requireEnv('SUPABASE_URL'), requireEnv('VITE_SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })
const login = await user.auth.signInWithPassword({ email: 'demo.creator@brivio.app', password: 'BrivioDemo123!' })
if (login.error) throw new Error(`Demo creator login failed: ${login.error.message}`)

const { data: mine } = await user.from('creators').select('id').eq('profile_id', login.data.user.id).single()
const { data: other } = await admin.from('portfolio_items').select('id, title, creator_id').neq('creator_id', mine!.id).limit(1).single()

// A throwaway item with one step and one pending verification, created as the creator.
const created = await user.from('portfolio_items').insert({ creator_id: mine!.id, title: 'Migration check (safe to delete)', media_type: 'image' }).select('id').single()
if (created.error) throw new Error(`Could not create the test item: ${created.error.message}`)
const itemId = created.data.id as string
const step = await user.from('workflow_steps').insert({ portfolio_item_id: itemId, step_order: 1, tool: 'Midjourney', action: 'test' }).select('id').single()
const verification = await user.from('verifications').insert({ creator_id: mine!.id, type: 'tool', label: 'Migration check', status: 'pending' }).select('id').single()

try {
  const delStep = await user.from('workflow_steps').delete().eq('id', step.data!.id).select('id')
  report(delStep.data?.length === 1, 'creator can delete a workflow step on their own item')

  const delVerification = await user.from('verifications').delete().eq('id', verification.data!.id).select('id')
  report(delVerification.data?.length === 1, 'creator can withdraw their own pending verification')

  const { data: verified } = await admin.from('verifications').select('id').eq('creator_id', mine!.id).eq('status', 'verified').limit(1).maybeSingle()
  if (verified) {
    const delVerified = await user.from('verifications').delete().eq('id', verified.id).select('id')
    report((delVerified.data?.length ?? 0) === 0, 'creator cannot delete a verified verification')
  }

  const delOther = await user.from('portfolio_items').delete().eq('id', other!.id).select('id')
  const stillThere = await admin.from('portfolio_items').select('id').eq('id', other!.id).maybeSingle()
  report((delOther.data?.length ?? 0) === 0 && !!stillThere.data, `creator cannot delete someone else's item ("${other!.title}" is still there)`)

  const delOwn = await user.from('portfolio_items').delete().eq('id', itemId).select('id')
  const gone = await admin.from('portfolio_items').select('id').eq('id', itemId).maybeSingle()
  report(delOwn.data?.length === 1 && !gone.data, 'creator can delete their own test item')

  // The demo creator owns no brand, so seeing any rights row proves the new read policy.
  const rights = await user.from('brief_rights').select('brief_id', { count: 'exact', head: true })
  report((rights.count ?? 0) > 0, `a logged-in non-owner can read brief rights (${rights.count ?? 0} rows visible)`)

  await user.auth.signOut()
  const anon = await user.from('brief_rights').select('brief_id', { count: 'exact', head: true })
  report((anon.count ?? 0) === 0, 'a logged-out visitor still cannot read brief rights')
} finally {
  // Whatever happened above, leave no test rows behind.
  await admin.from('verifications').delete().eq('label', 'Migration check')
  await admin.from('portfolio_items').delete().eq('id', itemId)
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
