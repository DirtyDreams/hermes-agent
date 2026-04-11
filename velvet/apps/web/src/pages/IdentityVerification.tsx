import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ShieldCheck, Camera, Check, AlertTriangle, Shield, RefreshCw } from 'lucide-react'
import { api } from '../lib/api'

export default function IdentityVerification() {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const simulateProcess = () => {
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      setSuccess(true)
    }, 3000)
  }

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '4rem 1rem' }}>
      <header style={{ textAlign: 'center', marginBottom: '4rem' }}>
        <motion.div
           initial={{ rotate: -10, opacity: 0 }}
           animate={{ rotate: 0, opacity: 1 }}
           style={{ display: 'inline-flex', padding: '1rem', borderRadius: '1.5rem', backgroundColor: 'hsla(var(--primary), 0.1)', color: 'hsl(var(--primary))', marginBottom: '1.5rem' }}
        >
          <ShieldCheck size={48} />
        </motion.div>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '1rem' }}>The Shield Ritual</h1>
        <p className="label">Prove your physical existence to unlock verified status and exclusive features.</p>
      </header>

      <div className="auth-card" style={{ padding: '0', overflow: 'hidden' }}>
        <AnimatePresence mode="wait">
          {!success ? (
            <motion.div
              key="camera"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ padding: '2.5rem' }}
            >
              <div style={{ marginBottom: '2.5rem' }}>
                <div style={{ 
                  aspectRatio: '3/4', 
                  backgroundColor: 'black', 
                  borderRadius: '1rem', 
                  position: 'relative', 
                  overflow: 'hidden', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center' 
                }}>
                  {/* Mock Camera View */}
                  <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>
                    <Camera size={64} style={{ marginBottom: '1rem' }} />
                    <p>Camera is engaged...</p>
                  </div>

                  {/* Ritual Gesture Guide */}
                  <div style={{ 
                    position: 'absolute', 
                    top: '1rem', 
                    left: '1rem', 
                    right: '1rem', 
                    padding: '1rem', 
                    backgroundColor: 'rgba(0,0,0,0.5)', 
                    backdropFilter: 'blur(4px)',
                    borderRadius: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem'
                  }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '2px solid hsl(var(--primary))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800, color: 'hsl(var(--primary))' }}>
                      P1
                    </div>
                    <span style={{ fontSize: '0.875rem', color: 'white', fontWeight: 500 }}>Hold 3 fingers to your temple</span>
                  </div>

                  {loading && (
                    <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                       <RefreshCw className="animate-spin" size={48} color="hsl(var(--primary))" style={{ marginBottom: '1rem' }} />
                       <p style={{ color: 'white', fontWeight: 600 }}>Analyzing Bio-Markers...</p>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'start', gap: '1rem', padding: '1rem', backgroundColor: 'hsla(var(--primary), 0.05)', borderRadius: '0.75rem' }}>
                   <AlertTriangle size={20} color="hsl(var(--primary))" style={{ flexShrink: 0, marginTop: '0.25rem' }} />
                   <p style={{ fontSize: '0.875rem' }} className="label">Your verification photo is held in secure transient storage. It is never shown to other users.</p>
                </div>
                
                <button 
                  onClick={simulateProcess} 
                  disabled={loading} 
                  className="btn btn-primary w-full"
                >
                  {loading ? 'Processing Ritual...' : 'Capture Ritual Pose'}
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{ padding: '4rem 2.5rem', textAlign: 'center' }}
            >
              <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#10b981', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 2rem' }}>
                <Check size={40} />
              </div>
              <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '1rem' }}>Ritual Complete</h2>
              <p className="label" style={{ marginBottom: '2.5rem' }}>Your physical existence has been verified by the Shield. Your profile will be upgraded within minutes.</p>
              <button 
                onClick={() => window.location.href = '/onboarding'} 
                className="btn btn-outline w-full"
              >
                Return to Profiles
              </button>
            </motion.div>
          )

          }
        </AnimatePresence>
      </div>
    </div>
  )
}
