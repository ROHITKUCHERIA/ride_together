import { trip, destinationCoord } from '../../../data/mockData'
import type { Rider, TripInfo } from '../../../types'
import type { LocationUpdate, RiderLocation, RealtimeConnection } from '../types'
import { BrowserLocationService } from './LocationService'
import type { DestinationUpdatedPayload, LocationService, RealtimeService } from './RealtimeService'
import type { NavigationSessionPayload } from '../../navigation/types'
import {
  MOCK_RECONNECT_AT_MS,
  MOCK_RECONNECT_DURATION_MS,
  MOCK_REALTIME_CONNECT_DELAY_MS,
  MOCK_RIDER_TICK_MS,
} from '../config'
import { calculateDistanceInMeters } from '../utils/geo'

type MockPresence = 'live' | 'delayed' | 'stale' | 'offline'

interface MockRider extends Rider {
  presence: MockPresence
  path: [number, number][]
  waypointIndex: number
}

const PRESENCE_AGE_MS: Record<MockPresence, number> = {
  live: 2_000,
  delayed: 18_000,
  stale: 45_000,
  offline: 8 * 60_000,
}

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

function buildPath(start: [number, number], dest: [number, number], seed: number): [number, number][] {
  const steps = 26
  const points: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const lat = start[0] + (dest[0] - start[0]) * t
    const lng = start[1] + (dest[1] - start[1]) * t
    const wobble = Math.sin(t * Math.PI * (2 + (seed % 3)) + seed) * 0.015
    const lateral = Math.sin((start[0] + dest[0]) * 57 + seed + t * 9) * 0.008
    points.push([lat + wobble * lateral, lng + lateral])
  }
  return points
}

/**
 * Move along a polyline by `distanceMeters`. Returns the new position,
 * the heading of the last traversed segment, and the next waypoint index.
 */
function advanceAlongPath(
  path: [number, number][],
  startIndex: number,
  distanceMeters: number,
): { lat: number; lng: number; index: number; heading: number } {
  let remaining = distanceMeters
  let index = Math.min(Math.max(startIndex, 0), path.length - 1)
  let lat = path[index][0]
  let lng = path[index][1]
  let heading = 0

  while (index < path.length - 1 && remaining > 0) {
    const a = path[index]
    const b = path[index + 1]
    const seg = calculateDistanceInMeters(a[0], a[1], b[0], b[1])
    heading = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI
    if (seg === 0) {
      index += 1
      continue
    }
    if (remaining >= seg) {
      remaining -= seg
      index += 1
      lat = b[0]
      lng = b[1]
    } else {
      const t = remaining / seg
      lat = a[0] + (b[0] - a[0]) * t
      lng = a[1] + (b[1] - a[1]) * t
      remaining = 0
    }
  }
  return { lat, lng, index, heading }
}

export class MockRealtimeService implements RealtimeService {
  readonly locationService: LocationService = new BrowserLocationService()

  private riders: MockRider[] = []
  private connection: RealtimeConnection = 'connected'
  private connected = false
  private tick: ReturnType<typeof setInterval> | null = null
  private connectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private riderListener: ((riders: RiderLocation[]) => void) | null = null
  private connectionListener: ((state: RealtimeConnection) => void) | null = null
  private groupNavListener: ((event: string, payload: NavigationSessionPayload) => void) | null = null
  private destinationListener: ((payload: DestinationUpdatedPayload) => void) | null = null
  private lastTickAt = 0
  private meOverride: { lat: number; lng: number; speed: number | null; heading: number | null } | null = null

