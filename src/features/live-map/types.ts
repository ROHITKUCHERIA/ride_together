import type { ConnectionState } from '../../types'

export type RiderPresence = 'live' | 'delayed' | 'stale' | 'offline'

export interface LocationUpdate {
  userId: string
  tripId: string
  latitude: number
  longitude: number
  accuracy: number
  speed: number | null
  heading: number | null
  timestamp: number
}

export interface RiderLocation extends LocationUpdate {
  name: string
  bike: string
  accent: string
  isMe?: boolean
}

/** Presence is derived from `timestamp` age; stored locations never mutate presence. */
export type TripLocationState = {
  riders: RiderLocation[]
  updatedAt: number
}

export type RealtimeConnection = ConnectionState

export type MapViewMode = 'follow' | 'group' | 'free'

export type GpsMode = 'inactive' | 'starting' | 'active' | 'paused' | 'denied' | 'error' | 'unsupported'

export type GpsErrorKind = 'permission_denied' | 'position_unavailable' | 'timeout' | 'network' | 'unsupported'

export interface GpsError {
  kind: GpsErrorKind
  message: string
}

export interface GpsUiState {
  mode: GpsMode
  error: string | null
  accuracy: number | null
}

export type GroupHealth = 'together' | 'spreading' | 'split'

export interface GroupMetrics {
  nearest: { name: string; distanceMeters: number } | null
  farthest: { name: string; distanceMeters: number } | null
  health: GroupHealth
  splitRider: { name: string; distanceMeters: number } | null
}
