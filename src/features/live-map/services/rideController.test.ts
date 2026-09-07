// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { rideController } from './rideController'
import { gpsStore } from '../state/gpsStore'
import { connectionStore } from '../state/connectionStore'
import type { GpsError, LocationUpdate, RealtimeConnection } from '../types'

type StartCallbacks = {
  onUpdate: (update: LocationUpdate) => void
  onError: (error: GpsError) => void
}

const socketDoubles = vi.hoisted(() => {
  const state = { identity: { userId: 'u1', tripId: 't1' } as { userId: string; tripId: string } | null }
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    stopSharing: vi.fn(),
    publishLocation: vi.fn(),
    onRiderLocations: vi.fn(),
    onConnectionState: vi.fn<(listener: (state: RealtimeConnection) => void) => () => void>(() => () => {}),
    onGroupNavEvent: vi.fn(() => () => {}),
    onTripDestination: vi.fn(() => () => {}),
    locationServiceStart: vi.fn<(callbacks: StartCallbacks) => () => void>(() => () => {}),
    setIdentity: (v: { userId: string; tripId: string } | null) => {
      state.identity = v
    },
    getIdentity: () => state.identity,
  }
})

const mockDoubles = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  stopSharing: vi.fn(),
  publishLocation: vi.fn(),
  onRiderLocations: vi.fn(),
  onConnectionState: vi.fn<(listener: (state: RealtimeConnection) => void) => () => void>(() => () => {}),
  onGroupNavEvent: vi.fn(() => () => {}),
  onTripDestination: vi.fn(() => () => {}),
  locationServiceStart: vi.fn<(callbacks: StartCallbacks) => () => void>(() => () => {}),
}))

vi.mock('./SocketRealtimeService', () => {
  class SocketRealtimeService {
    readonly locationService = { start: socketDoubles.locationServiceStart }
    get identity() {
      return socketDoubles.getIdentity()
    }
  }
  Object.assign(SocketRealtimeService.prototype, {
    connect: socketDoubles.connect,
    disconnect: socketDoubles.disconnect,
    stopSharing: socketDoubles.stopSharing,
    publishLocation: socketDoubles.publishLocation,
    onRiderLocations: socketDoubles.onRiderLocations,
    onConnectionState: socketDoubles.onConnectionState,
    onGroupNavEvent: socketDoubles.onGroupNavEvent,
    onTripDestination: socketDoubles.onTripDestination,
  })
  return { SocketRealtimeService }
})

vi.mock('./MockRealtimeService', () => {
  class MockRealtimeService {
    readonly locationService = { start: mockDoubles.locationServiceStart }
  }
  Object.assign(MockRealtimeService.prototype, {
    connect: mockDoubles.connect,
    disconnect: mockDoubles.disconnect,
    stopSharing: mockDoubles.stopSharing,
    publishLocation: mockDoubles.publishLocation,
    onRiderLocations: mockDoubles.onRiderLocations,
    onConnectionState: mockDoubles.onConnectionState,
    onGroupNavEvent: mockDoubles.onGroupNavEvent,
    onTripDestination: mockDoubles.onTripDestination,
  })
  return { MockRealtimeService }
})

function gpsUpdate() {
  return {
    userId: '',
    tripId: '',
    latitude: 15.9,
    longitude: 73.97,
    accuracy: 10,
    speed: null,
    heading: null,
    timestamp: Date.now(),
  }
}

describe('rideController', () => {
  beforeEach(() => {
    rideController.dispose()
    socketDoubles.setIdentity({ userId: 'u1', tripId: 't1' })
    vi.clearAllMocks()
  })

  it('does not create a duplicate socket when init targets the same trip', () => {
    rideController.init('t1', { backend: true })
    rideController.init('t1', { backend: true })
    expect(socketDoubles.connect).toHaveBeenCalledTimes(1)
  })

  it('re-creates the service when the target trip changes', () => {
    rideController.init('t1', { backend: true })
    rideController.init('t2', { backend: true })
    expect(socketDoubles.connect).toHaveBeenCalledTimes(2)
  })

  it('uses the in-browser mock in demo (non-backend) mode', () => {
    rideController.init('demo-1', { backend: false })
    expect(mockDoubles.connect).toHaveBeenCalledTimes(1)
    expect(socketDoubles.connect).not.toHaveBeenCalled()
  })

  it('stamps location publishes with trusted identity, not the payload fields', () => {
    socketDoubles.locationServiceStart.mockImplementationOnce(({ onUpdate }) => {
      onUpdate({ ...gpsUpdate(), userId: 'ATTACKER', tripId: 'ATTACKER', latitude: 12.9, longitude: 77.5 })
      return () => {}
    })

    rideController.init('t1', { backend: true })
    rideController.startSharingLocation()

    const fired = socketDoubles.publishLocation.mock.calls[0]?.[0]
    expect(fired?.userId).toBe('u1')
    expect(fired?.tripId).toBe('t1')
    expect(fired?.latitude).toBe(12.9)
  })

  it('forwards connection states from the realtime service into the store', () => {
    let connHandler: (state: RealtimeConnection) => void = () => {}
    socketDoubles.onConnectionState.mockImplementationOnce((listener) => {
      connHandler = listener
      return () => {}
    })
    rideController.init('t1', { backend: true })

    connHandler('connected')
    expect(connectionStore.getState()).toBe('connected')
    connHandler('reconnecting')
    expect(connectionStore.getState()).toBe('reconnecting')
  })

  it('pauses sharing and resets stores on dispose', () => {
    socketDoubles.locationServiceStart.mockImplementationOnce(({ onUpdate }) => {
      onUpdate(gpsUpdate())
      return () => {}
    })

    rideController.init('t1', { backend: true })
    rideController.startSharingLocation()
    expect(gpsStore.getState().mode).toBe('active')

    rideController.dispose()
    expect(socketDoubles.stopSharing).toHaveBeenCalled()
    expect(socketDoubles.disconnect).toHaveBeenCalled()
    expect(gpsStore.getState().mode).toBe('inactive')
    expect(connectionStore.getState()).toBe('connected')
  })

  it('does not publish when no trusted identity exists yet', () => {
    socketDoubles.setIdentity(null)
    socketDoubles.locationServiceStart.mockImplementationOnce(({ onUpdate }) => {
      onUpdate(gpsUpdate())
      return () => {}
    })

    rideController.init('t1', { backend: true })
    rideController.startSharingLocation()
    expect(socketDoubles.publishLocation).not.toHaveBeenCalled()
  })

  it('handles gps permission errors into the denied store mode', () => {
    socketDoubles.locationServiceStart.mockImplementationOnce(({ onError }) => {
      onError({ kind: 'permission_denied', message: 'denied' })
      return () => {}
    })
    rideController.init('t1', { backend: true })
    rideController.startSharingLocation()
    expect(gpsStore.getState().mode).toBe('denied')
  })
})