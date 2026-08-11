export type RiderStatus = 'online' | 'weak' | 'offline'

export interface Rider {
  id: string
  name: string
  bike: string
  status: RiderStatus
  speed?: number
  distanceKm?: number
  lastUpdate?: string
  lat: number
  lng: number
  isMe?: boolean
  accent: string
}

export interface Song {
  id: string
  title: string
  artist: string
  duration: number
  accentFrom: string
  accentTo: string
  provider: 'spotify' | 'youtube' | 'ridetogether'
  url: string
}

export type PlaylistScope = 'my' | 'trip'

export interface Playlist {
  id: string
  name: string
  emoji: string
  owner: string
  songCount: number
  scope: PlaylistScope
}

export interface TripInfo {
  id: string
  slug: string
  name: string
  destination: string
  origin: string
  distanceKm: number
  days: number
  startDate: string
  endDate: string
  creator: string
  inviteCode: string
  inviteUrl: string
  riders: Rider[]
  songs: Song[]
  playlists: Playlist[]
}

export type DrawerKind = 'playlists' | 'riders' | 'tripinfo' | null

export type ConnectionState = 'connected' | 'reconnecting'

export type GpsState = 'tracking' | 'unavailable'
