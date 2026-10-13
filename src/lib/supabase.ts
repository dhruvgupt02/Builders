import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && anonKey)

// Without env vars, answer every request immediately with an error instead of retrying a dead host,
// so pages show their error state rather than spinning.
const notConfiguredFetch: typeof fetch = async () =>
  new Response(JSON.stringify({ message: 'Supabase is not configured (set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY)' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  })

if (!supabaseConfigured) console.warn('Supabase env vars missing: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')

// Browser client: anon key only. Never import service-role keys into src/.
export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'missing-anon-key', {
  global: supabaseConfigured ? {} : { fetch: notConfiguredFetch },
})
