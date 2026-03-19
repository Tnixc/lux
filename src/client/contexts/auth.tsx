import { createContext, useContext, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, ApiError, queryKeys } from '../lib/api'

interface User {
  id: string
  login: string
  name: string | null
  avatarUrl: string | null
}

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: () => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  const { data, isLoading, isError, error } = useQuery<{ user: User }>({
    queryKey: queryKeys.auth,
    queryFn: async () => {
      try {
        return await apiGet<{ user: User }>('/api/auth/me')
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          return { user: null as unknown as User }
        }
        throw e
      }
    },
    retry: false,
    staleTime: Infinity
  })

  const user = data?.user ?? null

  const login = () => {
    window.location.assign('/api/auth/login')
  }

  const logout = async () => {
    await apiPost('/api/auth/logout')
    queryClient.invalidateQueries({ queryKey: queryKeys.auth })
    queryClient.resetQueries()
  }

  const value: AuthContextValue = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, login } = useAuth()

  if (isLoading) {
    return (
      <div className='flex items-center justify-center h-screen bg-background'>
        <div className='animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full' />
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className='flex flex-col items-center justify-center h-screen bg-background gap-4'>
        <span className='text-2xl font-bold tracking-tight'>lux</span>
        <p className='text-sm text-muted-foreground'>Sign in to continue</p>
        <button
          onClick={login}
          className='inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors'
        >
          Sign in with GitHub
        </button>
      </div>
    )
  }

  return <>{children}</>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

export function useUser(): User {
  const { user } = useAuth()
  if (!user) {
    throw new Error('useUser must be used within an authenticated context')
  }
  return user
}
