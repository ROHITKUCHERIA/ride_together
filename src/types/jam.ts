/**
 * Realtime Jam session types shared between the REST API and Socket.IO events.
 * `positionAt` and `serverTime` are epoch-millis on the SERVER clock — the
 * client skew-corrects so every device converges to the same playback position.
 */

export type JamStatus = 'ACTIVE' | 'ENDED' | 'DELETED'

export interface JamSong {
  songId: string
  youtubeVideoId: string
  title: string
  channelTitle: string
  thumbnailUrl: string | null
  durationSeconds: number | null
}

export interface JamParticipant {
  userId: string
  name: string
  avatarUrl: string | null
  joinedAt: string
}

export interface JamStatePayload {
  jamId: string
  tripId: string
  hostId: string
  hostName: string
  status: JamStatus
  isPlaying: boolean
  position: number
  positionAt: number
  stateVersion: number
  hostOnline: boolean
  currentSong: JamSong | null
  participants: JamParticipant[]
  serverTime: number
}

export type JamControlAction = 'play' | 'pause' | 'seek' | 'song_changed' | 'next'

export interface JamControlInput {
  action: JamControlAction
  songId?: string
  position?: number
  isPlaying?: boolean
}

export interface JamDeletedPayload {
  jamId: string
  tripId: string
  reason: 'HOST_ENDED'
}
