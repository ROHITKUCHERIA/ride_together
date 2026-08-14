import { io, Socket } from 'socket.io-client'
import { API_URL } from '../config'
import type { LocationUpdate, RiderLocation, RealtimeConnection } from '../types'
import { BrowserLocationService } from './LocationService'
import type { LocationService, RealtimeService } from './RealtimeService'
import { ensureAuthContext, type AuthContext } from './backend'

const ACCENTS = [
  '#ff6b2c',
  '#3ddc84',
  '#4dc4ff',
  '#ffb14d',
  '#e0242f',
  '#c084fc',
  '#34d399',
  '#22d3ee',
  '#f472b6',
]

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

interface ServerRider {
  userId: string
  name: string
  avatarUrl: string | null
  latitude: number
  longitude: number
  accuracy: number
  speed: number | null
  heading: number | null
  lastUpdatedAt: string
  status: string
}

interface SocketRealtimeOptions {
  /** Pin the joined trip (used by the authenticated /app/trips/:tripId route). */
  tripId?: string
}

/**
 * Socket.IO transport for the live map. Identity (userId/tripId) always comes
 * from the authenticated backend context — never from inbound payloads.
 */
export class SocketRealtimeService implements RealtimeService {
  readonly locationService: LocationService = new BrowserLocationService()

  private readonly tripIdOverride: string | undefined
  private socket: Socket | null = null
  private ctx: AuthContext | null = null
  private startSent = false
  private hadConnected = false
  private lastPublished: LocationUpdate | null = null
  private riders = new Map<string, RiderLocation>()
  private riderListener: ((riders: RiderLocation[]) => void) | null = null
  private connectionListener: ((state: RealtimeConnection) => void) | null = null

  constructor(options: SocketRealtimeOptions = {}) {
    this.tripIdOverride = options.tripId
  }

  get identity(): { userId: string; tripId: string } | null {
    return this.ctx ? { userId: this.ctx.userId, tripId: this.ctx.tripId } : null
  }

  async connect(tripId?: string): Promise<void> {
    this.setConnection('connecting')
    try {
      this.ctx = await ensureAuthContext(tripId ?? this.tripIdOverride)
    } catch (err) {
      this.setConnection('offline')
      console.warn('[realtime] authentication failed:', err)
      return
    }
    this.startSent = false
    this.riders.clear()
    this.socket = io(API_URL, {
      auth: { token: this.ctx.accessToken },
      transports: ['websocket', 'polling'],
    })
    this.bindEvents()
  }

  private bindEvents(): void {
    const s = this.socket
    if (!s) return

    s.on('connect', () => {
      this.hadConnected = true
      this.setConnection('connected')
    })
    // connect_error fires on the initial attempt AND on failed reconnects —
    // only treat it as offline when we have never established a session.
    s.on('connect_error', () => {
      this.setConnection(this.hadConnected ? 'reconnecting' : 'offline')
    })
    s.on('reconnect_failed', () => this.setConnection('offline'))
    s.on('disconnect', (reason) => {
      if (reason === 'io server disconnect') this.setConnection('offline')
      else this.setConnection('reconnecting')
    })

    // Fires after every connection (including reconnects) once the JWT has
    // been verified server-side. This is when it is safe to join the room.
    s.on('authenticated', () => {
      if (this.ctx) s.emit('trip:join', { tripId: this.ctx.tripId })
      // Restore location sharing state across reconnects: re-announce the
      // start and re-send the last known fix so presence stays LIVE and the
      // marker does not wait for the next GPS callback.
      if (this.ctx && this.lastPublished) {
        s.emit('location:start', { tripId: this.ctx.tripId })
        s.emit('location:update', this.toWire(this.lastPublished))
      }
    })

    s.on('trip:joined', (payload: { riders: ServerRider[] }) => {
      this.riders.clear()
      for (const rider of payload.riders ?? []) this.mapRider(rider)
      this.emitRiders()
    })

    s.on('location:updated', (rider: ServerRider) => {
      this.mapRider(rider)
      this.emitRiders()
    })

    // Rider stopped sharing / disconnected: keep the marker but age its
    // timestamp so presence immediately becomes offline.
    s.on('rider:offline', ({ userId }: { userId: string }) => {
      const existing = this.riders.get(userId)
      if (existing) {
        this.riders.set(userId, { ...existing, timestamp: 0 })
        this.emitRiders()
      }
    })

    s.on('trip:error', (err: { code?: string; message?: string }) => {
      if (err?.code === 'RATE_LIMITED') return // client already paces itself
      console.warn('[realtime] trip error:', err?.code, err?.message)
    })
  }

  private mapRider(r: ServerRider): void {
    if (!this.ctx) return
    this.riders.set(r.userId, {
      userId: r.userId,
      name: r.name,
      bike: 'Rider',
      accent: ACCENTS[hashString(r.userId) % ACCENTS.length],
      isMe: r.userId === this.ctx.userId,
      tripId: this.ctx.tripId,
      latitude: r.latitude,
      longitude: r.longitude,
      accuracy: r.accuracy,
      speed: r.speed,
      heading: r.heading,
      timestamp: Date.parse(r.lastUpdatedAt),
    })
  }

  private emitRiders(): void {
    this.riderListener?.([...this.riders.values()])
  }

  publishLocation(update: LocationUpdate): void {
    const s = this.socket
    const ctx = this.ctx
    if (!s || !ctx || !s.connected) return
    if (!this.startSent) {
      s.emit('location:start', { tripId: ctx.tripId })
      this.startSent = true
    }
    this.lastPublished = update
    s.emit('location:update', this.toWire(update))
  }

  stopSharing(): void {
    const s = this.socket
    const ctx = this.ctx
    if (!s || !ctx) return
    this.lastPublished = null
    if (s.connected) s.emit('location:stop', { tripId: ctx.tripId })
    this.startSent = false
  }

  private toWire(update: LocationUpdate): {
    tripId: string
    latitude: number
    longitude: number
    accuracy: number
    speed: number | null
    heading: number | null
    timestamp: number
  } {
    return {
      tripId: this.ctx?.tripId ?? update.tripId,
      latitude: update.latitude,
      longitude: update.longitude,
      accuracy: update.accuracy,
      speed: update.speed ?? null,
      heading: update.heading ?? null,
      timestamp: update.timestamp,
    }
  }

  disconnect(): void {
    this.socket?.disconnect()
    this.socket = null
    this.startSent = false
    this.hadConnected = false
    this.lastPublished = null
    this.riders.clear()
    this.setConnection('offline')
  }

  onRiderLocations(listener: (riders: RiderLocation[]) => void): () => void {
    this.riderListener = listener
    return () => {
      if (this.riderListener === listener) this.riderListener = null
    }
  }

  onConnectionState(listener: (state: RealtimeConnection) => void): () => void {
    this.connectionListener = listener
    return () => {
      if (this.connectionListener === listener) this.connectionListener = null
    }
  }

  private setConnection(state: RealtimeConnection): void {
    this.connectionListener?.(state)
  }
}
