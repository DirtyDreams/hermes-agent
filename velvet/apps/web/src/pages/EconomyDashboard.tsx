import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Landmark, ArrowUpRight, ArrowDownLeft, Zap, Shield, HelpCircle, RefreshCw } from 'lucide-react'
import { api } from '../lib/api'

export default function EconomyDashboard() {
  const queryClient = useQueryClient()
  
  const { data: balanceData, isLoading: balanceLoading } = useQuery({
    queryKey: ['balance'],
    queryFn: async () => {
      const { data } = await api.get('/economy/balance')
      return data
    }
  })

  const { data: transactions, isLoading: transLoading } = useQuery({
    queryKey: ['transactions'],
    queryFn: async () => {
      const { data } = await api.get('/economy/transactions')
      return data
    }
  })

  const topupMutation = useMutation({
    mutationFn: () => api.post('/economy/topup'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['balance'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    }
  })

  if (balanceLoading || transLoading) return <div className="p-8 text-center">Auditing treasury...</div>

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem 1rem' }}>
      <header style={{ marginBottom: '3rem' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '0.5rem' }}>Velvet Treasury</h1>
        <p className="label">Manage your privacy tokens and power-ups.</p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
        {/* Balance Card */}
        <div className="flex flex-col gap-1.5rem">
          <motion.div 
            whileHover={{ scale: 1.02 }}
            className="auth-card" 
            style={{ 
              padding: '2.5rem', 
              background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, #4c1d95 100%)',
              color: 'white',
              border: 'none'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
              <Landmark size={24} opacity={0.8} />
              <Shield size={24} opacity={0.8} />
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
               <span style={{ fontSize: '0.875rem', fontWeight: 600, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Privacy Credits</span>
               <h2 style={{ fontSize: '4rem', fontWeight: 900, lineHeight: 1 }}>{balanceData?.balance || 0}</h2>
            </div>
            <p style={{ fontSize: '0.875rem', opacity: 0.7 }}>≈ Trusted Identity Tier 1</p>
          </motion.div>

          <div className="auth-card" style={{ padding: '2rem' }}>
             <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
               <Zap size={20} color="hsl(var(--primary))" /> Quick Actions
             </h3>
             <div className="flex flex-col gap-0.5rem">
               <button 
                onClick={() => topupMutation.mutate()}
                disabled={topupMutation.isPending}
                className="btn btn-outline w-full" 
                style={{ justifyContent: 'start', display: 'flex', alignItems: 'center', gap: '1rem' }}
               >
                 {topupMutation.isPending ? <RefreshCw className="animate-spin" size={18} /> : <Zap size={18} />}
                 Top-up Credits (+500 reward)
               </button>
               <button className="btn btn-outline w-full" style={{ justifyContent: 'start', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                 <HelpCircle size={18} /> Credit Guide
               </button>
             </div>
          </div>
        </div>

        {/* Transaction History */}
        <div className="auth-card" style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ padding: '2rem', borderBottom: '1px solid hsl(var(--border) / 0.5)' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Ritual Ledger</h3>
          </div>
          
          <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
            {transactions?.length === 0 ? (
              <div style={{ padding: '4rem', textAlign: 'center' }}>
                <p className="label">No transactions in the ledger yet.</p>
              </div>
            ) : (
              transactions?.map((tx: any) => (
                <div 
                  key={tx.id} 
                  style={{ 
                    padding: '1.5rem 2rem', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    borderBottom: '1px solid hsl(var(--border) / 0.3)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <div style={{ 
                      padding: '0.75rem', 
                      borderRadius: '12px', 
                      backgroundColor: tx.amount > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                      color: tx.amount > 0 ? '#10b981' : '#ef4444'
                    }}>
                      {tx.amount > 0 ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}
                    </div>
                    <div>
                      <h4 style={{ fontSize: '1rem', fontWeight: 600 }}>{tx.type}</h4>
                      <p className="label" style={{ fontSize: '0.75rem' }}>{new Date(tx.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                  <span style={{ 
                    fontSize: '1.125rem', 
                    fontWeight: 800,
                    color: tx.amount > 0 ? '#10b981' : 'white'
                  }}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
