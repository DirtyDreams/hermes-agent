import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Link } from 'react-router-dom'
import { MessageSquare, Shield } from 'lucide-react'

export default function Conversations() {
  const { data: convs, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const { data } = await api.get('/conversations')
      return data
    }
  })

  if (isLoading) return <div className="text-center py-20">Loading chats...</div>

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem' }}>Messages</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'hsl(var(--primary))', fontSize: '0.875rem' }}>
          <Shield size={16} /> E2E Encrypted
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {(!convs || convs.length === 0) ? (
          <div className="text-center py-20 auth-card">
            <MessageSquare size={48} className="label" style={{ marginBottom: '1rem' }} />
            <p className="label">No conversations yet. Start vibing!</p>
          </div>
        ) : (
          convs.map((c: any) => {
            const partner = c.participants[0] // Simplified for MVP
            return (
              <Link 
                key={c.id} 
                to={`/chat/${c.id}`} 
                style={{ 
                  textDecoration: 'none', 
                  backgroundColor: 'hsl(var(--card))', 
                  padding: '1.25rem', 
                  borderRadius: '1rem', 
                  border: '1px solid hsl(var(--border) / 0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  transition: 'transform 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                <div style={{ width: '3.5rem', height: '3.5rem', borderRadius: '50rem', backgroundColor: 'hsl(var(--secondary))', overflow: 'hidden' }}>
                  <img src={partner?.profile?.photos?.[0]?.cdnUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0, color: 'white' }}>{partner?.profile?.displayName || 'Velvet Partner'}</h3>
                  <p className="label" style={{ margin: 0, fontSize: '0.875rem' }}>Click to unmask and chat...</p>
                </div>
              </Link>
            )
          })
        )}
      </div>
    </div>
  )
}
