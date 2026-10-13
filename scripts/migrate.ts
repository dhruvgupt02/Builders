// npm run migrate            — applies every file in supabase/migrations/ that has not been applied yet
// npm run migrate -- --status — only lists what is applied and what is pending
//
// Connects straight to Postgres with SUPABASE_DB_URL (see README for where to find it). Applied files are
// recorded in public.schema_migrations, and each file runs in its own transaction: it either applies fully or not at all.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { connectDb } from './db.js'

const DIR = join(process.cwd(), 'supabase', 'migrations')
const statusOnly = process.argv.includes('--status')

const client = await connectDb()

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
