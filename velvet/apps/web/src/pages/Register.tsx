import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { UserPlus, Shield, User, Heart, CheckCircle } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth'
import { generateShieldKeys, storeLocalKeys } from '../lib/crypto'

type Step = 'IDENTITY' | 'DETAILS' | 'SECURITY' | 'VERIFY'

export default function Register() {
  const [step, setStep] = useState<Step>('IDENTITY')
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    phone: '',
    dateOfBirth: '',
    nickname: '',
    accountType: 'MAN' as const,
    publicKey: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [keysGenerated, setKeysGenerated] = useState(false)
  
  const navigate = useNavigate()
  const setAuth = useAuthStore((state) => state.setAuth)

  const handleIdentitySubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (formData.nickname.length < 3) return setError('Nickname too short')
    setStep('DETAILS')
  }

  const handleDetailsSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setStep('SECURITY')
  }

  useEffect(() => {
    if (step === 'SECURITY' && !keysGenerated) {
      const initShield = async () => {
        setLoading(true)
        try {
          const keys = await generateShieldKeys()
          storeLocalKeys(keys)
          setFormData(prev => ({ ...prev, publicKey: keys.publicKey }))
          setKeysGenerated(true)
          // Small delay for effect
          setTimeout(() => {
            setLoading(false)
          }, 1500)
        } catch (err) {
          setError('Failed to generate security shield. Please use a modern browser.')
          setLoading(false)
        }
      }
      initShield()
    }
  }, [step, keysGenerated])

  const handleFinalSubmit = async () => {
    setLoading(true)
    setError('')
    
    try {
      const { data } = await api.post('/auth/register', {
        ...formData,
        dateOfBirth: formData.dateOfBirth ? new Date(formData.dateOfBirth).toISOString() : undefined
      })
      setAuth(data.user.id)
      navigate('/onboarding')
    } catch (err: any) {
      setError(err.response?.data?.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const containerVariants = {
    hidden: { opacity: 0, x: 20 },
    visible: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 }
  }

  return (
    <div className="auth-container">
      <div className="auth-card" style={{ maxWidth: '450px', width: '100%' }}>
        <AnimatePresence mode="wait">
          {step === 'IDENTITY' && (
            <motion.div key="identity" variants={containerVariants} initial="hidden" animate="visible" exit="exit">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center p-3 rounded-full mb-4" style={{ backgroundColor: 'hsla(var(--primary), 0.1)', color: 'hsl(var(--primary))' }}>
                  <User size={24} />
                </div>
                <h1 style={{ fontSize: '1.875rem', fontWeight: 700 }}>Choose your identity</h1>
                <p className="label" style={{ marginTop: '0.5rem' }}>This cannot be changed later</p>
              </div>

              <form onSubmit={handleIdentitySubmit}>
                <div className="input-group">
                  <label className="label">Nickname</label>
                  <input 
                    type="text" 
                    className="input" 
                    placeholder="Enter your handle"
                    value={formData.nickname}
                    onChange={(e) => setFormData(prev => ({ ...prev, nickname: e.target.value }))}
                    required
                  />
                </div>

                <div className="input-group">
                  <label className="label">Account Type</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    {['MAN', 'WOMAN', 'COUPLE', 'NON_BINARY'].map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, accountType: type as any }))}
                        className={`btn ${formData.accountType === type ? 'btn-primary' : 'btn-outline'}`}
                        style={{ padding: '0.5rem', fontSize: '0.75rem' }}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                <button type="submit" className="btn btn-primary mt-4">Continue</button>
              </form>
            </motion.div>
          )}

          {step === 'DETAILS' && (
            <motion.div key="details" variants={containerVariants} initial="hidden" animate="visible" exit="exit">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center p-3 rounded-full mb-4" style={{ backgroundColor: 'hsla(var(--primary), 0.1)', color: 'hsl(var(--primary))' }}>
                  <Heart size={24} />
                </div>
                <h1 style={{ fontSize: '1.875rem', fontWeight: 700 }}>Basic Info</h1>
                <p className="label">Securing your access</p>
              </div>

              <form onSubmit={handleDetailsSubmit}>
                <div className="input-group">
                  <label className="label">Email address</label>
                  <input type="email" className="input" placeholder="name@example.com" value={formData.email} onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))} required />
                </div>
                <div className="input-group">
                  <label className="label">Phone number</label>
                  <input type="tel" className="input" placeholder="+1..." value={formData.phone} onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))} required />
                </div>
                <div className="input-group">
                  <label className="label">Password</label>
                  <input type="password" className="input" placeholder="••••••••" value={formData.password} onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))} required />
                </div>
                <div className="input-group">
                  <label className="label">Date of Birth</label>
                  <input type="date" className="input" value={formData.dateOfBirth} onChange={(e) => setFormData(prev => ({ ...prev, dateOfBirth: e.target.value }))} required />
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button type="button" onClick={() => setStep('IDENTITY')} className="btn btn-outline" style={{ flex: 1 }}>Back</button>
                  <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>Next</button>
                </div>
              </form>
            </motion.div>
          )}

          {step === 'SECURITY' && (
            <motion.div key="security" variants={containerVariants} initial="hidden" animate="visible" exit="exit" className="text-center py-8">
              <div className="mb-6">
                <motion.div
                  animate={{ 
                    scale: [1, 1.1, 1],
                    rotate: loading ? [0, 360] : 0
                  }}
                  transition={{ 
                    scale: { repeat: Infinity, duration: 2 },
                    rotate: { repeat: Infinity, duration: 4, ease: "linear" }
                  }}
                  className="inline-flex items-center justify-center p-6 rounded-full"
                  style={{ backgroundColor: 'hsla(var(--primary), 0.1)', color: 'hsl(var(--primary))' }}
                >
                  <Shield size={48} />
                </motion.div>
              </div>
              
              <h1 style={{ fontSize: '1.875rem', fontWeight: 700, marginBottom: '1rem' }}>
                {loading ? 'Initializing Shield...' : 'Shield Active'}
              </h1>
              <p className="label px-4" style={{ marginBottom: '2rem' }}>
                {loading ? 'Generating your private E2EE keys on this device. These will never be shared with our servers.' : 'Your security keys have been generated and stored locally. You are now protected by the Velvet Fortress.'}
              </p>

              {!loading && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="flex items-center justify-center space-x-2 text-green-500 mb-8" style={{ color: '#10b981' }}>
                    <CheckCircle size={20} />
                    <span style={{ fontWeight: 600 }}>E2EE Ready</span>
                  </div>
                  <button onClick={handleFinalSubmit} className="btn btn-primary w-full">Join the Fortress</button>
                </motion.div>
              )}
              
              {error && <p style={{ color: 'hsl(var(--destructive))', marginTop: '1rem' }}>{error}</p>}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="text-center mt-6 pt-6 border-t" style={{ borderTop: '1px solid hsla(var(--border), 0.5)' }}>
          <p className="label">
            Already have an account? <Link to="/login" className="link">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
