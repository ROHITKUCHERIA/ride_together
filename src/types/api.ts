export type TripStatus = 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
export type MemberRole = 'OWNER' | 'ADMIN' | 'MEMBER'

export interface User {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  createdAt: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface LoginResponse extends AuthTokens {
  user?: User
}

export interface RegisterResponse {
  user: User
  accessToken: string
  refreshToken: string
}

export interface Trip {
  id: string
  name: string
  description: string | null
  startLocation: string | null
  destination: string
  startLatitude: number | null
  startLongitude: number | null
  destinationLatitude: number | null
  destinationLongitude: number | null
  startDate: string
  endDate: string
  status: TripStatus
  inviteCode: string
  createdBy: string
  createdAt: string
  updatedAt: string
  _count: { members: number }
}

export interface TripMember {
  id: string
  name: string
  avatarUrl: string | null
  role: MemberRole
  joinedAt: string
}

export interface CreateTripInput {
  name: string
  description?: string
  startLocation?: string
  destination: string
  startLatitude?: number
  startLongitude?: number
  destinationLatitude?: number
  destinationLongitude?: number
  startDate: string
  endDate: string
}

export interface UpdateTripInput extends Partial<CreateTripInput> {}

export interface Paginated<T> {
  data: T[]
  meta: { page: number; limit: number; total: number }
}

/** A YouTube search result returned by the backend search endpoint. */
export interface YouTubeVideoResult {
  videoId: string
  title: string
  channelTitle: string
  thumbnailUrl: string | null
  publishedAt: string
}

export interface TripMusicSearchPage {
  items: YouTubeVideoResult[]
  nextPageToken: string | null
  cached: boolean
}

/** A song in a trip's shared music library. */
export interface TripSongItem {
  id: string
  songId: string
  youtubeVideoId: string
  title: string
  channelTitle: string
  thumbnailUrl: string | null
  durationSeconds: number | null
  addedBy: { id: string; name: string }
  addedAt: string
}

/** A user playlist (personal or trip-linked). */
export interface Playlist {
  id: string
  name: string
  description: string | null
  isPublic: boolean
  createdAt: string
  updatedAt: string
  userId: string
  tripId: string | null
  owner: { id: string; name: string; avatarUrl: string | null }
  trip: { id: string; name: string } | null
  songCount: number
}

/** A song inside a playlist detail. */
export interface PlaylistSongItem {
  id: string
  playlistId: string
  position: number
  songId: string
  youtubeVideoId: string
  title: string
  channelTitle: string
  thumbnailUrl: string | null
  durationSeconds: number | null
  addedBy: { id: string; name: string }
  addedAt: string
}

export interface PlaylistDetail extends Playlist {
  songs: PlaylistSongItem[]
}

export interface CreatePlaylistInput {
  name: string
  description?: string
  tripId?: string
  isPublic?: boolean
}

export interface UpdatePlaylistInput {
  name?: string
  description?: string | null
  isPublic?: boolean
}
