/**
 * Pure music-player state. All queue/track logic lives here as a reducer so
 * it stays unit-testable and independent from the imperative YouTube iframe.
 * The provider dispatches actions and reconciles the actual player.
 */

export interface PlayerSong {
  /** Stable id unique across the current source (songId for library songs). */
  id: string
  videoId: string
  title: string
  artist: string
  thumbnailUrl: string | null
  duration?: number
}

export interface QueueItem {
  key: string
  song: PlayerSong
}

export interface MusicState {
  queue: QueueItem[]
  currentIndex: number
  isPlaying: boolean
  loading: boolean
  ready: boolean
  needsPlayPrompt: boolean
  duration: number
  currentTime: number
  volume: number
  muted: boolean
  error: string | null
  /** Increments on every user seek so the provider can react to it. */
  seekNonce: number
  /** Increments on a retry so the provider reloads the same video. */
  retryNonce: number
  /** Increments when a track restarts while already loaded (prev/next wrap). */
  replayNonce: number
  fullPlayerOpen: boolean
}

export type MusicAction =
  | { type: 'PLAY_SONGS'; items: PlayerSong[]; startIndex: number }
  | { type: 'PLAY_AT'; index: number }
  | { type: 'TOGGLE_PLAY' }
  | { type: 'SET_PLAYING'; playing: boolean }
  | { type: 'NEXT' }
  | { type: 'PREV' }
  | { type: 'SONG_ENDED' }
  | { type: 'SEEK'; seconds: number }
  | { type: 'SET_TIME'; seconds: number }
  | { type: 'SET_DURATION'; seconds: number }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_READY'; ready: boolean }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'SET_AUTOPLAY_BLOCKED'; blocked: boolean }
  | { type: 'SET_VOLUME'; volume: number }
  | { type: 'TOGGLE_MUTE' }
  | { type: 'ADD_TO_QUEUE'; song: PlayerSong }
  | { type: 'INSERT_NEXT'; song: PlayerSong }
  | { type: 'REMOVE_FROM_QUEUE'; key: string }
  | { type: 'CLEAR_QUEUE' }
  | { type: 'RETRY_CURRENT' }
  | { type: 'RESUME_PLAY' }
  | { type: 'OPEN_FULL' }
  | { type: 'CLOSE_FULL' }

export function initialMusicState(volume = 80, muted = false): MusicState {
  return {
    queue: [],
    currentIndex: -1,
    isPlaying: false,
    loading: false,
    ready: false,
    needsPlayPrompt: false,
    duration: 0,
    currentTime: 0,
    volume,
    muted,
    error: null,
    seekNonce: 0,
    retryNonce: 0,
    replayNonce: 0,
    fullPlayerOpen: false,
  }
}

let keySeq = 0

function nextKey(song: PlayerSong): string {
  keySeq += 1
  return `${song.id}:${keySeq}`
}

export function toQueue(items: PlayerSong[]): QueueItem[] {
  return items.map((song) => ({ key: nextKey(song), song }))
}

export function isCurrentAt(state: MusicState, index: number): boolean {
  return index === state.currentIndex
}

export function currentItem(state: MusicState): QueueItem | null {
  return state.currentIndex >= 0 && state.currentIndex < state.queue.length
    ? state.queue[state.currentIndex]
    : null
}

export function currentSong(state: MusicState): PlayerSong | null {
  return currentItem(state)?.song ?? null
}

function clampTime(seconds: number, duration: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0
  if (duration > 0) return Math.min(seconds, duration)
  return seconds
}

function startLoading(base: MusicState, index: number, isPlaying: boolean): MusicState {
  const item = base.queue[index]
  if (!item) return base
  return {
    ...base,
    currentIndex: index,
    isPlaying,
    loading: true,
    needsPlayPrompt: false,
    error: null,
    currentTime: 0,
    duration: item.song.duration ?? 0,
    replayNonce: base.replayNonce + 1,
  }
}

