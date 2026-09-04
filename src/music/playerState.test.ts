import { describe, expect, it } from 'vitest'
import {
  currentItem,
  currentSong,
  formatTime,
  initialMusicState,
  musicReducer,
  toQueue,
} from './playerState'
import type { PlayerSong } from './playerState'

const a: PlayerSong = { id: 'a', videoId: 'va', title: 'Song A', artist: 'Artist A', thumbnailUrl: null, duration: 200 }
const b: PlayerSong = { id: 'b', videoId: 'vb', title: 'Song B', artist: 'Artist B', thumbnailUrl: null, duration: 210 }
const c: PlayerSong = { id: 'c', videoId: 'vc', title: 'Song C', artist: 'Artist C', thumbnailUrl: null, duration: 220 }

describe('musicReducer', () => {
  it('PLAY_SONGS replaces the queue and starts the requested song', () => {
    const next = musicReducer(initialMusicState(), { type: 'PLAY_SONGS', items: [a, b, c], startIndex: 1 })
    expect(next.queue).toHaveLength(3)
    expect(next.currentIndex).toBe(1)
    expect(currentSong(next)?.id).toBe('b')
    expect(next.isPlaying).toBe(true)
    expect(next.loading).toBe(true)
    expect(next.currentTime).toBe(0)
    expect(next.duration).toBe(210)
    expect(next.error).toBeNull()
  })

  it('PLAY_SONGS with an empty list is a no-op', () => {
    const state = musicReducer(initialMusicState(), { type: 'PLAY_SONGS', items: [], startIndex: 0 })
    expect(state.queue).toHaveLength(0)
    expect(state.currentIndex).toBe(-1)
  })

  it('clamps startIndex into the queue bounds', () => {
    const next = musicReducer(initialMusicState(), { type: 'PLAY_SONGS', items: [a, b], startIndex: 99 })
    expect(next.currentIndex).toBe(1)
  })

  it('TOGGLE_PLAY pauses and resumes', () => {
    const playing = musicReducer(initialMusicState(), { type: 'PLAY_SONGS', items: [a], startIndex: 0 })
    const paused = musicReducer(playing, { type: 'TOGGLE_PLAY' })
    expect(paused.isPlaying).toBe(false)
    const resumed = musicReducer(paused, { type: 'TOGGLE_PLAY' })
    expect(resumed.isPlaying).toBe(true)
  })

  it('TOGGLE_PLAY with an empty queue is a no-op', () => {
    const next = musicReducer(initialMusicState(), { type: 'TOGGLE_PLAY' })
    expect(next.isPlaying).toBe(false)
  })

  it('NEXT advances and wraps', () => {
    const playing = musicReducer(initialMusicState(), { type: 'PLAY_SONGS', items: [a, b], startIndex: 0 })
    const next = musicReducer(playing, { type: 'NEXT' })
    expect(currentSong(next)?.id).toBe('b')
    const wrap = musicReducer(next, { type: 'NEXT' })
    expect(currentSong(wrap)?.id).toBe('a')
  })

  it('NEXT with an empty queue is a no-op', () => {
    const next = musicReducer(initialMusicState(), { type: 'NEXT' })
    expect(next.currentIndex).toBe(-1)
  })

  it('PREV wraps to the previous song when playback just started', () => {
    const playing = musicReducer(initialMusicState(), { type: 'PLAY_SONGS', items: [a, b], startIndex: 1 })
    const prev = musicReducer(playing, { type: 'PREV' })
    expect(currentSong(prev)?.id).toBe('a')
  })

  it('PREV restarts the current song when it has been playing a while', () => {
    const playing = musicReducer(initialMusicState(), { type: 'PLAY_SONGS', items: [a, b], startIndex: 1 })
    const withTime = musicReducer(playing, { type: 'SET_TIME', seconds: 12 })
    const prev = musicReducer(withTime, { type: 'PREV' })
    expect(currentSong(prev)?.id).toBe('b')
    expect(prev.currentTime).toBe(0)
    expect(prev.replayNonce).toBe(playing.replayNonce + 1)
  })

  it('SEEK clamps and bumps the seek nonce', () => {
    const playing = musicReducer(initialMusicState(), { type: 'PLAY_SONGS', items: [a], startIndex: 0 })
    const seeked = musicReducer(playing, { type: 'SEEK', seconds: 25 })
    expect(seeked.currentTime).toBe(25)
    expect(seeked.seekNonce).toBe(playing.seekNonce + 1)
    const clamped = musicReducer(seeked, { type: 'SEEK', seconds: 9999 })
    expect(clamped.currentTime).toBe(200)
    const negative = musicReducer(seeked, { type: 'SEEK', seconds: -5 })
    expect(negative.currentTime).toBe(0)
  })

  it('defaults to full (device) volume', () => {
    expect(initialMusicState().volume).toBe(100)
  })

  it('SET_VOLUME clamps to 0..100', () => {
    let next = musicReducer(initialMusicState(), { type: 'SET_VOLUME', volume: 150 })
    expect(next.volume).toBe(100)
    next = musicReducer(next, { type: 'SET_VOLUME', volume: -3 })
    expect(next.volume).toBe(0)
  })

  it('TOGGLE_MUTE flips muted', () => {
    const next = musicReducer(initialMusicState(), { type: 'TOGGLE_MUTE' })
    expect(next.muted).toBe(true)
    const back = musicReducer(next, { type: 'TOGGLE_MUTE' })
    expect(back.muted).toBe(false)
  })

  it('SONG_ENDED auto-advances to the next available song', () => {
    const playing = musicReducer(initialMusicState(), { type: 'PLAY_SONGS', items: [a, b], startIndex: 0 })
    const next = musicReducer(playing, { type: 'SONG_ENDED' })
    expect(currentSong(next)?.id).toBe('b')
    expect(next.isPlaying).toBe(true)
  })

  it('SONG_ENDED on the last track stops gracefully', () => {
    const playing = musicReducer(initialMusicState(), { type: 'PLAY_SONGS', items: [a, b], startIndex: 1 })
    const stopped = musicReducer(playing, { type: 'SONG_ENDED' })
    expect(stopped.isPlaying).toBe(false)
    expect(currentSong(stopped)?.id).toBe('b')
    expect(stopped.currentTime).toBe(0)
  })

  it('SONG_ENDED with an empty queue is safe', () => {
    const next = musicReducer(initialMusicState(), { type: 'SONG_ENDED' })
    expect(next.currentIndex).toBe(-1)
  })

  it('ADD_TO_QUEUE appends at the end', () => {
    const playing = musicReducer(initialMusicState(), { type: 'PLAY_SONGS', items: [a], startIndex: 0 })
    const next = musicReducer(playing, { type: 'ADD_TO_QUEUE', song: b })
    expect(next.queue.map((q) => q.song.id)).toEqual(['a', 'b'])
    expect(next.currentIndex).toBe(0)
  })

  it('INSERT_NEXT inserts directly after the current song', () => {
    const playing = musicReducer(initialMusicState(), { type: 'PLAY_SONGS', items: [a, c], startIndex: 0 })
    const next = musicReducer(playing, { type: 'INSERT_NEXT', song: b })
    expect(next.queue.map((q) => q.song.id)).toEqual(['a', 'b', 'c'])
  })

  it('REMOVE_FROM_QUEUE removes the right key and fixes the index', () => {
    const playing = musicReducer(initialMusicState(), { type: 'PLAY_SONGS', items: [a, b, c], startIndex: 0 })
    const keyB = playing.queue[1].key
    const next = musicReducer(playing, { type: 'REMOVE_FROM_QUEUE', key: keyB })
    expect(next.queue.map((q) => q.song.id)).toEqual(['a', 'c'])
    expect(next.currentIndex).toBe(0)
  })

  it('CLEAR_QUEUE keeps only the current song', () => {
    const playing = musicReducer(initialMusicState(), { type: 'PLAY_SONGS', items: [a, b, c], startIndex: 1 })
    const next = musicReducer(playing, { type: 'CLEAR_QUEUE' })
    expect(next.queue).toHaveLength(1)
    expect(currentSong(next)?.id).toBe('b')
    expect(next.currentIndex).toBe(0)
  })

  it('SET_ERROR stops playback and clears on the next play', () => {
    const playing = musicReducer(initialMusicState(), { type: 'PLAY_SONGS', items: [a], startIndex: 0 })
    const errored = musicReducer(playing, { type: 'SET_ERROR', error: 'removed' })
    expect(errored.error).toBe('removed')
    expect(errored.isPlaying).toBe(false)
    expect(errored.loading).toBe(false)
    const retried = musicReducer(errored, { type: 'RETRY_CURRENT' })
    expect(retried.error).toBeNull()
    expect(retried.loading).toBe(true)
    expect(retried.retryNonce).toBe(errored.retryNonce + 1)
  })

  it('RESUME_PLAY clears the autoplay prompt and resumes', () => {
    const playing = musicReducer(initialMusicState(), { type: 'PLAY_SONGS', items: [a], startIndex: 0 })
    const blocked = musicReducer(playing, { type: 'SET_AUTOPLAY_BLOCKED', blocked: true })
    expect(blocked.needsPlayPrompt).toBe(true)
    const resumed = musicReducer(blocked, { type: 'RESUME_PLAY' })
    expect(resumed.needsPlayPrompt).toBe(false)
    expect(resumed.isPlaying).toBe(true)
  })

  it('multiple PLAY_SONGS keeps a single current song', () => {
    const first = musicReducer(initialMusicState(), { type: 'PLAY_SONGS', items: [a, b], startIndex: 0 })
    const second = musicReducer(first, { type: 'PLAY_SONGS', items: [c], startIndex: 0 })
    expect(second.queue).toHaveLength(1)
    expect(second.currentIndex).toBe(0)
    expect(currentSong(second)?.id).toBe('c')
  })
})

