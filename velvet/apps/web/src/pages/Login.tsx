import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LogIn } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  
  const navigate = useNavigate()
  const setAuth = useAuthStore((state) => state.setAuth)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    
    try {
      const { data } = await api.post('/auth/login', { email, password })
      setAuth(data.user.id)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-container">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="auth-card"
      >
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center p-3 rounded-full bg-primary/10 mb-4" style={{ backgroundColor: 'hsla(var(--primary), 0.1)', color: 'hsl(var(--primary))' }}>
            <LogIn size={24} />
          </div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700 }}>Welcome back</h1>
          <p className="label" style={{ marginTop: '0.5rem' }}>Enter your credentials to access your account</p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div style={{ color: 'hsl(var(--destructive))', fontSize: '0.875rem', marginBottom: '1rem', textAlign: 'center' }}>{error}</div>}
          
          <div className="input-group">
            <label className="label">Email address</label>
            <input 
              type="email" 
              className="input" 
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              data-testid="email"
            />
          </div>

          <div className="input-group">
            <label className="label">Password</label>
            <input 
              type="password" 
              className="input" 
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              data-testid="password"
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div className="text-center mt-4">
          <p className="label">
            Don't have an account? <Link to="/register" className="link">Sign up</Link>
          </p>
        </div>
      </motion.div>
    </div>
  )
}
