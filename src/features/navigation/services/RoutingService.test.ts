// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { calculateRoute } from './RoutingService'
import { getAccessToken } from '../../../lib/tokens'
import { apiRequest } from '../../../lib/apiClient'

const ORIGIN = { latitude: 17.385, longitude: 78.4867 }
const DESTINATION = { latitude: 17.4065, longitude: 78.4772 }

vi.mock('../../../lib/apiClient', () => ({
  apiRequest: vi.fn(),
}))

const apiRequestMock = vi.mocked(apiRequest)

function osrmJson() {
  return new Response(
    JSON.stringify({
      code: 'Ok',
      routes: [
        {
          distance: 4200,
          duration: 900,
          geometry: { coordinates: [[78.4867, 17.385], [78.48, 17.395], [78.4772, 17.4065]] },
        },
      ],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

describe('RoutingService.calculateRoute', () => {
  const originalFetch = globalThis.fetch
  const originalToken = getAccessToken()

  beforeEach(() => {
    // Start every test with an empty session (demo → direct OSRM fallback).
    try {
      localStorage.removeItem('rt_access_token')
    } catch {
      /* jsdom provides localStorage */
    }
    apiRequestMock.mockReset()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    if (originalToken) {
      try {
        localStorage.setItem('rt_access_token', originalToken)
      } catch {
        /* ignore */
      }
    }
  })

  it('returns a normalized route from the backend when a session exists', async () => {
    try {
      localStorage.setItem('rt_access_token', 'abc')
    } catch {
      /* ignore */
    }
    apiRequestMock.mockResolvedValue({
      coordinates: [{ latitude: 17.385, longitude: 78.4867 }],
      distanceMeters: 4200,
      durationSeconds: 900,
      instructions: [],
    })

    const route = await calculateRoute(ORIGIN, DESTINATION)

    expect(apiRequestMock).toHaveBeenCalledWith(
      '/api/navigation/route',
      expect.objectContaining({ body: { origin: ORIGIN, destination: DESTINATION } }),
    )
    expect(route.distanceMeters).toBe(4200)
  })

  it('falls back to the keyless OSRM endpoint without a session and normalizes', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(osrmJson())
    const route = await calculateRoute(ORIGIN, DESTINATION)

    expect(route.coordinates).toEqual([
      { latitude: 17.385, longitude: 78.4867 },
      { latitude: 17.395, longitude: 78.48 },
      { latitude: 17.4065, longitude: 78.4772 },
    ])
    expect(route.distanceMeters).toBe(4200)
    expect(route.durationSeconds).toBe(900)
  })

  it('reports ROUTE_NOT_FOUND when no route exists', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 'NoRoute', routes: [] }), { status: 200 }),
    )
    // Distinct coordinates — the demo fallback caches by origin/destination pair.
    await expect(
      calculateRoute({ latitude: 19.1, longitude: 72.8 }, { latitude: 19.2, longitude: 72.9 }),
    ).rejects.toMatchObject({ code: 'ROUTE_NOT_FOUND' })
  })

  it('rejects an invalid destination with INVALID_DESTINATION', async () => {
    await expect(
      calculateRoute(ORIGIN, { latitude: Number.NaN, longitude: 78 }),
    ).rejects.toMatchObject({ code: 'INVALID_DESTINATION' })
  })
})