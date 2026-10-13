import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSession } from '../lib/useSession'
import { ArrowIcon, Button, Card, Input, Notice, Select, Tabs } from '../components/ui'

// Public demo accounts created by scripts/seed.ts. Safe to ship: they only hold sample data.
const DEMO_PASSWORD = 'BrivioDemo123!'
const DEMO_USERS = {
  brand: 'demo.brand@brivio.app',
  creator: 'demo.creator@brivio.app',
} as const

const MODES = [
  { id: 'login', label: 'Log in' },
  { id: 'signup', label: 'Create account' },
] as const
const ROLES = [
  { value: 'brand', label: 'A brand looking for AI creators' },
  { value: 'creator', label: 'An AI creator' },
]

export default function Login() {
  const navigate = useNavigate()
  const { session } = useSession()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [name, setName] = useState('')
  const [role, setRole] = useState('brand')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  /** Creators land on their dashboard (or onboarding if they have no profile yet); brands on discovery. */
  async function landingFor(userId: string | undefined, fallbackRole?: string) {
    if (!userId) return '/creators'
    const [{ data: profile }, { data: creator }] = await Promise.all([
      supabase.from('profiles').select('role').eq('id', userId).maybeSingle(),
      supabase.from('creators').select('id').eq('profile_id', userId).limit(1).maybeSingle(),
    ])
    if ((profile?.role ?? fallbackRole) !== 'creator') return '/creators'
    return creator ? '/dashboard/creator' : '/onboarding/creator'
  }

  async function signIn(e: string, p: string, key: string, redirect?: string) {
    setBusy(key)
    setError(null)
    setInfo(null)
    const { data, error } = await supabase.auth.signInWithPassword({ email: e, password: p })
    if (error) {
      setBusy(null)
      return setError(error.message === 'Invalid login credentials' ? 'That email and password do not match an account.' : error.message)
    }
    const to = redirect ?? (await landingFor(data.user?.id))
    setBusy(null)
    navigate(to)
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (mode === 'login') return signIn(email, password, 'form')

    setError(null)
    setInfo(null)
    if (name.trim().length < 2) return setError('Enter your name.')
    if (password.length < 8) return setError('Choose a password with at least 8 characters.')
    setBusy('form')
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { role, name: name.trim() } } })
    setBusy(null)
    if (error) return setError(error.message)
    // With email confirmation switched on in Supabase there is no session until the link is clicked.
    if (!data.session) {
      setMode('login')
      return setInfo('Account created. Check your email for a confirmation link, then log in.')
    }
    navigate(await landingFor(data.user?.id, role))
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
          <Button size="lg" icon={<ArrowIcon />} disabled={busy !== null} onClick={() => signIn(DEMO_USERS.brand, DEMO_PASSWORD, 'brand', '/briefs/new')}>
            {busy === 'brand' ? 'Signing in…' : 'Try as brand'}
          </Button>
          <Button size="lg" variant="dark" icon={<ArrowIcon />} disabled={busy !== null} onClick={() => signIn(DEMO_USERS.creator, DEMO_PASSWORD, 'creator')}>
            {busy === 'creator' ? 'Signing in…' : 'Try as creator'}
          </Button>
        </div>
      </div>

      <Card ticket notchY="5.75rem" className="!p-6 sm:!p-8">
        <Tabs tabs={MODES} active={mode} onChange={(m) => { setMode(m); setError(null); setInfo(null) }} />
        <p className="mt-3 text-sm text-ink-soft">
          {session ? <>Logged in as <span className="font-semibold text-ink break-all">{session.user.email}</span></> : mode === 'login' ? 'Use your email and password.' : 'Free for brands and creators.'}
        </p>
        <form onSubmit={onSubmit} className="mt-7 pt-6 border-t border-dashed border-ink/25 space-y-4">
          {mode === 'signup' && (
            <>
              <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              <Select label="I am" options={ROLES} value={role} onChange={(e) => setRole(e.target.value)} />
            </>
          )}
          <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@brand.com" />
          <Input
            label="Password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'} hint={mode === 'signup' ? 'At least 8 characters.' : undefined}
          />
          <Button type="submit" variant="dark" full disabled={busy !== null}>
            {busy === 'form' ? 'One moment…' : mode === 'login' ? 'Log in' : 'Create account'}
          </Button>
        </form>
        {info && <div className="mt-4"><Notice tone="success">{info}</Notice></div>}
        {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
      </Card>
    </div>
  )
}
