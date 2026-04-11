import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Heart, Settings, Users, Shield, Edit3, Save } from 'lucide-react'
import { api } from '../lib/api'

export default function CouplePortal() {
  const [editing, setEditing] = useState(false)
  const [formData, setFormData] = useState({
    displayName: '',
    bio: ''
  })

  const { data: couple, isLoading, refetch } = useQuery({
    queryKey: ['couple'],
    queryFn: async () => {
      const { data } = await api.get('/couples/me')
      setFormData({
        displayName: data.profile?.displayName || '',
        bio: data.profile?.bio || ''
      })
      return data
    }
  })

  const updateProfile = useMutation({
    mutationFn: (data: typeof formData) => api.patch(`/profiles/${couple.profile.id}`, data),
    onSuccess: () => {
      setEditing(false)
      refetch()
    }
  })

  if (isLoading) return <div className="p-8 text-center">Loading the bond...</div>
  if (!couple) return <div className="p-8 text-center auth-card">No relationship found. <a href="/couple/invite" className="link">Establish a link?</a></div>

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem 1rem' }}>
      {/* Header / Hero */}
      <div className="auth-card" style={{ padding: '3rem', position: 'relative', overflow: 'hidden', marginBottom: '2rem' }}>
        <div style={{ position: 'absolute', top: '-50px', right: '-50px', opacity: 0.05 }}>
          <Heart size={300} fill="currentColor" />
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '3rem', position: 'relative' }}>
          {/* Dual Avatars */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ width: '8rem', height: '8rem', borderRadius: '50%', backgroundColor: 'hsl(var(--secondary))', border: '4px solid hsl(var(--background))', overflow: 'hidden', zIndex: 2 }}>
              {couple.partner1.profile?.avatarUrl ? <img src={couple.partner1.profile.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Users size={48} style={{ margin: '2rem auto', opacity: 0.2 }} />}
            </div>
            <div style={{ width: '8rem', height: '8rem', borderRadius: '50%', backgroundColor: 'hsl(var(--secondary))', border: '4px solid hsl(var(--background))', overflow: 'hidden', marginLeft: '-2rem', zIndex: 1 }}>
              {couple.partner2.profile?.avatarUrl ? <img src={couple.partner2.profile.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Users size={48} style={{ margin: '2rem auto', opacity: 0.2 }} />}
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
              <h1 style={{ fontSize: '2.5rem', fontWeight: 800 }}>{couple.profile?.displayName || 'The Bond'}</h1>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.25rem 0.75rem', borderRadius: '50rem', backgroundColor: '#10b981', color: 'white' }}>ACTIVE</span>
            </div>
            <p className="label" style={{ fontSize: '1.125rem' }}>A shared fortress since {new Date(couple.createdAt).toLocaleDateString()}</p>
          </div>

          <button onClick={() => setEditing(!editing)} className="btn btn-outline" style={{ width: 'auto' }}>
            {editing ? 'Cancel' : <><Edit3 size={18} /> Edit Shared Profile</>}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
        {/* Sidebar / Stats */}
        <div className="flex flex-col gap-1rem">
          <div className="auth-card" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Shield size={18} color="hsl(var(--primary))" /> Security Status
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="label">E2EE Handshake</span>
                <span style={{ color: '#10b981', fontWeight: 600 }}>Verified</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="label">Access Control</span>
                <span style={{ fontWeight: 600 }}>Mutual Only</span>
              </div>
            </div>
          </div>

          <div className="auth-card" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
               <Users size={18} color="hsl(var(--primary))" /> Relationship Type
            </h3>
            <div className="p-4 rounded-lg bg-secondary/10" style={{ backgroundColor: 'hsla(var(--secondary), 0.1)', textAlign: 'center' }}>
               <span style={{ fontWeight: 700, fontSize: '1.25rem' }}>Classic Dynamic</span>
            </div>
          </div>
        </div>

        {/* Main Content / Profile Editor */}
        <div className="auth-card" style={{ padding: '2.5rem' }}>
           <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '2rem' }}>Shared Identity Settings</h3>
           
           <div className="input-group">
             <label className="label">Shared Display Name</label>
             <input 
               disabled={!editing}
               className="input" 
               value={formData.displayName}
               onChange={e => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
             />
           </div>

           <div className="input-group">
             <label className="label">Our Shared Story (Bio)</label>
             <textarea 
               disabled={!editing}
               className="input" 
               style={{ height: '150px', resize: 'none' }}
               value={formData.bio}
               onChange={e => setFormData(prev => ({ ...prev, bio: e.target.value }))}
             />
           </div>

           {editing && (
             <motion.button
               initial={{ opacity: 0, y: 10 }}
               animate={{ opacity: 1, y: 0 }}
               onClick={() => updateProfile.mutate(formData)}
               className="btn btn-primary"
               disabled={updateProfile.isPending}
             >
               <Save size={18} /> {updateProfile.isPending ? 'Saving Bond...' : 'Save Relationship Details'}
             </motion.button>
           )}
        </div>
      </div>
    </div>
  )
}
