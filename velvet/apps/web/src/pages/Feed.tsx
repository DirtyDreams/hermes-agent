import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '../lib/api'
import { Heart, X, MapPin } from 'lucide-react'
import { useState } from 'react'

export default function Feed() {
  const { data: profiles, isLoading, refetch } = useQuery({
    queryKey: ['feed'],
    queryFn: async () => {
      const { data } = await api.get('/discovery/feed')
      return data
    }
  })

  const [currentIndex, setCurrentIndex] = useState(0)

  const handleVibe = async (profileId: string, type: 'like' | 'dislike') => {
    try {
      await api.post('/discovery/vibe', { recipientId: profileId, vibeType: type })
      setCurrentIndex(prev => prev + 1)
    } catch (err) {
      console.error('Vibe failed', err)
    }
  }

  if (isLoading) return <div className="text-center py-20">Loading Discovery Feed...</div>
  if (!profiles || profiles.length <= currentIndex) return (
    <div className="text-center py-20">
      <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>You've seen everyone nearby!</h2>
      <p className="label">Check back later or change your filters.</p>
    </div>
  )

  const currentProfile = profiles[currentIndex]

  return (
    <div style={{ maxWidth: '450px', margin: '0 auto' }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={currentProfile.id}
          initial={{ opacity: 0, scale: 0.9, x: 20 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          exit={{ opacity: 0, scale: 0.9, x: -20 }}
          style={{
            backgroundColor: 'hsl(var(--card))',
            borderRadius: '1.5rem',
            overflow: 'hidden',
            border: '1px solid hsl(var(--border) / 0.5)',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)'
          }}
        >
          <div style={{ position: 'relative', aspectRatio: '3/4' }}>
            <img 
              src={currentProfile.photos?.[0]?.cdnUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=450&h=600&auto=format&fit=crop'} 
              alt={currentProfile.displayName}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <div style={{ 
              position: 'absolute', 
              bottom: 0, 
              left: 0, 
              right: 0, 
              padding: '2rem 1.5rem', 
              background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
              color: 'white'
            }}>
              <h2 style={{ fontSize: '2rem', margin: 0 }}>{currentProfile.displayName}, {currentProfile.age}</h2>
              <p style={{ opacity: 0.8, display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
                <MapPin size={16} /> {currentProfile.locationCity}
              </p>
              <p style={{ marginTop: '1rem', lineClamp: 3, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {currentProfile.bio}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', padding: '1.5rem', gap: '1rem' }}>
            <button 
              onClick={() => handleVibe(currentProfile.userId, 'dislike')}
              className="btn" 
              style={{ backgroundColor: 'hsl(var(--secondary))', color: 'white', flex: 1, height: '4rem', borderRadius: '50rem' }}
            >
              <X size={28} />
            </button>
            <button 
              onClick={() => handleVibe(currentProfile.userId, 'like')}
              className="btn btn-primary" 
              style={{ flex: 2, height: '4rem', borderRadius: '50rem' }}
            >
              <Heart size={28} />
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
