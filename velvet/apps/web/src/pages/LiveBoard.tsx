import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Radio, Send, Zap, Shield, Clock } from 'lucide-react'
import { io, Socket } from 'socket.io-client'

interface Shout {
  id: string
  content: string
  nickname: string
  timestamp: string
  isPremium?: boolean
}

export default function LiveBoard() {
  const [shouts, setShouts] = useState<Shout[]>([])
  const [newShout, setNewShout] = useState('')
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    socketRef.current = io('http://localhost:3000', {
      withCredentials: true,
      extraHeaders: {
        Authorization: `Bearer ${sessionStorage.getItem('velvet_access_token')}`
      }
    })

    socketRef.current.on('shout:new', (shout: Shout) => {
      setShouts(prev => [shout, ...prev].slice(0, 50))
    })

    return () => { socketRef.current?.disconnect() }
  }, [])

  const handlePost = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newShout.trim()) return
    socketRef.current?.emit('shout:post', { content: newShout })
    setNewShout('')
  }

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '2rem 1rem' }}>
      <header style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: '50rem', backgroundColor: 'hsla(var(--primary), 0.1)', color: 'hsl(var(--primary))', marginBottom: '1rem' }}>
          <Radio size={16} className="animate-pulse" />
          <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Live Pulse</span>
        </div>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>The Board</h1>
        <p className="label">A global echo of the Velvet community</p>
      </header>

      <form onSubmit={handlePost} style={{ position: 'relative', marginBottom: '3rem' }}>
        <textarea
          value={newShout}
          onChange={(e) => setNewShout(e.target.value)}
          placeholder="What's your secret?"
          maxLength={280}
          className="input"
          style={{ height: '120px', padding: '1.5rem', paddingTop: '1.5rem', resize: 'none', fontSize: '1.125rem' }}
        />
        <div style={{ position: 'absolute', bottom: '1rem', right: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.75rem', opacity: 0.4 }}>{newShout.length}/280</span>
          <button type="submit" className="btn btn-primary" style={{ width: 'auto', padding: '0.5rem 1.5rem', borderRadius: '50rem' }}>
            <Zap size={18} />
          </button>
        </div>
      </form>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <AnimatePresence initial={false}>
          {shouts.map((shout) => (
            <motion.div
              key={shout.id}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="auth-card"
              style={{ padding: '1.5rem', margin: 0, position: 'relative', overflow: 'hidden' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '2rem', height: '2rem', borderRadius: '50%', backgroundColor: 'hsl(var(--secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Shield size={12} style={{ opacity: 0.5 }} />
                  </div>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{shout.nickname}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', opacity: 0.4, fontSize: '0.75rem' }}>
                  <Clock size={12} />
                  <span>Just now</span>
                </div>
              </div>
              <p style={{ fontSize: '1.25rem', lineHeight: 1.5, margin: 0 }}>{shout.content}</p>
              
              {shout.isPremium && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, hsl(var(--primary)), transparent)' }} />
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {shouts.length === 0 && (
          <div className="text-center py-12" style={{ opacity: 0.3 }}>
            <Radio size={48} style={{ margin: '0 auto 1rem' }} />
            <p>Silence is golden, but whispers are better.</p>
          </div>
        )}
      </div>
    </div>
  )
}
