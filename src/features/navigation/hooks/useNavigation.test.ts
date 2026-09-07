// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useNavigation, clearNavigationRouteCache } from './useNavigation'
import { navigationStore } from '../state/navigationStore'
import { riderStore } from '../../live-map/state/riderStore'
import { gpsStore } from '../../live-map/state/gpsStore'
import { rideController } from '../../live-map/services/rideController'
import { calculateRoute as realCalculateRoute } from '../services/RoutingService'
import type { RiderLocation } from '../../live-map/types'
import type { NavigationDestination, RouteResult } from '../types'

vi.mock('../services/RoutingService', () => ({
  calculateRoute: vi.fn(),
}))

const calculateRouteMock = vi.mocked(realCalculateRoute)

const ORIGIN: NavigationDestination = { latitude: 17.385, longitude: 78.4867, name: 'Start' }
const DESTINATION: NavigationDestination = { latitude: 17.394, longitude: 78.4867, name: 'Hyderabad' }

const ROUTE: RouteResult = {
  coordinates: [
    { latitude: 17.385, longitude: 78.4867 },
    { latitude: 17.3895, longitude: 78.4867 },
    { latitude: 17.394, longitude: 78.4867 },
  ],
  distanceMeters: 1000,
  durationSeconds: 600,
  instructions: [],
}

const STEPPED_ROUTE: RouteResult = {
  ...ROUTE,
  instructions: [
    { id: 'step-0', type: 'depart', text: 'Head north', distanceMeters: 100, durationSeconds: 10, latitude: 17.385, longitude: 78.4867 },
    { id: 'step-1', type: 'turn', modifier: 'right', text: 'Turn right', distanceMeters: 500, durationSeconds: 50, latitude: 17.3895, longitude: 78.4867, roadName: 'NH 7' },
    { id: 'step-2', type: 'arrive', text: 'Arrive', distanceMeters: 0, durationSeconds: 0, latitude: 17.394, longitude: 78.4867 },
  ],
}

function me(lat: number, lng: number, timestamp = Date.now()): RiderLocation {
  return {
    userId: 'me',
    tripId: 't1',
    name: 'Me',
    bike: 'Rider',
    accent: '#4a9eff',
    isMe: true,
    latitude: lat,
    longitude: lng,
    accuracy: 8,
    speed: null,
    heading: null,
    timestamp,
  }
}

function otherRider(lat: number, lng: number): RiderLocation {
  return {
    userId: 'rider-2',
    tripId: 't1',
    name: 'Rider 2',
    bike: 'Rider',
    accent: '#ff6b2c',
    isMe: false,
    latitude: lat,
    longitude: lng,
    accuracy: 8,
    speed: null,
    heading: null,
    timestamp: Date.now(),
  }
}

function setMe(lat: number, lng: number) {
  riderStore.setRiders([me(lat, lng)])
}

