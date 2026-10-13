import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSession } from '../lib/useSession'

// Public demo accounts created by scripts/seed.ts. Safe to ship: they only hold sample data.
const DEMO_PASSWORD = 'BrivioDemo123!'
const DEMO_USERS = {
  brand: 'demo.brand@brivio.app',
  creator: 'demo.creator@brivio.app',
} as const

export default function Login() {
  const navigate = useNavigate()
  const { session } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function signIn(e: string, p: string, key: string, redirect: string) {
    setBusy(key)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: e, password: p })
    setBusy(null)
    if (error) setError(error.message)
    else navigate(redirect)
  }

  function onSubmit(ev: FormEvent) {
    ev.preventDefault()
    signIn(email, password, 'form', '/creators')
  }

  async function goToDemoCreator() {
    const { data } = await supabase.auth.getUser()
    const { data: c } = await supabase.from('creators').select('id').eq('profile_id', data.user?.id ?? '').maybeSingle()
    navigate(c ? `/creators/${c.id}` : '/creators')
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <h1 className="text-2xl font-bold text-gray-900">Log in to BRIVIO</h1>
      {session && (
        <p className="mt-3 text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
          You are logged in as <span className="font-medium">{session.user.email}</span>.
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3">
        <button
          onClick={() => signIn(DEMO_USERS.brand, DEMO_PASSWORD, 'brand', '/briefs/new')}
          disabled={busy !== null}
          className="py-3 rounded-xl bg-brand text-white font-semibold hover:bg-brand-dark disabled:opacity-60"
        >
          {busy === 'brand' ? 'Signing in…' : 'Try as brand'}
        </button>
        <button
          onClick={async () => {
            setBusy('creator')
            setError(null)
            const { error } = await supabase.auth.signInWithPassword({ email: DEMO_USERS.creator, password: DEMO_PASSWORD })
            if (error) { setBusy(null); setError(error.message); return }
            await goToDemoCreator()
            setBusy(null)
          }}
          disabled={busy !== null}
          className="py-3 rounded-xl border border-brand text-brand font-semibold hover:bg-brand-light disabled:opacity-60"
        >
          {busy === 'creator' ? 'Signing in…' : 'Try as creator'}
        </button>
      </div>

      <div className="my-8 flex items-center gap-3 text-xs text-gray-400">
        <div className="h-px bg-gray-200 flex-1" /> or use your account <div className="h-px bg-gray-200 flex-1" />
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Email</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand" />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Password</span>
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand" />
        </label>
        <button type="submit" disabled={busy !== null}
          className="w-full py-2.5 rounded-lg bg-gray-900 text-white font-medium hover:bg-black disabled:opacity-60">
          {busy === 'form' ? 'Signing in…' : 'Log in'}
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-red-600" role="alert">{error}</p>}
    </div>
  )
}
