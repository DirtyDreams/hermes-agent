import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { UserPlus } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth'

export default function Register() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    phone: '',
    dateOfBirth: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  
  const navigate = useNavigate()
  const setAuth = useAuthStore((state) => state.setAuth)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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

  return (
    <div className="auth-container">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="auth-card"
      >
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center p-3 rounded-full mb-4" style={{ backgroundColor: 'hsla(var(--primary), 0.1)', color: 'hsl(var(--primary))' }}>
            <UserPlus size={24} />
          </div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700 }}>Create account</h1>
          <p className="label" style={{ marginTop: '0.5rem' }}>Join Velvet today and find your tribe</p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div style={{ color: 'hsl(var(--destructive))', fontSize: '0.875rem', marginBottom: '1rem', textAlign: 'center' }}>{error}</div>}
          
          <div className="input-group">
            <label className="label">Email address</label>
            <input 
              type="email" 
              className="input" 
              placeholder="name@example.com"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              required
              data-testid="email"
            />
          </div>

          <div className="input-group">
            <label className="label">Phone number</label>
            <input 
              type="tel" 
              className="input" 
              placeholder="+1 555 123 4567"
              value={formData.phone}
              onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              required
              data-testid="phone"
            />
          </div>

          <div className="input-group">
            <label className="label">Password</label>
            <input 
              type="password" 
              className="input" 
              placeholder="••••••••"
              value={formData.password}
              onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
              required
              data-testid="password"
            />
          </div>

          <div className="input-group">
            <label className="label">Date of Birth</label>
            <input 
              type="date" 
              className="input" 
              value={formData.dateOfBirth}
              onChange={(e) => setFormData(prev => ({ ...prev, dateOfBirth: e.target.value }))}
              required
              data-testid="dob"
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <div className="text-center mt-4">
          <p className="label">
            Already have an account? <Link to="/login" className="link">Sign in</Link>
          </p>
        </div>
      </motion.div>
    </div>
  )
}
