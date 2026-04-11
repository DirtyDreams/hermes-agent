// Global types for Velvet MVP
export interface ApiResponse<T = any> {
  status: 'ok' | 'error'
  data?: T
  message?: string
}

export interface UserContext {
  id: string
  emailHash: string
  isCouple: boolean
}
