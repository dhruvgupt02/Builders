// Loads .env for local scripts and exposes a service-role Supabase client.
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

export function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`Missing ${name} in .env`)
    process.exit(1)
  }
  return v
}

export function adminClient() {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