/** Flush pending microtasks so async route resolutions settle inside act(). */
async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('useNavigation', () => {
  beforeEach(() => {
    navigationStore.reset()
    gpsStore.setMode('inactive')
    gpsStore.setError(null)
    riderStore.setRiders([])
    clearNavigationRouteCache()
    calculateRouteMock.mockReset()
  })

  afterEach(() => {
    cleanup()
    navigationStore.reset()
    riderStore.setRiders([])
  })

  it('openNavigation requests location sharing when GPS is not active', () => {
    const startSpy = vi.spyOn(rideController, 'startSharingLocation').mockImplementation(() => {})
    const { result } = renderHook(() => useNavigation())
    act(() => result.current.openNavigation())
    expect(startSpy).toHaveBeenCalled()
    expect(result.current.status).toBe('locating')
    startSpy.mockRestore()
  })

  it('shows the destination and goes idle again after clearing it', async () => {
    calculateRouteMock.mockResolvedValue(ROUTE)
    setMe(ORIGIN.latitude, ORIGIN.longitude)
    const { result } = renderHook(() => useNavigation())

    act(() => result.current.setDestination(DESTINATION))
    await flush()

    expect(calculateRouteMock).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: ORIGIN.latitude, longitude: ORIGIN.longitude }),
      expect.objectContaining({ latitude: DESTINATION.latitude, longitude: DESTINATION.longitude }),
    )
    expect(result.current.status).toBe('ready')
    expect(result.current.destination?.name).toBe('Hyderabad')

    act(() => result.current.clearDestination())
    expect(result.current.status).toBe('idle')
    expect(result.current.destination).toBeNull()
  })

  it('goes into locating while GPS is still being acquired', () => {
    const { result } = renderHook(() => useNavigation())
    act(() => result.current.setDestination(DESTINATION))
    expect(result.current.status).toBe('locating')
  })

  it('a map click selects the destination when picking is allowed', async () => {
    calculateRouteMock.mockResolvedValue(ROUTE)
    setMe(ORIGIN.latitude, ORIGIN.longitude)
    const { result } = renderHook(() => useNavigation())

    act(() => result.current.handleMapClick(DESTINATION.latitude, DESTINATION.longitude))
    await flush()

    expect(result.current.destination).toEqual(
      expect.objectContaining({ latitude: DESTINATION.latitude, longitude: DESTINATION.longitude }),
    )
    expect(result.current.status).toBe('ready')
  })

  it('starts navigation and tracks remaining distance + ETA as GPS moves', async () => {
    calculateRouteMock.mockResolvedValue(ROUTE)
    setMe(ORIGIN.latitude, ORIGIN.longitude)
    const { result } = renderHook(() => useNavigation())

    await act(async () => {
      result.current.setDestination(DESTINATION)
    })
    await flush()
    act(() => result.current.startNavigation())

    expect(result.current.status).toBe('navigating')
    expect(result.current.remainingDistanceMeters).toBeGreaterThan(0)

    // Advance to the middle of the route (line sits at fixed lng 78.4867).
    setMe(17.3895, 78.4867)
    await flush()
    expect(result.current.remainingDistanceMeters).toBeLessThan(900)
    expect(result.current.remainingDistanceMeters).toBeGreaterThan(0)

    act(() => result.current.stopNavigation())
    expect(result.current.status).toBe('ready')
  })

  it('marks the session completed when arriving within the threshold', async () => {
    calculateRouteMock.mockResolvedValue(ROUTE)
    setMe(ORIGIN.latitude, ORIGIN.longitude)
    const { result } = renderHook(() => useNavigation())

    act(() => result.current.setDestination(DESTINATION))
    await flush()
    act(() => result.current.startNavigation())
    // Teleport next to the destination.
    setMe(DESTINATION.latitude, DESTINATION.longitude)
    await flush()

    expect(result.current.status).toBe('completed')
  })

  it('flags off-route when the fix drifts away from the polyline', async () => {
    calculateRouteMock.mockResolvedValue(ROUTE)
    setMe(ORIGIN.latitude, ORIGIN.longitude)
    const { result } = renderHook(() => useNavigation())

    act(() => result.current.setDestination(DESTINATION))
    await flush()
    act(() => result.current.startNavigation())
    // ~800m off the line (far beyond the 150m default threshold).
    setMe(17.39, 78.495)
    await flush()

    expect(result.current.offRoute).toBe(true)
  })

  it('surfaces routing failures with a user-friendly message', async () => {
    calculateRouteMock.mockRejectedValue(new Error('No route could be found'))
    setMe(ORIGIN.latitude, ORIGIN.longitude)
    const { result } = renderHook(() => useNavigation())

    act(() => result.current.setDestination(DESTINATION))
    await flush()

    expect(result.current.status).toBe('error')
    expect(result.current.error).toMatch(/no route/i)
  })

  it('recenter flies to the current position', () => {
    const flyTo = vi.fn()
    setMe(17.4, 78.47)
    const { result } = renderHook(() => useNavigation())
    act(() => result.current.recenter({ flyTo } as never))
    expect(flyTo).toHaveBeenCalledWith([17.4, 78.47], expect.any(Number), expect.any(Object))
  })

  it('keeps the group riders store untouched while navigating', () => {
    calculateRouteMock.mockResolvedValue(ROUTE)
    riderStore.setRiders([me(ORIGIN.latitude, ORIGIN.longitude), otherRider(18.5, 74)])
    const { result } = renderHook(() => useNavigation())

    act(() => result.current.setDestination(DESTINATION))
    expect(riderStore.getState().riders.length).toBe(2)
  })
})