export function musicReducer(state: MusicState, action: MusicAction): MusicState {
  switch (action.type) {
    case 'PLAY_SONGS': {
      if (action.items.length === 0) return state
      const queue = toQueue(action.items)
      const index = Math.min(Math.max(0, action.startIndex), queue.length - 1)
      return startLoading({ ...state, queue }, index, true)
    }

    case 'PLAY_AT': {
      const index = action.index
      if (index < 0 || index >= state.queue.length) return state
      return startLoading(state, index, true)
    }

    case 'TOGGLE_PLAY': {
      if (!currentItem(state)) return state
      const playing = !state.isPlaying
      return {
        ...state,
        isPlaying: playing,
        needsPlayPrompt: playing ? false : state.needsPlayPrompt,
        error: playing ? null : state.error,
      }
    }

    case 'SET_PLAYING': {
      if (!currentItem(state)) return state
      return {
        ...state,
        isPlaying: action.playing,
        needsPlayPrompt: action.playing ? false : state.needsPlayPrompt,
        error: action.playing ? null : state.error,
      }
    }

    case 'NEXT': {
      const n = state.queue.length
      if (n === 0) return state
      if (state.currentIndex < 0) return startLoading(state, 0, true)
      return startLoading(state, (state.currentIndex + 1) % n, true)
    }

    case 'PREV': {
      const n = state.queue.length
      if (n === 0) return state
      if (state.currentIndex < 0) return startLoading(state, 0, true)
      // Restart the current track if it has been playing for a few seconds.
      if (state.currentTime >= 3) {
        return {
          ...state,
          currentTime: 0,
          replayNonce: state.replayNonce + 1,
        }
      }
      return startLoading(state, (state.currentIndex + n - 1) % n, true)
    }

    case 'SONG_ENDED': {
      const next = state.currentIndex + 1
      if (next < state.queue.length) {
        return startLoading(state, next, true)
      }
      // Graceful stop when there is nothing left in the queue.
      return { ...state, isPlaying: false, currentTime: 0, needsPlayPrompt: false }
    }

    case 'SEEK': {
      return {
        ...state,
        currentTime: clampTime(action.seconds, state.duration),
        seekNonce: state.seekNonce + 1,
      }
    }

    case 'SET_TIME': {
      return { ...state, currentTime: clampTime(action.seconds, state.duration) }
    }

    case 'SET_DURATION': {
      return { ...state, duration: action.seconds > 0 ? action.seconds : state.duration }
    }

    case 'SET_LOADING': {
      return { ...state, loading: action.loading }
    }

    case 'SET_READY': {
      return { ...state, ready: action.ready }
    }

    case 'SET_ERROR': {
      return {
        ...state,
        error: action.error,
        loading: action.error ? false : state.loading,
        isPlaying: action.error ? false : state.isPlaying,
      }
    }

    case 'SET_AUTOPLAY_BLOCKED': {
      return { ...state, needsPlayPrompt: action.blocked }
    }

    case 'SET_VOLUME': {
      const volume = Math.min(100, Math.max(0, Math.round(action.volume)))
      if (volume === state.volume) return state
      return { ...state, volume }
    }

    case 'TOGGLE_MUTE': {
      return { ...state, muted: !state.muted }
    }

    case 'ADD_TO_QUEUE': {
      return {
        ...state,
        queue: [...state.queue, { key: nextKey(action.song), song: action.song }],
      }
    }

    case 'INSERT_NEXT': {
      const at = state.currentIndex >= 0 ? state.currentIndex + 1 : state.queue.length
      const queue = [...state.queue]
      queue.splice(at, 0, { key: nextKey(action.song), song: action.song })
      return { ...state, queue }
    }

    case 'REMOVE_FROM_QUEUE': {
      const current = state.currentIndex
      const removed = state.queue.findIndex((item) => item.key === action.key)
      if (removed === -1) return state
      const queue = state.queue.filter((item) => item.key !== action.key)
      let currentIndex = current
      if (removed < current) currentIndex -= 1
      else if (removed === current) currentIndex = queue.length > 0 ? Math.min(removed, queue.length - 1) : -1
      return { ...state, queue, currentIndex }
    }

    case 'CLEAR_QUEUE': {
      const current = currentItem(state)
      if (!current) return { ...state, queue: [], currentIndex: -1 }
      // Keep the song that is playing; clear everything else so it stops
      // gracefully when done and the queue is visibly empty.
      return { ...state, queue: [current], currentIndex: 0, isPlaying: state.isPlaying }
    }

    case 'RETRY_CURRENT': {
      if (!currentItem(state)) return state
      return {
        ...state,
        loading: true,
        error: null,
        needsPlayPrompt: false,
        retryNonce: state.retryNonce + 1,
      }
    }

    case 'RESUME_PLAY': {
      if (!currentItem(state)) return state
      return {
        ...state,
        isPlaying: true,
        needsPlayPrompt: false,
        error: null,
      }
    }

    case 'OPEN_FULL': {
      return { ...state, fullPlayerOpen: true }
    }

    case 'CLOSE_FULL': {
      return { ...state, fullPlayerOpen: false }
    }
  }
}

/** Formats integer seconds as m:ss (kept UI-agnostic for easier testing). */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}