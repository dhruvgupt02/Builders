import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSession } from '../lib/useSession'

const navClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm font-medium transition-colors ${isActive ? 'text-brand' : 'text-gray-600 hover:text-gray-900'}`

export default function Layout() {
  const { session } = useSession()
  const navigate = useNavigate()

  async function logout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="border-b border-gray-100 sticky top-0 bg-white/90 backdrop-blur z-10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="text-xl font-extrabold tracking-tight text-brand">BRIVIO</Link>
          <nav className="flex items-center gap-4 sm:gap-6">
            <NavLink to="/creators" className={navClass}>Discover creators</NavLink>
            <NavLink to="/briefs/new" className={navClass}>Create brief</NavLink>
            {session ? (
              <button onClick={logout} className="text-sm font-medium text-gray-600 hover:text-gray-900">
                Log out
              </button>
            ) : (
              <NavLink
                to="/login"
                className="text-sm font-medium px-4 py-2 rounded-lg bg-brand text-white hover:bg-brand-dark"
              >
                Login
              </NavLink>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-gray-100 py-6 text-center text-xs text-gray-500">
        BRIVIO · AI creators for brands · Sample data shown for demo purposes
      </footer>
    </div>
  )
}
