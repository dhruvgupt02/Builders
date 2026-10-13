// npm run migrate            — applies every file in supabase/migrations/ that has not been applied yet
// npm run migrate -- --status — only lists what is applied and what is pending
//
// Connects straight to Postgres with SUPABASE_DB_URL (see README for where to find it). Applied files are
// recorded in public.schema_migrations, and each file runs in its own transaction: it either applies fully or not at all.
import 'dotenv/config'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

const DIR = join(process.cwd(), 'supabase', 'migrations')
const statusOnly = process.argv.includes('--status')

const url = process.env.SUPABASE_DB_URL
if (!url) {
  console.error('SUPABASE_DB_URL is not set in .env.\nSupabase dashboard → Connect (top bar) → Connection string → Session pooler. See README.')
  process.exit(1)
}
if (url.includes('[YOUR-PASSWORD]')) {
  console.error('SUPABASE_DB_URL still contains [YOUR-PASSWORD]. Replace it with your database password.')
  process.exit(1)
}

// Supabase requires TLS; its pooler certificate is not in Node's default trust store.
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 })

try {
  await client.connect()
} catch (err) {
  const message = (err as Error).message
  console.error(`Could not connect to the database: ${message}`)
  if (/ENOTFOUND|ENETUNREACH|EHOSTUNREACH|timeout/i.test(message))
    console.error('The "Direct connection" string needs IPv6. Use the "Session pooler" string instead.')
  if (/password|authentication|SASL/i.test(message))
    console.error('Check the database password. If it contains characters like @ : / # ? it must be URL-encoded.')
  process.exit(1)
}

try {
  // RLS on with no policies: the table is invisible to the public API and only reachable over this connection.
  await client.query(`
    create table if not exists public.schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    );
    alter table public.schema_migrations enable row level security;
  `)

  const applied = new Set((await client.query<{ name: string }>('select name from public.schema_migrations')).rows.map((r) => r.name))
  const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
  const pending = files.filter((f) => !applied.has(f))

  for (const f of files) console.log(`${applied.has(f) ? 'applied' : 'pending'}  ${f}`)
  if (statusOnly || pending.length === 0) {
    console.log(pending.length === 0 ? '\nNothing to apply. The database is up to date.' : `\n${pending.length} pending.`)
  } else {
    console.log('')
    for (const f of pending) {
      try {
        await client.query('begin')
        await client.query(readFileSync(join(DIR, f), 'utf8'))
        await client.query('insert into public.schema_migrations (name) values ($1)', [f])
        await client.query('commit')
        console.log(`✓ applied ${f}`)
      } catch (err) {
        await client.query('rollback').catch(() => {})
        console.error(`✗ ${f} failed and was rolled back: ${(err as Error).message}`)
        console.error('Stopped. Later migrations were not run.')
        process.exitCode = 1
        break
      }
    }
  }
} finally {
  await client.end()
}
