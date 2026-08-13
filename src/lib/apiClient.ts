import { API_URL } from '../features/live-map/config'
import { getAccessToken, getRefreshToken, setTokens } from './tokens'
import { ApiError, friendlyError } from './errors'

interface RequestOptions {
  method?: string
  body?: unknown
  auth?: boolean
  headers?: Record<string, string>
  /** Set to false to skip the automatic single-flight token refresh on 401. */
  retryOnAuth?: boolean
}

interface ApiEnvelope<T> {
  success: boolean
  data?: T
  meta?: { page: number; limit: number; total: number }
  message?: string
  errorCode?: string
}

let sessionExpiredHandler: (() => void) | null = null

/** Registered by AuthProvider so an expired session redirects to /login. */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler
}

let refreshInFlight: Promise<boolean> | null = null

/**
 * Single-flight refresh: concurrent 401s share one refresh attempt so an
 * expired access token is never refreshed more than once per expiry window.
 */
export async function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

async function doRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false
  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) return false
    const json = (await res.json()) as { data?: { accessToken: string; refreshToken: string } }
    if (!json.data) return false
    setTokens(json.data.accessToken, json.data.refreshToken)
    return true
  } catch {
    return false
  }
}

async function notifyExpired(): Promise<void> {
  sessionExpiredHandler?.()
}

async function doRequest<T>(path: string, options: RequestOptions): Promise<T> {
  const auth = options.auth !== false
  const token = getAccessToken()

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  const text = await res.text()
  let json: ApiEnvelope<T> | null = null
  if (text) {
    try {
      json = JSON.parse(text) as ApiEnvelope<T>
    } catch {
      json = null
    }
  }

  if (!res.ok) {
    const status = res.status
    const errorCode = json?.errorCode ?? ''
    const message = json?.message ?? ''
    throw new ApiError(status, errorCode, friendlyError(status, errorCode, message))
  }

  if (json && json.success && json.data !== undefined) {
    // Preserve the pagination envelope for list endpoints.
    if (json.meta) return { data: json.data as T, meta: json.meta } as T
    return json.data as T
  }
  // Some endpoints (e.g. GET /auth/me) may resolve inside `data`; others
  // return their payload directly. Fall back to the full body for safety.
  return (json?.data ?? json) as T
}

/**
 * Central API client. Attaches the access token automatically and transparently
 * refreshes it once when it expires — but never loops: a failed refresh clears
 * the session and redirects to /login.
 */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const retry = options.retryOnAuth !== false
  try {
    return await doRequest<T>(path, { ...options, retryOnAuth: false })
  } catch (err) {
    if (!retry) throw err
    if (err instanceof ApiError && err.status === 401) {
      const refreshed = await refreshSession()
      if (refreshed) {
        return doRequest<T>(path, { ...options, retryOnAuth: false })
      }
      await notifyExpired()
      throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has expired. Please sign in again.')
    }
    throw err
  }
}