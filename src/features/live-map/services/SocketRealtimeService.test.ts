// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import type { LocationUpdate, RealtimeConnection, RiderLocation } from '../types'
import type { NavigationSessionPayload } from '../../navigation/types'
import { SocketRealtimeService } from './SocketRealtimeService'
import { ensureAuthContext } from './backend'

vi.mock('socket.io-client', () => ({
  io: vi.fn(),
}))

vi.mock('./backend', () => ({
  ensureAuthContext: vi.fn(),
}))

interface FakeSocket {
  handlers: Record<string, ((...args: unknown[]) => void)[]>
  connected: boolean
  emit: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  off: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
  fire: (event: string, ...args: unknown[]) => void
}

function makeFakeSocket(): FakeSocket {
  const handlers: Record<string, ((...args: unknown[]) => void)[]> = {}
  const fire = (event: string, ...args: unknown[]) => {
    for (const h of handlers[event] ?? []) h(...args)
  }
  return {
    handlers,
    connected: false,
    emit: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] ??= []
      handlers[event].push(handler)
      return handler
    }),
    off: vi.fn(),
    disconnect: vi.fn(() => {
      fire('disconnect', 'io client disconnect')
    }),
    fire,
  }
}

const ctx = { accessToken: 'tok', userId: 'u1', name: 'Rohit', tripId: 't1' }

function update(p: Partial<LocationUpdate>): LocationUpdate {
  return {
    userId: 'u1',
    tripId: 't1',
    latitude: 15.9,
    longitude: 73.97,
    accuracy: 10,
    speed: null,
    heading: null,
    timestamp: Date.now(),
    ...p,
  }
}