describe('useNavigation (Phase 2)', () => {
  beforeEach(() => {
    navigationStore.reset()
    gpsStore.setMode('inactive')
    gpsStore.setError(null)
    riderStore.setRiders([])
    clearNavigationRouteCache()
    calculateRouteMock.mockReset()
  })

  afterEach(() => {
    cleanup()
    navigationStore.reset()
    riderStore.setRiders([])
    vi.useRealTimers()
  })

  async function driveToDestination(route = ROUTE) {
    calculateRouteMock.mockResolvedValue(route)
    setMe(ORIGIN.latitude, ORIGIN.longitude)
    const { result } = renderHook(() => useNavigation())
    act(() => result.current.setDestination(DESTINATION))
    await flush()
    expect(result.current.status).toBe('ready')
    act(() => result.current.startNavigation())
    expect(result.current.status).toBe('navigating')
    return result
  }

  it('builds turn-by-turn progress from the route instructions', async () => {
    const result = await driveToDestination(STEPPED_ROUTE)
    expect(result.current.progress?.currentInstruction?.type).toBe('turn')
    expect(result.current.progress?.currentInstruction?.modifier).toBe('right')
    expect(result.current.progress?.nextInstruction?.type).toBe('arrive')
  })

  it('section-to-next-maneuver distance shrinks as the rider advances', async () => {
    const result = await driveToDestination(STEPPED_ROUTE)
    setMe(17.387, 78.4867)
    await flush()
    const before = result.current.progress?.distanceToCurrentInstructionMeters
    setMe(17.389, 78.4867)
    await flush()
    const after = result.current.progress?.distanceToCurrentInstructionMeters
    expect((after as number)).toBeLessThan(before as number)
  })

  it('automatically reroutes after off-route confirmation + delay', async () => {
    vi.useFakeTimers()
    const newRoute: RouteResult = {
      ...ROUTE,
      coordinates: [
        { latitude: 17.39, longitude: 78.495 },
        { latitude: 17.392, longitude: 78.494 },
        { latitude: 17.394, longitude: 78.495 },
      ],
    }
    calculateRouteMock.mockResolvedValueOnce(ROUTE).mockResolvedValue(newRoute)
    setMe(ORIGIN.latitude, ORIGIN.longitude)
    const { result } = renderHook(() => useNavigation())
    act(() => result.current.setDestination(DESTINATION))
    await flush()
    act(() => result.current.startNavigation())

    // Consecutive off-route samples; advance the clock past the 3s delay.
    setMe(17.390, 78.495)
    await flush()
    act(() => vi.advanceTimersByTime(1200))
    setMe(17.3901, 78.495)
    await flush()
    act(() => vi.advanceTimersByTime(1200))
    setMe(17.3902, 78.495)
    await flush()
    act(() => vi.advanceTimersByTime(1200))
    await flush()

    expect(calculateRouteMock).toHaveBeenCalledTimes(2)
    expect(result.current.route?.coordinates[0].latitude).toBe(17.39)
    expect(result.current.rerouting).toBe(false)
    expect(result.current.routeUpdated).toBe(true)
    expect(result.current.offRoute).toBe(false)
  })

  it('respects the reroute cooldown (no second reroute within 15s)', async () => {
    vi.useFakeTimers()
    const newRoute: RouteResult = {
      ...ROUTE,
      coordinates: [
        { latitude: 17.39, longitude: 78.495 },
        { latitude: 17.392, longitude: 78.494 },
        { latitude: 17.394, longitude: 78.495 },
      ],
    }
    calculateRouteMock.mockResolvedValueOnce(ROUTE).mockResolvedValue(newRoute)
    setMe(ORIGIN.latitude, ORIGIN.longitude)
    const { result } = renderHook(() => useNavigation())
    act(() => result.current.setDestination(DESTINATION))
    await flush()
    act(() => result.current.startNavigation())

    // First reroute fires.
    setMe(17.390, 78.495)
    await flush()
    act(() => vi.advanceTimersByTime(1200))
    setMe(17.3901, 78.495)
    await flush()
    act(() => vi.advanceTimersByTime(1200))
    setMe(17.3902, 78.495)
    await flush()
    act(() => vi.advanceTimersByTime(1200))
    await flush()
    expect(calculateRouteMock).toHaveBeenCalledTimes(2)

    // The new route starts at the off-route point, so the rider is back on it.
    expect(result.current.offRoute).toBe(false)

    // Go off-route again within the cooldown → confirmation accumulates but
    // no second request fires.
    setMe(17.395, 78.50)
    await flush()
    act(() => vi.advanceTimersByTime(1200))
    setMe(17.3951, 78.50)
    await flush()
    act(() => vi.advanceTimersByTime(1200))
    setMe(17.3952, 78.50)
    await flush()
    act(() => vi.advanceTimersByTime(1200))
    await flush()

    expect(calculateRouteMock).toHaveBeenCalledTimes(2)
  })

  it('keeps the previous route on a failed reroute and surfaces a notice', async () => {
    vi.useFakeTimers()
    calculateRouteMock.mockResolvedValueOnce(ROUTE).mockRejectedValue(new Error('Unable to recalculate route'))
    setMe(ORIGIN.latitude, ORIGIN.longitude)
    const { result } = renderHook(() => useNavigation())
    act(() => result.current.setDestination(DESTINATION))
    await flush()
    act(() => result.current.startNavigation())

    setMe(17.390, 78.495)
    await flush()
    act(() => vi.advanceTimersByTime(1200))
    setMe(17.3901, 78.495)
    await flush()
    act(() => vi.advanceTimersByTime(1200))
    setMe(17.3902, 78.495)
    await flush()
    act(() => vi.advanceTimersByTime(1200))
    await flush()

    expect(calculateRouteMock).toHaveBeenCalledTimes(2)
    expect(result.current.route).toBe(ROUTE)
    expect(result.current.rerouting).toBe(false)
    expect(result.current.notice).toMatch(/unable to recalculate/i)
  })

  it('arrival completes the session and clears rerouting state', async () => {
    const result = await driveToDestination()
    setMe(DESTINATION.latitude, DESTINATION.longitude)
    await flush()
    expect(result.current.status).toBe('completed')
    expect(result.current.rerouting).toBe(false)
    expect(result.current.gpsLost).toBe(false)
  })

  it('toggles voice guidance on and off', () => {
    // jsdom has no SpeechSynthesis — stub it so the service reports support.
    vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak: vi.fn() })
    vi.stubGlobal('SpeechSynthesisUtterance', class { text = '' })
    try {
      const { result } = renderHook(() => useNavigation())
      act(() => result.current.toggleVoice())
      expect(result.current.voiceEnabled).toBe(false)
      act(() => result.current.toggleVoice())
      expect(result.current.voiceEnabled).toBe(true)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})