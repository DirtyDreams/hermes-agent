import { Outlet, Link, useNavigate } from 'react-router-dom'
import { Sparkles, MessageCircle, User, Heart, Coins, LogOut, Compass } from 'lucide-react'
import { useAuthStore } from '../store/auth'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export default function Layout() {
  const logout = useAuthStore((state) => state.logout)
  const navigate = useNavigate()

  const { data: balanceData } = useQuery({
    queryKey: ['balance'],
    queryFn: async () => {
      const { data } = await api.get('/economy/balance')
      return data
    }
  })

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: 'hsl(var(--background))' }}>
      <header style={{ 
        position: 'sticky', 
        top: 0, 
        zIndex: 10,
        backgroundColor: 'hsl(var(--background) / 0.8)', 
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid hsl(var(--border) / 0.5)',
        padding: '0 1rem'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', height: '4rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link to="/" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'white', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ background: 'var(--violet-gradient)', backgroundClip: 'text', WebkitBackgroundClip: 'text', color: 'transparent' }}>Velvet</span>
          </Link>

          <nav style={{ display: 'flex', gap: '2rem' }}>
            <Link to="/" className="nav-link"><Sparkles size={20} /> <span className="hide-mobile">Home</span></Link>
            <Link to="/discovery" className="nav-link"><Compass size={20} /> <span className="hide-mobile">Discover</span></Link>
            <Link to="/conversations" className="nav-link"><MessageCircle size={20} /> <span className="hide-mobile">Chat</span></Link>
            <Link to="/couple/portal" className="nav-link"><Heart size={20} /> <span className="hide-mobile">Relationship</span></Link>
            <Link to="/economy" className="nav-link" style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem',
              backgroundColor: 'hsla(var(--primary), 0.1)',
              padding: '0.4rem 0.75rem',
              borderRadius: '2rem',
              color: 'hsl(var(--primary))'
            }}>
              <Coins size={18} /> 
              <span style={{ fontWeight: 800 }}>{balanceData?.balance ?? 0}</span>
            </Link>
            <Link to="/onboarding" className="nav-link"><User size={20} /> <span className="hide-mobile">Me</span></Link>
          </nav>

          <button onClick={handleLogout} style={{ background: 'transparent', border: 'none', color: 'hsl(var(--muted-foreground))', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main style={{ flex: 1, maxWidth: '1200px', margin: '0 auto', width: '100%', padding: '2rem' }}>
        <Outlet />
      </main>

      <style>{`
        .nav-link {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: hsl(var(--muted-foreground));
          text-decoration: none;
          font-weight: 500;
          transition: color 0.2s;
        }
        .nav-link:hover { color: white; }
        @media (max-width: 640px) {
          .hide-mobile { display: none; }
        }
      `}</style>
    </div>
  )
}
