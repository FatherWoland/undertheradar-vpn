import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from './api'

interface User {
  id: string
  email: string
  username: string
  role: 'admin' | 'user'
  status: string
}

interface AuthStore {
  user: User | null
  token: string | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  checkAuth: () => Promise<void>
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: true,

      login: async (email: string, password: string) => {
        const response = await api.post('/auth/login', { email, password })
        const { user, token } = response.data
        
        set({ user, token })
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`
      },

      logout: () => {
        set({ user: null, token: null })
        delete api.defaults.headers.common['Authorization']
      },

      checkAuth: async () => {
        const token = get().token
        if (!token) {
          set({ isLoading: false })
          return
        }

        try {
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`
          const response = await api.get('/auth/me')
          set({ user: response.data.user, isLoading: false })
        } catch (error) {
          set({ user: null, token: null, isLoading: false })
          delete api.defaults.headers.common['Authorization']
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token }),
    }
  )
)