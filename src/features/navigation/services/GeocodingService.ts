import { apiRequest } from '../../../lib/apiClient'
import { getAccessToken } from '../../../lib/tokens'
import { NOMINATIM_URL } from '../config'
import type { GeocodeResult } from '../types'

/**
 * Place search behind a service abstraction. Authenticated sessions use the
 * backend geocoding endpoint (GET /api/navigation/geocode); the demo fallback
 * talks to the keyless OSM Nominatim endpoint directly — isolated here.
 */
export async function searchPlaces(query: string, limit = 5): Promise<GeocodeResult[]> {
  const q = (query ?? '').trim()
  if (q.length < 2) return []

  if (hasSession()) {
    try {
      return await apiRequest<GeocodeResult[]>(
        `/api/navigation/geocode?q=${encodeURIComponent(q)}&limit=${limit}`,
        { quiet: true },
      )
    } catch {
      return []
    }
  }
  return directSearch(q, limit)
}

async function directSearch(q: string, limit: number): Promise<GeocodeResult[]> {
  try {
    const url = `${NOMINATIM_URL}/search?format=jsonv2&addressdetails=1&limit=${limit}&q=${encodeURIComponent(q)}`
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'RideTogether/1.0' },
    })
    if (!res.ok) return []
    const rows = (await res.json()) as Array<{ display_name?: string; lat?: string; lon?: string }>
    return rows
      .filter((r) => r.display_name && Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon)))
      .map((r) => ({
        name: r.display_name as string,
        latitude: Number(r.lat),
        longitude: Number(r.lon),
      }))
  } catch {
    return []
  }
}

function hasSession(): boolean {
  try {
    return !!getAccessToken()
  } catch {
    return false
  }
}