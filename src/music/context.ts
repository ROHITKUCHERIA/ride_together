import { createContext, useContext } from 'react'
import type { MusicState, PlayerSong, QueueItem } from './playerState'

export interface MusicPlayerContextValue {
  state: MusicState
  current: QueueItem | null
  /** Plays a list of songs, starting at startIndex. Replaces the queue. */
  playSongs: (items: PlayerSong[], startIndex?: number) => void
  /** Plays a single song (creates a one-item queue). */
  play: (song: PlayerSong) => void
  /** Jumps to a queue entry and plays it. */
  playIndex: (index: number) => void
  togglePlay: () => void
  next: () => void
  prev: () => void
  seek: (seconds: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  addToQueue: (song: PlayerSong) => void
  playSongNext: (song: PlayerSong) => void
  removeFromQueue: (key: string) => void
  clearQueue: () => void
  retryCurrent: () => void
  /** Clears the "Tap play to start" prompt and resumes playback. */
  resumePlay: () => void
  /** Pauses the current song. */
  pause: () => void
  openFullPlayer: () => void
  closeFullPlayer: () => void
  /** Enables/disables the Jam remote-control mode. While enabled, local
   *  transport actions (play/pause/next/prev/seek/queue edits) are ignored. */
  setJamMode: (mode: boolean) => void
  /** Applies an authoritative Jam state transition: loads `song` if needed,
   *  moves to `position` (seconds) and sets play/pause. The provider re-seeks
   *  when the player is ready. */
  jamSync: (song: PlayerSong, position: number, isPlaying: boolean) => void
  /** Exits Jam mode, stops the shared playback and returns to normal local
   *  player behavior (the current track stays available). */
  jamEnd: () => void
  /** Restores the song the user was listening to before a Jam took over their
   *  player — shown paused at the position where they left it. */
  restoreLastPlay: (song: PlayerSong, position: number) => void
  /** Reads the live playback position straight from the underlying player. */
  getPlayerPosition: () => number
}

export const MusicPlayerContext = createContext<MusicPlayerContextValue | null>(null)

export function useMusicPlayer(): MusicPlayerContextValue {
  const ctx = useContext(MusicPlayerContext)
  if (!ctx) throw new Error('useMusicPlayer must be used within MusicPlayerProvider')
  return ctx
}