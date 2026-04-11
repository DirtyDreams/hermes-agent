import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from './store/auth'
import Login from './pages/Login'
import Register from './pages/Register'
import HomeTimeline from './pages/HomeTimeline'
import DiscoveryFeed from './pages/DiscoveryFeed'
import Conversations from './pages/Conversations'
import Chat from './pages/Chat'
import Onboarding from './pages/Onboarding'
import LiveBoard from './pages/LiveBoard'
import ProfileView from './pages/ProfileView'
import CoupleInvite from './pages/CoupleInvite'
import CouplePortal from './pages/CouplePortal'
import EconomyDashboard from './pages/EconomyDashboard'
import IdentityVerification from './pages/IdentityVerification'
import Layout from './components/Layout'

const queryClient = new QueryClient()

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }>
            <Route index element={<HomeTimeline />} />
            <Route path="discovery" element={<DiscoveryFeed />} />
            <Route path="onboarding" element={<Onboarding />} />
            <Route path="board" element={<LiveBoard />} />
            <Route path="couple/invite" element={<CoupleInvite />} />
            <Route path="couple/portal" element={<CouplePortal />} />
            <Route path="economy" element={<EconomyDashboard />} />
            <Route path="verify" element={<IdentityVerification />} />
            <Route path="conversations" element={<Conversations />} />
            <Route path="chat/:id" element={<Chat />} />
            <Route path="profile/:userId" element={<ProfileView />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
