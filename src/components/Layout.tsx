import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import { ArrowIcon, Button } from './ui'

const HOME = { to: '/', label: 'Home' }
const DISCOVER = { to: '/creators', label: 'Discover creators' }
const CREATE = { to: '/briefs/new', label: 'Create brief' }

// Brands write briefs; creators browse them. Logged-out visitors see the brand path.
const LINKS = {
  guest: [HOME, DISCOVER, CREATE],
  brand: [HOME, DISCOVER, CREATE, { to: '/dashboard/brand', label: 'My briefs' }],
  creator: [HOME, DISCOVER, { to: '/briefs', label: 'Open briefs' }, { to: '/dashboard/creator', label: 'My dashboard' }],
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  `text-[15px] font-medium transition-colors underline-offset-8 decoration-2 decoration-brand ${
    isActive ? 'text-ink underline' : 'text-ink/75 hover:text-ink'
  }`

export function Logo({ className = '' }: { className?: string }) {
  return (
    <Link to="/" className={`display text-2xl tracking-tight ${className}`} aria-label="BRIVIO home">
      BRIVIO<span className="text-brand">.</span>
    </Link>
  )
}

export default function Layout() {
  const { session, role } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)

  useEffect(() => setOpen(false), [pathname])

  async function logout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  const links = LINKS[session ? (role ?? 'guest') : 'guest']
  const authButton = session ? (
    <Button variant="dark" onClick={logout} icon={<ArrowIcon />}>Log out</Button>
  ) : (
    <Button variant="dark" to="/login" icon={<ArrowIcon />}>Login</Button>
  )

  return (
    <div className="min-h-screen flex flex-col">
      <header className="relative z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between gap-4">
          <Logo />
          <nav className="hidden md:flex items-center gap-6 lg:gap-9" aria-label="Main">
            {links.map((l) => <NavLink key={l.to} to={l.to} end className={navClass}>{l.label}</NavLink>)}
          </nav>
          <div className="hidden md:block">{authButton}</div>
          <button
            className="md:hidden h-11 w-11 rounded-btn bg-ink text-cream flex items-center justify-center"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              {open ? <path d="M5 5l10 10M15 5 5 15" /> : <path d="M3 6h14M3 10h14M3 14h14" />}
            </svg>
          </button>
        </div>
        {open && (
          <nav className="md:hidden absolute inset-x-4 top-[4.75rem] rounded-card bg-ink text-cream p-5 shadow-card flex flex-col gap-1" aria-label="Mobile">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end className={({ isActive }) => `display text-lg py-2.5 ${isActive ? 'text-brand' : ''}`}>
                {l.label}
              </NavLink>
            ))}
            <div className="mt-3 pt-4 border-t border-cream/15">
              {session ? (
                <Button variant="primary" full onClick={logout} icon={<ArrowIcon />}>Log out</Button>
              ) : (
                <Button variant="primary" full to="/login" icon={<ArrowIcon />}>Login</Button>
              )}
            </div>
          </nav>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="bg-bark text-cream/70 mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row gap-6 sm:items-center sm:justify-between">
          <div>
            <Logo className="text-cream" />
            <p className="mt-2 text-sm">BRIVIO connects AI creators with brands. Sample data shown for demo purposes.</p>
          </div>
          <div className="flex flex-wrap gap-x-7 gap-y-2 text-sm font-medium">
            <Link to="/creators" className="hover:text-cream">Discover creators</Link>
            <Link to="/briefs/new" className="hover:text-cream">Create brief</Link>
            <Link to="/briefs" className="hover:text-cream">Open briefs</Link>
            <Link to={role === 'creator' ? '/dashboard/creator' : '/onboarding/creator'} className="hover:text-cream">
              {role === 'creator' ? 'Creator dashboard' : 'Join as creator'}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
