import axios from 'axios'
import { toast } from '@/components/ui/use-toast'

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      window.location.href = '/login'
    } else if (error.response?.data?.error) {
      toast({
        title: 'Error',
        description: error.response.data.error,
        variant: 'destructive',
      })
    } else {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      })
    }
    return Promise.reject(error)
  }
)

export default api