  connect(): void {
    const tripData = trip as TripInfo
    this.riders = tripData.riders.map((r) => {
      // Presence mix: offline riders stay offline, Rahul (weak) is delayed,
      // Arjun simulates a stale ping, everyone else stays live.
      const presence: MockPresence =
        r.status === 'offline' ? 'offline' : r.status === 'weak' ? 'delayed' : r.id === 'r7' ? 'stale' : 'live'
      const start: [number, number] = [r.lat, r.lng]
      const path = buildPath(start, destinationCoord, hashString(r.name))
      return { ...r, presence, path, waypointIndex: 0 }
    })
    this.connectTimer = setTimeout(() => {
      this.connected = true
      this.lastTickAt = Date.now()
      this.tick = setInterval(() => this.onTick(), MOCK_RIDER_TICK_MS)
      this.onTick()
      this.scheduleReconnect()
      this.emitMockGroupNav()
    }, MOCK_REALTIME_CONNECT_DELAY_MS)
  }

  disconnect(): void {
    this.connected = false
    if (this.tick) clearInterval(this.tick)
    if (this.connectTimer) clearTimeout(this.connectTimer)
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.tick = null
    this.connection = 'connected'
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

  /** Demo group-nav broadcasts: a destination + a simulated "me" session. */
  onGroupNavEvent(listener: (event: string, payload: NavigationSessionPayload) => void): () => void {
    this.groupNavListener = listener
    return () => {
      if (this.groupNavListener === listener) this.groupNavListener = null
    }
  }

  onTripDestination(listener: (payload: DestinationUpdatedPayload) => void): () => void {
    this.destinationListener = listener
    return () => {
      if (this.destinationListener === listener) this.destinationListener = null
    }
  }

  /** Simulated group navigation state so the demo UI shows a live group ETA. */
  private emitMockGroupNav(): void {
    this.destinationListener?.({
      tripId: trip.id,
      destination: {
        latitude: destinationCoord[0],
        longitude: destinationCoord[1],
        name: 'Goa',
      },
    })
    const me = trip.riders.find((r) => r.isMe)
    if (!me) return
    this.groupNavListener?.('navigation:started', {
      tripId: trip.id,
      userId: me.id,
      mode: 'group',
      status: 'navigating',
      distanceRemainingMeters: 420_000,
      eta: Date.now() + 7.5 * 60 * 60 * 1000,
      updatedAt: new Date().toISOString(),
    })
  }

  publishLocation(update: LocationUpdate): void {
    this.meOverride = {
      lat: update.latitude,
      lng: update.longitude,
      speed: update.speed,
      heading: update.heading,
    }
  }

  stopSharing(): void {
    this.meOverride = null
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      this.setConnection('reconnecting')
      setTimeout(() => {
        this.setConnection('connected')
      }, MOCK_RECONNECT_DURATION_MS)
    }, MOCK_RECONNECT_AT_MS)
  }

  private setConnection(state: RealtimeConnection): void {
    if (this.connection === state) return
    this.connection = state
    this.connectionListener?.(state)
  }

  private onTick(): void {
    if (!this.connected) return
    const now = Date.now()
    const elapsed = Math.min((now - this.lastTickAt) / 1000, 3)
    this.lastTickAt = now

    const emitted: RiderLocation[] = this.riders.map((r) => {
      let lat = r.lat
      let lng = r.lng
      let heading: number | null = null
      let speed: number | null = r.speed ?? null

      if (r.isMe && this.meOverride) {
        lat = this.meOverride.lat
        lng = this.meOverride.lng
        speed = this.meOverride.speed
        heading = this.meOverride.heading
      } else if (r.presence !== 'offline') {
        const meters = ((r.speed ?? 70) * 1000 * elapsed) / 3600
        const next = advanceAlongPath(r.path, r.waypointIndex, meters)
        r.waypointIndex = next.index
        lat = next.lat
        lng = next.lng
        heading = next.heading
      }

      return {
        userId: r.id,
        name: r.name,
        bike: r.bike,
        accent: r.accent,
        isMe: r.isMe,
        tripId: trip.id,
        latitude: lat,
        longitude: lng,
        accuracy: 8,
        speed,
        heading,
        timestamp: now - PRESENCE_AGE_MS[r.presence],
      }
    })

    this.riderListener?.(emitted)
  }
}
