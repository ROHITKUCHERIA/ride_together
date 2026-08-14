// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserLocationService } from './LocationService'
import { LOCATION_UPDATE_INTERVAL_MS, MIN_ACCURACY_METERS, MIN_DISTANCE_METERS } from '../config'

interface WatchCallbacks {
  onSuccess: (pos: GeolocationPosition) => void
  onError: (err: GeolocationPositionError) => void
}

function makePosition(lat: number, lng: number, accuracy = 10, speed: number | null = null, timestamp = Date.now()): GeolocationPosition {
  return {
    coords: {
      latitude: lat,
      longitude: lng,
      accuracy,
      speed,
      heading: null,
      altitude: null,
      altitudeAccuracy: null,
    },
    timestamp,
  } as GeolocationPosition
}

const permissionDenied = {
  code: 1,
  PERMISSION_DENIED: 1,
  POSITION_UNAVAILABLE: 2,
  TIMEOUT: 3,
  message: 'denied',
} as GeolocationPositionError

describe('BrowserLocationService', () => {
  let watchCallbacks: WatchCallbacks
  let clearWatch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    watchCallbacks = { onSuccess: () => {}, onError: () => {} }
    clearWatch = vi.fn()
    vi.stubGlobal('navigator', {
      geolocation: {
        watchPosition: vi.fn((onSuccess, onError) => {
          watchCallbacks = { onSuccess, onError }
          return 7
        }),
        clearWatch,
      },
    })
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('reports unsupported when geolocation is missing', () => {
    vi.stubGlobal('navigator', {})
    const service = new BrowserLocationService()
    const onError = vi.fn()
    service.start({ onUpdate: () => {}, onError })
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ kind: 'unsupported' }))
  })

  it('throttles updates until the interval elapses or the rider moves enough', () => {
    const service = new BrowserLocationService()
    const onUpdate = vi.fn()
    const stop = service.start({ onUpdate, onError: () => {} })

    watchCallbacks.onSuccess(makePosition(15.9, 73.97))
    expect(onUpdate).toHaveBeenCalledTimes(1)

    // Instant repeat fix, same point → throttled away.
    watchCallbacks.onSuccess(makePosition(15.9, 73.97))
    expect(onUpdate).toHaveBeenCalledTimes(1)

    // Moving far enough before the interval fires still updates.
    watchCallbacks.onSuccess(makePosition(15.9 + 0.1, 73.97))
    expect(onUpdate).toHaveBeenCalledTimes(2)

    // Within interval + small movement (< MIN_DISTANCE_METERS) → throttled.
    watchCallbacks.onSuccess(makePosition(15.9 + 0.1 + 0.00004, 73.97))
    expect(onUpdate).toHaveBeenCalledTimes(2)

    stop()
  })

  it('passes through low-accuracy fixes but still paces the next send', () => {
    const service = new BrowserLocationService()
    const onUpdate = vi.fn()
    const stop = service.start({ onUpdate, onError: () => {} })

    watchCallbacks.onSuccess(makePosition(15.9, 73.97, MIN_ACCURACY_METERS + 50))
    expect(onUpdate).toHaveBeenCalledTimes(1)

    // A subsequent fix after the interval is forwarded even when accuracy
    // remains poor (the client only needs the backend to accept it).
    vi.advanceTimersByTime(LOCATION_UPDATE_INTERVAL_MS + 100)
    watchCallbacks.onSuccess(makePosition(15.9 + MIN_DISTANCE_METERS / 111_000, 73.97, MIN_ACCURACY_METERS + 50))
    expect(onUpdate).toHaveBeenCalledTimes(2)

    stop()
  })

  it('maps watchPosition errors to the permission_denied kind', () => {
    const service = new BrowserLocationService()
    const onError = vi.fn()
    service.start({ onUpdate: () => {}, onError })

    watchCallbacks.onError(permissionDenied)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ kind: 'permission_denied' }))
  })

  it('stop clears the watch and suppresses further callbacks', () => {
    const service = new BrowserLocationService()
    const onUpdate = vi.fn()
    const stop = service.start({ onUpdate, onError: () => {} })

    stop()
    watchCallbacks.onSuccess(makePosition(15.9, 73.97))
    expect(onUpdate).not.toHaveBeenCalled()
    expect(clearWatch).toHaveBeenCalledWith(7)
  })
})