import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Link } from 'react-router-dom'
import { MessageSquare, Shield, Lock } from 'lucide-react'

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
            const currentUserId = sessionStorage.getItem('velvet_user_id')
            const isUserA = c.match.userAId === currentUserId
            const partner = isUserA ? c.match.userB : c.match.userA
            const isPartnerUnmasked = isUserA ? c.isUnmaskedB : c.isUnmaskedA
            const lastMsg = c.messages?.[0]

            return (
              <Link 
                key={c.id} 
                to={`/chat/${c.id}`} 
                className="auth-card"
                style={{ 
                  textDecoration: 'none', 
                  padding: '1.25rem', 
                  borderRadius: '1.25rem', 
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1.25rem',
                  marginBottom: '1rem'
                }}
              >
                <div style={{ position: 'relative', width: '3.5rem', height: '3.5rem' }}>
                  <div style={{ 
                    width: '100%', 
                    height: '100%', 
                    borderRadius: '50rem', 
                    backgroundColor: 'hsl(var(--secondary))', 
                    overflow: 'hidden',
                    filter: isPartnerUnmasked ? 'none' : 'blur(4px)'
                  }}>
                    {partner?.profile?.photos?.[0]?.cdnUrl && (
                      <img src={partner.profile.photos[0].cdnUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    )}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <h3 style={{ margin: 0, color: 'white', fontSize: '1.125rem' }}>
                      {isPartnerUnmasked ? partner?.profile?.displayName : 'Incognito Partner'}
                    </h3>
                    <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>
                      {lastMsg ? new Date(lastMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                  <p className="label" style={{ margin: 0, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {lastMsg ? (
                      <>
                        <Lock size={12} /> Encrypted message
                      </>
                    ) : (
                      'Tap to open secure channel'
                    )}
                  </p>
                </div>
              </Link>
            )
          })
        )}
      </div>
    </div>
  )
}
