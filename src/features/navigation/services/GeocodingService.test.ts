// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { searchPlaces } from './GeocodingService'
import { apiRequest } from '../../../lib/apiClient'

vi.mock('../../../lib/apiClient', () => ({
  apiRequest: vi.fn(),
}))

const apiRequestMock = vi.mocked(apiRequest)

function nominatimRows() {
  return new Response(
    JSON.stringify([
      { display_name: 'Hyderabad, Telangana, India', lat: '17.3850', lon: '78.4867' },
      { display_name: 'Hyderabad, Sindh, Pakistan', lat: '25.38', lon: '68.37' },
    ]),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

describe('GeocodingService.searchPlaces', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    try {
      localStorage.removeItem('rt_access_token')
    } catch {
      /* ignore */
    }
    apiRequestMock.mockReset()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('returns [] for very short queries', async () => {
    await expect(searchPlaces('a')).resolves.toEqual([])
  })

  it('uses the backend endpoint when a session exists', async () => {
    try {
      localStorage.setItem('rt_access_token', 'abc')
    } catch {
      /* ignore */
    }
    apiRequestMock.mockResolvedValue([{ name: 'Hyderabad', latitude: 17.385, longitude: 78.4867 }])

    const results = await searchPlaces('Hyderabad', 5)

    expect(apiRequestMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/navigation/geocode?q=Hyderabad'),
      expect.anything(),
    )
    expect(results).toHaveLength(1)
  })

  it('falls back to keyless Nominatim without a session', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(nominatimRows())
    const results = await searchPlaces('Hyderabad', 6)

    expect(results).toEqual([
      { name: 'Hyderabad, Telangana, India', latitude: 17.385, longitude: 78.4867 },
      { name: 'Hyderabad, Sindh, Pakistan', latitude: 25.38, longitude: 68.37 },
    ])
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/search?format=jsonv2'),
      expect.anything(),
    )
  })

  it('returns [] when the geocoder is unreachable', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline'))
    await expect(searchPlaces('Hyderabad', 5)).resolves.toEqual([])
  })
})