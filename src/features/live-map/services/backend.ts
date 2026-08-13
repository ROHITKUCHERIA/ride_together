import {
  ACCESS_TOKEN_OVERRIDE,
  API_URL,
  BACKEND_TRIP_ID,
  DEV_EMAIL,
  DEV_PASSWORD,
} from '../config'
import { getAccessToken, getRefreshToken, setTokens } from '../../../lib/tokens'

/**
 * Resolves the authenticated context (token + identity + trip) for the
 * Socket.IO connection.
 *
 * The real application always uses the authenticated user's JWT stored by the
 * auth layer. The demo login path is used ONLY when no session exists at all
 * (i.e. the unauthenticated demo route), so a real session is never replaced
 * by the demo rider.
 */

export interface AuthContext {
  accessToken: string
  userId: string
  name: string
  tripId: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.message ?? `Request failed: ${res.status}`)
  }
  const json = await res.json()
  return json.data as T
}

async function demoLoginOrRegister(): Promise<string> {
  let res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: DEV_EMAIL, password: DEV_PASSWORD }),
  })
  if (res.status === 401) {
    await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Demo Rider',
        email: DEV_EMAIL,
        password: DEV_PASSWORD,
      }),
    })
    res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: DEV_EMAIL, password: DEV_PASSWORD }),
    })
  }
  if (!res.ok) throw new Error('Unable to sign in to the backend.')
  const json = await res.json()
  setTokens(json.data.accessToken, json.data.refreshToken)
  return json.data.accessToken
}

async function tryRefresh(): Promise<string | null> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return null
  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) return null
    const json = await res.json()
    setTokens(json.data.accessToken, json.data.refreshToken)
    return json.data.accessToken
  } catch {
    return null
  }
}

async function fetchMe(token: string): Promise<{ id: string; name: string } | null> {
  return request<{ id: string; name: string }>('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => null)
}

async function discoverTripId(token: string): Promise<string> {
  const trips = await request<{ id: string }[]>('/api/trips?page=1&limit=50', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!trips.length) {
    throw new Error('You are not a member of any trip yet.')
  }
  return trips[0].id
}

/**
 * Resolves an authenticated context (token + identity + trip) for the
 * Socket.IO connection. `tripIdOverride` pins the selected trip (used by the
 * real /app/trips/:tripId route). Throws when the backend is unreachable.
 */
export async function ensureAuthContext(tripIdOverride?: string): Promise<AuthContext> {
  if (ACCESS_TOKEN_OVERRIDE) {
    setTokens(ACCESS_TOKEN_OVERRIDE, getRefreshToken() ?? '')
  }

  const hadStoredSession = !!(getAccessToken() || getRefreshToken())
  let accessToken = getAccessToken()
  if (!accessToken) accessToken = await demoLoginOrRegister()

  let me = await fetchMe(accessToken)
  if (!me) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      accessToken = refreshed
      me = await fetchMe(accessToken)
    }
  }
  if (!me) {
    // A real session that can no longer refresh must not be replaced by the
    // demo rider. The demo fallback only applies when there was never a session.
    if (hadStoredSession) throw new Error('Your session has expired. Please sign in again.')
    accessToken = await demoLoginOrRegister()
    me = await fetchMe(accessToken)
    if (!me) throw new Error('Unable to authenticate with the backend.')
  }

  const tripId = tripIdOverride || BACKEND_TRIP_ID || (await discoverTripId(accessToken))
  return { accessToken, userId: me.id, name: me.name, tripId }
}