describe('queue helpers', () => {
  it('toQueue assigns unique keys even for identical songs', () => {
    const queue = toQueue([a, a, b])
    expect(queue).toHaveLength(3)
    expect(new Set(queue.map((q) => q.key)).size).toBe(3)
  })

  it('currentItem returns null when nothing is playing', () => {
    expect(currentItem(initialMusicState())).toBeNull()
    expect(currentSong(initialMusicState())).toBeNull()
  })
})

describe('formatTime', () => {
  it('formats seconds as m:ss', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(65)).toBe('1:05')
    expect(formatTime(310)).toBe('5:10')
    expect(formatTime(-4)).toBe('0:00')
  })
})

describe('Jam sync reducer', () => {
  it('JAM_SYNC loads the authoritative song and enters Jam mode', () => {
    const state = musicReducer(initialMusicState(), {
      type: 'JAM_SYNC',
      song: b,
      position: 84,
      isPlaying: true,
    })
    expect(currentSong(state)?.id).toBe('b')
    expect(state.jamMode).toBe(true)
    expect(state.isPlaying).toBe(true)
    expect(state.currentTime).toBe(84)
    expect(state.duration).toBe(210)
    expect(state.loading).toBe(true)
    expect(state.error).toBeNull()
  })

  it('JAM_SYNC on the same song re-applies position (drift correction)', () => {
    const first = musicReducer(initialMusicState(), {
      type: 'JAM_SYNC',
      song: b,
      position: 10,
      isPlaying: true,
    })
    const synced = musicReducer(first, {
      type: 'JAM_SYNC',
      song: b,
      position: 45,
      isPlaying: true,
    })
    expect(synced.queue).toHaveLength(1)
    expect(synced.currentTime).toBe(45)
    expect(synced.jamSyncNonce).toBe(first.jamSyncNonce + 1)
    expect(synced.jamMode).toBe(true)
  })

  it('JAM_END leaves Jam mode and stops playback', () => {
    const inJam = musicReducer(initialMusicState(), {
      type: 'JAM_SYNC',
      song: b,
      position: 30,
      isPlaying: true,
    })
    const ended = musicReducer(inJam, { type: 'JAM_END' })
    expect(ended.jamMode).toBe(false)
    expect(ended.isPlaying).toBe(false)
    expect(currentSong(ended)).not.toBeNull()
  })

  it('local transport actions are ignored while Jam mode is on', () => {
    const inJam = musicReducer(initialMusicState(), {
      type: 'JAM_SYNC',
      song: b,
      position: 30,
      isPlaying: true,
    })
    const toggled = musicReducer(inJam, { type: 'TOGGLE_PLAY' })
    expect(toggled.isPlaying).toBe(true)
    expect(toggled.jamSyncNonce).toBe(inJam.jamSyncNonce)

    const played = musicReducer(inJam, { type: 'PLAY_SONGS', items: [a], startIndex: 0 })
    expect(currentSong(played)?.id).toBe('b')

    const seeked = musicReducer(inJam, { type: 'SEEK', seconds: 99 })
    expect(seeked.currentTime).toBe(30)
  })

  it('SONG_ENDED does not auto-advance while Jam mode is on', () => {
    const inJam = musicReducer(initialMusicState(), {
      type: 'JAM_SYNC',
      song: a,
      position: 190,
      isPlaying: true,
    })
    const ended = musicReducer(inJam, { type: 'SONG_ENDED' })
    expect(currentSong(ended)?.id).toBe('a')
    expect(ended.isPlaying).toBe(false)
  })

  it('RESUME_PLAY still works while Jam mode is on (tap-to-sync)', () => {
    const inJam = musicReducer(initialMusicState(), {
      type: 'JAM_SYNC',
      song: b,
      position: 30,
      isPlaying: true,
    })
    const blocked = musicReducer(inJam, { type: 'SET_AUTOPLAY_BLOCKED', blocked: true })
    const resumed = musicReducer(blocked, { type: 'RESUME_PLAY' })
    expect(resumed.needsPlayPrompt).toBe(false)
    expect(resumed.isPlaying).toBe(true)
  })

  it('RESTORE_LAST_PLAY brings back the pre-Jam song paused at its position', () => {
    const inJam = musicReducer(initialMusicState(), {
      type: 'JAM_SYNC',
      song: b,
      position: 84,
      isPlaying: true,
    })
    const restored = musicReducer(inJam, { type: 'RESTORE_LAST_PLAY', song: a, position: 120 })
    expect(currentSong(restored)?.id).toBe('a')
    expect(restored.currentTime).toBe(120)
    expect(restored.jamMode).toBe(false)
    expect(restored.isPlaying).toBe(false)
    expect(restored.loading).toBe(true)
  })
})