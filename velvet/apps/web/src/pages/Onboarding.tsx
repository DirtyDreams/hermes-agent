import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FaceBlur } from '../components/FaceBlur/FaceBlur'
import { loadFaceDetection } from '../components/FaceBlur/useFaceBlur'
import { ShieldCheck, Camera } from 'lucide-react'
import { api } from '../lib/api'
import { useNavigate } from 'react-router-dom'

export default function Onboarding() {
  const [step, setStep] = useState(1)
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [age, setAge] = useState<number>(25)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    // Background pre-load the models
    loadFaceDetection().catch(err => console.error('Failed to pre-load face detector', err))
  }, [])

  const handleFinish = async () => {
    setLoading(true)
    try {
      await api.patch('/profiles/me', {
        displayName,
        bio,
        age,
        identityVerified: true, // Mocked for MVP
      })
      navigate('/')
    } catch (err) {
      console.error('Profile creation failed', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>Welcome to Velvet</h1>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ 
              width: '2rem', height: '0.5rem', 
              borderRadius: '1rem', 
              backgroundColor: step >= i ? 'hsl(var(--primary))' : 'hsl(var(--border))' 
            }} />
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="auth-card"
            style={{ maxWidth: '100%' }}
          >
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <ShieldCheck size={48} color="hsl(var(--primary))" style={{ marginBottom: '1rem' }} />
              <h2>Privacy First</h2>
              <p className="label">Your photos are blurred on your device before they ever reach our servers. You choose when to unmask.</p>
            </div>
            <button onClick={() => setStep(2)} className="btn btn-primary">I understand, let's go</button>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="auth-card"
            style={{ maxWidth: '100%' }}
          >
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <Camera size={48} color="hsl(var(--primary))" style={{ marginBottom: '1rem' }} />
              <h2>Upload blurred profile photo</h2>
              <p className="label">Select a clear photo. We'll automatically pixelate it to keep your identity safe until a match.</p>
            </div>
            
            <div style={{ border: '2px dashed hsl(var(--border))', borderRadius: '1rem', padding: '2rem', textAlign: 'center' }}>
              <FaceBlur onBlurredFile={async (file) => {
                setLoading(true)
                try {
                  // 1. Get presigned URL
                  const { data: { uploadUrl, storageKey } } = await api.post('/media/upload-url', {
                    fileName: file.name,
                    contentType: file.type,
                    purpose: 'PROFILE_PICTURE'
                  })

                  // 2. Upload to S3
                  await fetch(uploadUrl, {
                    method: 'PUT',
                    body: file,
                    headers: { 'Content-Type': file.type }
                  })

                  // 3. Confirm
                  await api.post('/media/confirm', {
                    storageKey,
                    purpose: 'PROFILE_PICTURE',
                    isBlurred: true
                  })

                  setStep(3)
                } catch (err) {
                  console.error('Upload failed', err)
                } finally {
                  setLoading(false)
                }
              }} />
            </div>

            <button onClick={() => setStep(3)} className="btn btn-primary mt-4" disabled={loading}>
              {loading ? 'Uploading...' : 'Continue'}
            </button>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="auth-card"
            style={{ maxWidth: '100%' }}
          >
            <h2>Complete your profile</h2>
            <div className="input-group">
              <label className="label">Display Name</label>
              <input 
                className="input" 
                value={displayName} 
                onChange={e => setDisplayName(e.target.value)} 
                placeholder="How should others call you?"
              />
            </div>
            <div className="input-group">
              <label className="label">Age</label>
              <input 
                type="number" 
                className="input" 
                value={age} 
                onChange={e => setAge(parseInt(e.target.value))} 
              />
            </div>
            <div className="input-group">
              <label className="label">Bio</label>
              <textarea 
                className="input" 
                style={{ minHeight: '100px', resize: 'vertical' }}
                value={bio} 
                onChange={e => setBio(e.target.value)} 
                placeholder="What sets you apart?"
              />
            </div>
            <button onClick={handleFinish} className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : 'Enter Velvet'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
