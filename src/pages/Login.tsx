import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSession } from '../lib/useSession'
import { ArrowIcon, Button, Card, Input } from '../components/ui'

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

  async function signInDemoCreator() {
    setBusy('creator')
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: DEMO_USERS.creator, password: DEMO_PASSWORD })
    if (error) {
      setBusy(null)
      setError(error.message)
      return
    }
    const { data } = await supabase.auth.getUser()
    const { data: c } = await supabase.from('creators').select('id').eq('profile_id', data.user?.id ?? '').maybeSingle()
    setBusy(null)
    navigate(c ? `/creators/${c.id}` : '/creators')
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-14 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-14 items-center">
      <div>
        <div className="dots h-10 w-10 mb-5" aria-hidden />
        <h1 className="display text-4xl sm:text-6xl">Log in<br />to Brivio</h1>
        <p className="mt-5 text-lg text-ink-soft max-w-sm">
          Try the marketplace in one click with a demo account, or use your own.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Button
            size="lg"
            icon={<ArrowIcon />}
            disabled={busy !== null}
            onClick={() => signIn(DEMO_USERS.brand, DEMO_PASSWORD, 'brand', '/briefs/new')}
          >
            {busy === 'brand' ? 'Signing in…' : 'Try as brand'}
          </Button>
          <Button size="lg" variant="dark" icon={<ArrowIcon />} disabled={busy !== null} onClick={signInDemoCreator}>
            {busy === 'creator' ? 'Signing in…' : 'Try as creator'}
          </Button>
        </div>
      </div>

      <Card ticket notchY="5.25rem" className="!p-6 sm:!p-8">
        <h2 className="display text-xl">Your account</h2>
        {session ? (
          <p className="mt-2 text-sm text-ink-soft">
            Logged in as <span className="font-semibold text-ink break-all">{session.user.email}</span>
          </p>
        ) : (
          <p className="mt-2 text-sm text-ink-soft">Email and password</p>
        )}
        <form onSubmit={onSubmit} className="mt-8 pt-6 border-t border-dashed border-ink/25 space-y-4">
          <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@brand.com" />
          <Input label="Password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          <Button type="submit" variant="dark" full disabled={busy !== null}>
            {busy === 'form' ? 'Signing in…' : 'Log in'}
          </Button>
        </form>
        {error && <p className="mt-4 rounded-btn bg-brand/10 px-3 py-2 text-sm font-medium text-brand-dark" role="alert">{error}</p>}
      </Card>
    </div>
  )
}
