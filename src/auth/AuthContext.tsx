import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import * as authApi from '../api/auth'
import { setSessionExpiredHandler } from '../lib/apiClient'
import { isApiError } from '../lib/errors'
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
      .catch((err: unknown) => {
        if (cancelled) return
        // Only an auth rejection proves the session is dead. A network error
        // (offline reload, cold-start timeout) must never delete a possibly
        // valid refresh token — the next boot or login retries it.
        if (isApiError(err) && err.status === 401) clearTokens()
        setUser(null)
        setStatus('unauthenticated')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string): Promise<User> => {
    await authApi.login(email, password)
    try {
      const me = await authApi.fetchMe()
      setUser(me)
      setStatus('authenticated')
      return me
    } catch (err) {
      // /login issued tokens but /me failed (stale-flow wipe, network blip):
      // never leave a half-logged-in token pair behind — the next attempt
      // starts from a clean slate instead of a zombie session.
      clearTokens()
      throw err
    }
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