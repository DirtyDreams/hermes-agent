import { create } from 'zustand'

interface AuthState {
  userId: string | null
  isAuthenticated: boolean
  setAuth: (userId: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  userId: sessionStorage.getItem('velvet_user_id'),
  isAuthenticated: !!sessionStorage.getItem('velvet_user_id'),
  
  setAuth: (userId: string) => {
    sessionStorage.setItem('velvet_user_id', userId)
    set({ userId, isAuthenticated: true })
  },
  
  logout: () => {
    sessionStorage.removeItem('velvet_user_id')
    sessionStorage.removeItem('velvet_access_token')
    sessionStorage.removeItem('velvet_pk')
    sessionStorage.removeItem('velvet_sk')
    set({ userId: null, isAuthenticated: false })
  },
}))