describe('SocketRealtimeService', () => {
  beforeEach(() => {
    vi.mocked(io).mockReset()
    vi.mocked(ensureAuthContext).mockReset()
  })

  it('emits connecting before auth, then joins the room after authenticated', async () => {
    const states: RealtimeConnection[] = []
    const svc = new SocketRealtimeService({ tripId: 't1' })
    svc.onConnectionState((s) => states.push(s))
    vi.mocked(ensureAuthContext).mockResolvedValue(ctx)

    const sock = makeFakeSocket()
    vi.mocked(io).mockReturnValue(sock as unknown as Socket)

    await svc.connect('t1')
    expect(states[0]).toBe('connecting')
    expect(io).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ auth: { token: 'tok' } }))

    sock.connected = true
    sock.fire('connect')
    expect(states.at(-1)).toBe('connected')

    sock.fire('authenticated')
    expect(sock.emit).toHaveBeenCalledWith('trip:join', { tripId: 't1' })
  })

  it('re-joins the room and restores sharing state after a reconnect', async () => {
    vi.mocked(ensureAuthContext).mockResolvedValue(ctx)
    const svc = new SocketRealtimeService({ tripId: 't1' })
    const sock = makeFakeSocket()
    vi.mocked(io).mockReturnValue(sock as unknown as Socket)
    await svc.connect('t1')
    sock.connected = true
    sock.fire('connect')

    // Publish a fix so there is last-known state to restore.
    svc.publishLocation(update({}))
    expect(sock.emit).toHaveBeenCalledWith('location:start', { tripId: 't1' })
    expect(sock.emit).toHaveBeenCalledWith('location:update', expect.objectContaining({ latitude: 15.9 }))

    // Simulate a reconnect: server sends authenticated again.
    sock.fire('authenticated')
    expect(sock.emit).toHaveBeenCalledWith('trip:join', { tripId: 't1' })
    expect(sock.emit).toHaveBeenCalledWith('location:start', { tripId: 't1' })
    expect(sock.emit).toHaveBeenLastCalledWith('location:update', expect.objectContaining({ latitude: 15.9 }))
  })

  it('treats connect_error without a prior session as offline and after as reconnecting', async () => {
    vi.mocked(ensureAuthContext).mockResolvedValue(ctx)
    const states: RealtimeConnection[] = []
    const svc = new SocketRealtimeService({ tripId: 't1' })
    svc.onConnectionState((s) => states.push(s))
    const sock = makeFakeSocket()
    vi.mocked(io).mockReturnValue(sock as unknown as Socket)
    await svc.connect('t1')

    sock.fire('connect_error')
    expect(states.at(-1)).toBe('offline')

    sock.connected = true
    sock.fire('connect')
    expect(states.at(-1)).toBe('connected')

    sock.fire('connect_error')
    expect(states.at(-1)).toBe('reconnecting')

    sock.fire('reconnect_failed')
    expect(states.at(-1)).toBe('offline')
  })

  it('does not publish before a session exists', async () => {
    const svc = new SocketRealtimeService({ tripId: 't1' })
    const sock = makeFakeSocket()
    vi.mocked(io).mockReturnValue(sock as unknown as Socket)
    vi.mocked(ensureAuthContext).mockResolvedValue(ctx)
    await svc.connect('t1')

    expect(sock.emit).not.toHaveBeenCalled()
  })

  it('marks a stopped-riders event offline by zeroing its timestamp', async () => {
    vi.mocked(ensureAuthContext).mockResolvedValue(ctx)
    const svc = new SocketRealtimeService({ tripId: 't1' })
    const sock = makeFakeSocket()
    vi.mocked(io).mockReturnValue(sock as unknown as Socket)
    await svc.connect('t1')

    const riders: RiderLocation[] = []
    svc.onRiderLocations((r) => riders.push(...r))

    sock.fire('trip:joined', {
      riders: [
        { userId: 'u2', name: 'Priya', avatarUrl: null, latitude: 16, longitude: 74, accuracy: 5, speed: null, heading: null, lastUpdatedAt: new Date().toISOString(), status: 'active' },
      ],
    })
    expect(riders[0].userId).toBe('u2')

    sock.fire('rider:offline', { userId: 'u2' })
    expect(riders.at(-1)?.timestamp).toBe(0)
  })

  it('stopSharing clears the restore state and stops announcing start', async () => {
    vi.mocked(ensureAuthContext).mockResolvedValue(ctx)
    const svc = new SocketRealtimeService({ tripId: 't1' })
    const sock = makeFakeSocket()
    vi.mocked(io).mockReturnValue(sock as unknown as Socket)
    await svc.connect('t1')
    sock.connected = true
    sock.fire('connect')

    svc.publishLocation(update({}))
    expect(sock.emit).toHaveBeenCalledWith('location:start', { tripId: 't1' })

    svc.stopSharing()
    expect(sock.emit).toHaveBeenCalledWith('location:stop', { tripId: 't1' })

    // After stop, a reconnect should not re-join sharing.
    sock.emit.mockClear()
    sock.fire('authenticated')
    expect(sock.emit).not.toHaveBeenCalledWith('location:start', expect.anything())
    expect(sock.emit).not.toHaveBeenCalledWith('location:update', expect.anything())
    // But the room membership re-join still happens.
    expect(sock.emit).toHaveBeenCalledWith('trip:join', { tripId: 't1' })
  })

  it('disconnect resets connection state and internal flags', async () => {
    vi.mocked(ensureAuthContext).mockResolvedValue(ctx)
    const states: RealtimeConnection[] = []
    const svc = new SocketRealtimeService({ tripId: 't1' })
    svc.onConnectionState((s) => states.push(s))
    const sock = makeFakeSocket()
    vi.mocked(io).mockReturnValue(sock as unknown as Socket)
    await svc.connect('t1')
    sock.connected = true
    sock.fire('connect')
    svc.publishLocation(update({}))

    svc.disconnect()
    expect(sock.disconnect).toHaveBeenCalled()
    expect(states.at(-1)).toBe('offline')

    // Publish after dispose must be a no-op (no stale socket reference).
    sock.emit.mockClear()
    svc.publishLocation(update({}))
    expect(sock.emit).not.toHaveBeenCalled()
  })

  it('forwards destination broadcasts (set/update/clear) with tripId + destination', async () => {
    vi.mocked(ensureAuthContext).mockResolvedValue(ctx)
    const svc = new SocketRealtimeService({ tripId: 't1' })
    const sock = makeFakeSocket()
    vi.mocked(io).mockReturnValue(sock as unknown as Socket)
    await svc.connect('t1')

    const destinations: Array<{ tripId: string; destination: unknown }> = []
    svc.onTripDestination((p) => destinations.push(p))

    sock.fire('trip:destination-updated', {
      tripId: 't1',
      destination: { latitude: 15.49, longitude: 73.82, name: 'Goa' },
    })
    sock.fire('trip:destination-cleared', { tripId: 't1', destination: null })

    expect(destinations[0]).toEqual({
      tripId: 't1',
      destination: { latitude: 15.49, longitude: 73.82, name: 'Goa' },
    })
    expect(destinations[1]).toEqual({ tripId: 't1', destination: null })
  })

  it('forwards every navigation:* broadcast with its event name', async () => {
    vi.mocked(ensureAuthContext).mockResolvedValue(ctx)
    const svc = new SocketRealtimeService({ tripId: 't1' })
    const sock = makeFakeSocket()
    vi.mocked(io).mockReturnValue(sock as unknown as Socket)
    await svc.connect('t1')

    const events: Array<{ event: string; payload: NavigationSessionPayload }> = []
    svc.onGroupNavEvent((event, payload) => events.push({ event, payload }))

    const payload: NavigationSessionPayload = {
      tripId: 't1',
      userId: 'u2',
      mode: 'group',
      status: 'off_route',
      distanceRemainingMeters: 4200,
      eta: Date.now() + 600_000,
      updatedAt: new Date().toISOString(),
    }
    sock.fire('navigation:off_route-stale-impossible', payload) // unknown events are ignored
    sock.fire('navigation:started', payload)
    sock.fire('navigation:status', payload)
    sock.fire('navigation:arrived', payload)

    expect(events.map((e) => e.event)).toEqual([
      'navigation:started',
      'navigation:status',
      'navigation:arrived',
    ])
    expect(events[0].payload.userId).toBe('u2')
  })
})