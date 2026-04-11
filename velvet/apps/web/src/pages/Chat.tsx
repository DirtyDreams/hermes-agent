import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useEncryption } from '../hooks/useEncryption'
import { Send, Shield, Lock, Eye, EyeOff } from 'lucide-react'
import { io, Socket } from 'socket.io-client'
import { motion, AnimatePresence } from 'framer-motion'

export default function Chat() {
  const { id } = useParams()
  const queryClient = useQueryClient()
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<any[]>([])
  const [isReady, setIsReady] = useState(false)
  const { initialize, encryptMessage, decryptMessage } = useEncryption()
  const socketRef = useRef<Socket | null>(null)

  const { data: conversation, refetch } = useQuery({
    queryKey: ['conversation', id],
    queryFn: async () => {
      const { data } = await api.get(`/conversations/${id}`)
      return data
    }
  })

  const unmaskMutation = useMutation({
    mutationFn: () => api.patch(`/conversations/${id}/unmask`),
    onSuccess: () => {
      refetch()
    }
  })

  useEffect(() => {
    const start = async () => {
      // 1. Initialize E2E Identity
      const keys = await initialize()
      setIsReady(true)

      // 2. Register Public Key if not already set (Simplified for MVP)
      if (conversation) {
        const isParticipantA = conversation.match.userAId === sessionStorage.getItem('velvet_user_id')
        const currentKey = isParticipantA ? conversation.keyA : conversation.keyB
        
        if (!currentKey || currentKey !== keys.publicKey) {
          await api.post(`/conversations/${id}/keys`, { publicKey: keys.publicKey })
        }
      }

      // 3. Connect socket
      socketRef.current = io('http://localhost:3000', {
        withCredentials: true,
        extraHeaders: {
          Authorization: `Bearer ${sessionStorage.getItem('velvet_access_token')}`
        }
      })

      socketRef.current.on('message:receive', async (msg) => {
        try {
          // Identify sender PK
          const senderPk = msg.senderId === conversation?.match?.userAId 
            ? conversation?.keyA 
            : conversation?.keyB

          if (senderPk) {
            const decrypted = await decryptMessage(msg.encryptedContent, msg.nonce, senderPk)
            setMessages(prev => [...prev, { ...msg, content: decrypted }])
          } else {
            setMessages(prev => [...prev, { ...msg, content: '[Encrypted Channel Unstable]' }])
          }
        } catch (err) {
          console.error('Decryption failed', err)
          setMessages(prev => [...prev, { ...msg, content: '[Decryption Error]' }])
        }
      })
    }

    if (conversation) start()

    return () => { socketRef.current?.disconnect() }
  }, [id, conversation, initialize, decryptMessage])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim() || !id || !conversation) return

    try {
      const recipientPk = conversation.keyA || conversation.keyB // Simplified for MVP
      if (!recipientPk) throw new Error('Recipient public key missing')

      const { encryptedContent, nonce } = await encryptMessage(message, recipientPk)
      
      await api.post(`/conversations/${id}/messages`, {
        content: encryptedContent,
        nonce
      })
      
      setMessages(prev => [...prev, { content: message, isMe: true, id: Date.now() }])
      setMessage('')
    } catch (err) {
      console.error('Send failed', err)
    }
  }

  const otherUser = conversation?.match?.userA?.profile?.displayName ? conversation.match.userA : conversation?.match?.userB
  const isOtherUnmasked = conversation?.isUnmaskedA || conversation?.isUnmaskedB // Mutation would update this

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 8rem)', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', borderBottom: '1px solid hsl(var(--border) / 0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ position: 'relative', width: '3rem', height: '3rem' }}>
            <motion.div 
              animate={{ 
                filter: isOtherUnmasked ? 'blur(0px)' : 'blur(8px)',
                scale: isOtherUnmasked ? 1 : 0.95 
              }}
              transition={{ duration: 1, ease: "circOut" }}
              style={{ 
                width: '100%', 
                height: '100%', 
                borderRadius: '50rem', 
                backgroundColor: 'hsl(var(--secondary))',
                overflow: 'hidden'
              }}
            >
              {otherUser?.profile?.avatarUrl && (
                <img src={otherUser.profile.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
            </motion.div>
            {!isOtherUnmasked && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                <EyeOff size={16} style={{ opacity: 0.5 }} />
              </div>
            )}
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>
              {isOtherUnmasked ? otherUser?.profile?.displayName : 'Incognito User'}
            </h2>
            <p style={{ margin: 0, fontSize: '0.75rem', opacity: 0.6 }}>
              {isOtherUnmasked ? 'Identity Revealed' : 'End-to-end encrypted'}
            </p>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {!isOtherUnmasked && (
            <button 
              onClick={() => unmaskMutation.mutate()}
              disabled={unmaskMutation.isPending}
              className="btn" 
              style={{ 
                fontSize: '0.75rem', 
                padding: '0.5rem 1rem', 
                backgroundColor: 'hsl(var(--primary) / 0.1)', 
                color: 'hsl(var(--primary))',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <Eye size={14} /> Reveal Identity
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'hsl(var(--primary))', fontSize: '0.75rem' }}>
            <Shield size={14} />
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <AnimatePresence>
          {messages.map((m, i) => (
            <motion.div 
              key={i} 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              style={{ 
                alignSelf: m.isMe ? 'flex-end' : 'flex-start',
                maxWidth: '70%',
                backgroundColor: m.isMe ? 'hsl(var(--primary))' : 'hsl(var(--secondary))',
                padding: '0.75rem 1rem',
                borderRadius: m.isMe ? '1.25rem 1.25rem 0 1.25rem' : '1.25rem 1.25rem 1.25rem 0',
                color: 'white',
                position: 'relative',
                boxShadow: '0 4px 12px hsl(var(--foreground) / 0.05)'
              }}
            >
              {m.content}
              {!m.isMe && <Lock size={10} style={{ position: 'absolute', bottom: '2px', right: '5px', opacity: 0.5 }} />}
            </motion.div>
          ))}
        </AnimatePresence>
        {!isReady && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="text-center label"
          >
            Initializing secure tunnel...
          </motion.div>
        )}
      </div>

      <form onSubmit={handleSend} style={{ display: 'flex', gap: '1rem', padding: '1.5rem', borderTop: '1px solid hsl(var(--border) / 0.5)' }}>
        <input 
          className="input" 
          placeholder="Type a secure message..." 
          value={message}
          onChange={e => setMessage(e.target.value)}
          style={{ flex: 1 }}
        />
        <button type="submit" className="btn btn-primary" style={{ width: 'auto', padding: '0 1.5rem' }}>
          <Send size={20} />
        </button>
      </form>
    </div>
  )
}
