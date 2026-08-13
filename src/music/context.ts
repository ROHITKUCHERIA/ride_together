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
  openFullPlayer: () => void
  closeFullPlayer: () => void
}

export const MusicPlayerContext = createContext<MusicPlayerContextValue | null>(null)

export function useMusicPlayer(): MusicPlayerContextValue {
  const ctx = useContext(MusicPlayerContext)
  if (!ctx) throw new Error('useMusicPlayer must be used within MusicPlayerProvider')
  return ctx
}