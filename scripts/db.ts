// Direct Postgres connection for the migration scripts, built from SUPABASE_DB_URL.
import 'dotenv/config'
import pg from 'pg'

/**
 * Parses the connection string by hand instead of handing it to pg, so two common copy-paste slips still work:
 * a password left inside the [brackets] of Supabase's placeholder, and a password with characters such as
 * @ : / # ? that were not URL-encoded.
 */
export function dbConfig(): pg.ClientConfig | null {
  const raw = process.env.SUPABASE_DB_URL?.trim().replace(/^["']|["']$/g, '')
  if (!raw) return null
  // user is everything up to the first ":", host starts after the LAST "@", so the password may contain either.
  const m = raw.match(/^postgres(?:ql)?:\/\/([^:]+):(.*)@([^@/:]+)(?::(\d+))?\/([^?]*)/s)
  if (!m) throw new Error('SUPABASE_DB_URL should look like postgresql://user:password@host:5432/postgres')
  let password = m[2]
  if (password === '[YOUR-PASSWORD]') throw new Error('SUPABASE_DB_URL still contains [YOUR-PASSWORD]. Replace it with your database password.')
  if (password.startsWith('[') && password.endsWith(']')) password = password.slice(1, -1)
  try {
    if (/%[0-9A-Fa-f]{2}/.test(password)) password = decodeURIComponent(password)
  } catch {
    // not actually URL-encoded; use it as typed
  }
  return {
    user: decodeURIComponent(m[1]),
    password,
    host: m[3],
    port: Number(m[4] ?? 5432),
    database: m[5] || 'postgres',
    // Supabase requires TLS; its pooler certificate is not in Node's default trust store.
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  }
}

/** Connects, or prints a plain explanation and exits. */
export async function connectDb(): Promise<pg.Client> {
  let config: pg.ClientConfig | null
  try {
    config = dbConfig()
  } catch (err) {
    console.error((err as Error).message)
    process.exit(1)
  }
  if (!config) {
    console.error('SUPABASE_DB_URL is not set in .env.\nSupabase dashboard → Connect (top bar) → Connection string → Session pooler. See README.')
    process.exit(1)
  }
  const client = new pg.Client(config)
  try {
    await client.connect()
    return client
  } catch (err) {
    const message = (err as Error).message
    console.error(`Could not connect to the database: ${message}`)
    if (/ENOTFOUND|ENETUNREACH|EHOSTUNREACH|timeout/i.test(message))
      console.error('The "Direct connection" string needs IPv6. Use the "Session pooler" string instead.')
    if (/password|authentication|SASL/i.test(message))
      console.error('The database password in SUPABASE_DB_URL is not being accepted. Reset it under Project Settings → Database if unsure.')
    process.exit(1)
  }
}
