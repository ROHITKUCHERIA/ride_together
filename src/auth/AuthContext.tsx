import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import * as authApi from '../api/auth'
import { setSessionExpiredHandler } from '../lib/apiClient'
import { clearTokens, getRefreshToken } from '../lib/tokens'
import type { User } from '../types/api'

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

interface AuthContextValue {
  user: User | null
  status: AuthStatus
  login: (email: string, password: string) => Promise<User>
  register: (name: string, email: string, password: string) => Promise<User>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const navigate = useNavigate()

  // Centralized session-expiry handling. Fired by the API client only after a
  // refresh attempt has failed — the session is unrecoverable at that point.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      clearTokens()
      setUser(null)
      setStatus('unauthenticated')
      navigate('/login', { replace: true })
    })
    return () => setSessionExpiredHandler(null)
  }, [navigate])

  // Hydrate the session on boot whenever a refresh token exists. The client
  // transparently refreshes an expired access token during /auth/me.
  useEffect(() => {
    if (!getRefreshToken()) {
      setStatus('unauthenticated')
      return
    }
    let cancelled = false
    authApi
      .fetchMe()
      .then((me) => {
        if (cancelled) return
        setUser(me)
        setStatus('authenticated')
      })
      .catch(() => {
        if (cancelled) return
        clearTokens()
        setUser(null)
        setStatus('unauthenticated')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string): Promise<User> => {
    await authApi.login(email, password)
    const me = await authApi.fetchMe()
    setUser(me)
    setStatus('authenticated')
    return me
  }, [])

  const register = useCallback(async (name: string, email: string, password: string): Promise<User> => {
    const data = await authApi.register({ name, email, password })
    setUser(data.user)
    setStatus('authenticated')
    return data.user
  }, [])

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken()
    clearTokens()
    setUser(null)
    setStatus('unauthenticated')
    if (refreshToken) await authApi.logout(refreshToken)
    navigate('/login', { replace: true })
  }, [navigate])

  const value = useMemo(
    () => ({ user, status, login, register, logout }),
    [user, status, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}