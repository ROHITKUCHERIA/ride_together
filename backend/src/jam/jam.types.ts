/**
 * The authoritative Jam state every client converges to. `positionAt` and
 * `serverTime` are epoch-millis on the SERVER clock so clients can compute the
 * duck-clock-correct current position (`position + (serverNow - positionAt)/1000`)
 * instead of trusting per-frame frames over the network.
 */
export interface JamSongState {
  songId: string;
  youtubeVideoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
}

export interface JamParticipantState {
  userId: string;
  name: string;
  avatarUrl: string | null;
  joinedAt: string;
}

export interface JamState {
  jamId: string;
  tripId: string;
  hostId: string;
  hostName: string;
  status: 'ACTIVE' | 'ENDED' | 'DELETED';
  isPlaying: boolean;
  /** Position (seconds) captured at `positionAt` on the server clock. */
  position: number;
  positionAt: number;
  /** Monotonic version — clients ignore stale broadcasts. */
  stateVersion: number;
  hostOnline: boolean;
  currentSong: JamSongState | null;
  participants: JamParticipantState[];
  /** Server epoch-millis when this state snapshot was produced. */
  serverTime: number;
}

export type JamEndReason = 'HOST_ENDED';

export interface JamDeletedPayload {
  jamId: string;
  tripId: string;
  reason: JamEndReason;
}