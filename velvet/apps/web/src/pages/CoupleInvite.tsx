import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link2, Heart, Copy, Check, ShieldCheck, Zap } from 'lucide-react'
import { api } from '../lib/api'

export default function CoupleInvite() {
  const [inviteToken, setInviteToken] = useState<string | null>(null)
  const [inputToken, setInputToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleGenerate = async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.post('/couples/invite')
      setInviteToken(data.inviteToken)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to generate invite')
    } finally {
      setLoading(false)
    }
  }

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputToken.trim()) return
    setLoading(true)
    setError('')
    try {
       await api.post('/couples/accept', { inviteToken: inputToken })
       setSuccess(true)
       setTimeout(() => window.location.href = '/board', 2000)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to accept invite')
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = () => {
    if (!inviteToken) return
    navigator.clipboard.writeText(inviteToken)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '4rem 1rem' }}>
      <header style={{ textAlign: 'center', marginBottom: '4rem' }}>
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{ display: 'inline-flex', padding: '1rem', borderRadius: '50%', backgroundColor: 'hsla(var(--primary), 0.1)', color: 'hsl(var(--primary))', marginBottom: '1.5rem' }}
        >
          <Heart size={40} className="animate-pulse" />
        </motion.div>
        <h1 style={{ fontSize: '3rem', fontWeight: 900, letterSpacing: '-0.02em', marginBottom: '1rem' }}>The Bonding Ritual</h1>
        <p className="label" style={{ fontSize: '1.125rem' }}>Link your soul with your partner to unlock the Couple Fortress</p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        {/* Generate Invite */}
        <motion.div 
          whileHover={{ y: -5 }}
          className="auth-card" 
          style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '2.5rem' }}
        >
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Zap size={20} color="hsl(var(--primary))" /> I have a partner
            </h2>
            <p className="label" style={{ marginBottom: '2rem' }}>Generate a unique ritual token to send to your significant other.</p>
          </div>

          {!inviteToken ? (
            <button onClick={handleGenerate} disabled={loading} className="btn btn-primary">
              Generate Link Token
            </button>
          ) : (
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label className="label">Your Ritual Token</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input readOnly value={inviteToken} className="input" style={{ fontFamily: 'monospace', fontSize: '0.875rem' }} />
                <button onClick={copyToClipboard} className="btn btn-outline" style={{ width: 'auto', padding: '0 1rem' }}>
                  {copied ? <Check size={18} color="#10b981" /> : <Copy size={18} />}
                </button>
              </div>
            </div>
          )}
        </motion.div>

        {/* Accept Invite */}
        <motion.div 
          whileHover={{ y: -5 }}
          className="auth-card" 
          style={{ padding: '2.5rem' }}
        >
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Link2 size={20} color="hsl(var(--primary))" /> My partner invited me
          </h2>
          <p className="label" style={{ marginBottom: '2rem' }}>Enter the token received from your partner to complete the bond.</p>

          <form onSubmit={handleAccept}>
            <div className="input-group">
              <input 
                placeholder="Paste token here..." 
                className="input" 
                value={inputToken}
                onChange={(e) => setInputToken(e.target.value)}
                required
              />
            </div>
            <button type="submit" disabled={loading} className="btn btn-outline w-full" style={{ borderColor: 'hsl(var(--primary))', color: 'hsl(var(--primary))' }}>
              Complete the Bond
            </button>
          </form>
        </motion.div>
      </div>

      <AnimatePresence>
        {(error || success) && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{ 
              marginTop: '4rem', 
              padding: '1.5rem', 
              borderRadius: '1rem', 
              backgroundColor: success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${success ? '#10b981' : '#ef4444'}`,
              display: 'flex',
              alignItems: 'center',
              gap: '1rem'
            }}
          >
            {success ? <ShieldCheck color="#10b981" /> : <Zap color="#ef4444" />}
            <span style={{ fontWeight: 600, color: success ? '#10b981' : '#ef4444' }}>
              {success ? 'Bond established! Teleporting to Board...' : error}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
