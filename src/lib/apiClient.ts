import { API_URL } from '../features/live-map/config'
import { getAccessToken, getRefreshToken, setTokens } from './tokens'
import { ApiError, friendlyError } from './errors'
import { startRequest, endRequest } from './loadingState'

export interface RequestOptions {
  method?: string
  body?: unknown
  auth?: boolean
  headers?: Record<string, string>
  /** Set to false to skip the automatic single-flight token refresh on 401. */
  retryOnAuth?: boolean
  /** Background/polling reads that have their own in-UI loading state. Quiet
   *  requests never trigger the GlobalLoader overlay (which blocks the whole
   *  screen), so a silent members poll can't flash "Loading…" every few
   *  seconds on top of the page the user is interacting with. */
  quiet?: boolean
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

/** Upper bound for a single HTTP request. A dropped network (e.g. switching
 * Wi-Fi) can otherwise leave a page stuck loading indefinitely. */
const REQUEST_TIMEOUT_MS = 15_000

/** fetch() with a hard timeout. A network transition that silently swallows
 * requests surfaces as a network error instead of a hanging promise. */
async function fetchWithTimeout(input: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new TypeError('The request timed out. Check your connection and try again.')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

// Network is restored after a network switch — let any stale in-flight refresh
// settle so past failures never poison the next request.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    refreshInFlight = null
  })
}

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
    const res = await fetchWithTimeout(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) return false
    const json = (await res.json()) as { data?: { accessToken: string; refreshToken: string } }
    if (!json.data) return false
    setTokens(json.data.accessToken, json.data.refreshToken)
    return true
  } catch (err) {
    // A network failure while refreshing must not destroy a still-valid session.
    if (err instanceof TypeError) throw err
    return false
  }
}

async function notifyExpired(): Promise<void> {
  sessionExpiredHandler?.()
}

async function doRequest<T>(path: string, options: RequestOptions): Promise<T> {
  const auth = options.auth !== false
  const token = getAccessToken()

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new TypeError('You are offline. Check your connection and try again.')
  }

  const res = await fetchWithTimeout(`${API_URL}${path}`, {
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

  // A 200 with a body that is not JSON is not valid API data — it usually means
  // a proxy/captive-portal page answered while the backend was unreachable.
  if (text && json === null) {
    throw new TypeError('The server returned an invalid response. Please try again.')
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
 *
 * Tracks global loading state so the GlobalLoader overlay can show while
 * requests are in flight, preventing double-clicks.
 */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const quiet = options.quiet === true
  if (!quiet) startRequest()
  // Snapshot the session this request belongs to. If a newer login stored
  // fresh tokens while this (stale) request was in flight, the expiry handler
  // must not wipe them — that race is exactly "first login fails, second
  // succeeds": a dying restore flow erasing a just-issued session.
  const accessBefore = getAccessToken()
  const refreshBefore = getRefreshToken()
  try {
    const retry = options.retryOnAuth !== false
    try {
      return await doRequest<T>(path, { ...options, retryOnAuth: false })
    } catch (err) {
      if (!retry) throw err
      if (err instanceof ApiError && err.status === 401) {
        // A refresh that fails with a network error (e.g. mid network switch)
        // rejects here and propagates as a network error — the session is still
        // valid, so it must not be signed out.
        const refreshed = await refreshSession()
        if (refreshed) {
          return doRequest<T>(path, { ...options, retryOnAuth: false })
        }
        if (getAccessToken() === accessBefore && getRefreshToken() === refreshBefore) {
          await notifyExpired()
        }
        throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has expired. Please sign in again.')
      }
      throw err
    }
  } finally {
    if (!quiet) endRequest()
  }
}