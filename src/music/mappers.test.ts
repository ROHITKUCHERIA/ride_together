import { describe, expect, it } from 'vitest'
import { searchResultToPlayerSong, tripSongToPlayerSong } from './mappers'
import type { TripSongItem, YouTubeVideoResult } from '../types/api'

const tripSong: TripSongItem = {
  id: 'ts-1',
  songId: 's-1',
  youtubeVideoId: 'vid-1',
  title: 'Safarnama',
  channelTitle: 'Lucky Ali',
  thumbnailUrl: 'https://img.youtube.com/vi/vid-1/hqdefault.jpg',
  durationSeconds: 282,
  addedBy: { id: 'u1', name: 'Rohit' },
  addedAt: '2026-08-13T12:00:00.000Z',
}

const result: YouTubeVideoResult = {
  videoId: 'vid-2',
  title: 'Manali Trance',
  channelTitle: 'The Local Train',
  thumbnailUrl: 'https://img.youtube.com/vi/vid-2/hqdefault.jpg',
  publishedAt: '2026-01-01T00:00:00.000Z',
}

describe('tripSongToPlayerSong', () => {
  it('maps library metadata into a playable song', () => {
    const song = tripSongToPlayerSong(tripSong)
    expect(song).toEqual({
      id: 's-1',
      videoId: 'vid-1',
      title: 'Safarnama',
      artist: 'Lucky Ali',
      thumbnailUrl: 'https://img.youtube.com/vi/vid-1/hqdefault.jpg',
      duration: 282,
    })
  })

  it('carries only safe metadata (no secrets)', () => {
    const song = tripSongToPlayerSong(tripSong)
    expect(song).not.toHaveProperty('addedBy')
    expect(song).not.toHaveProperty('addedAt')
    expect(song.videoId).toBe('vid-1')
  })
})

describe('searchResultToPlayerSong', () => {
  it('maps a search result into a single playable song', () => {
    const song = searchResultToPlayerSong(result)
    expect(song).toEqual({
      id: 'vid-2',
      videoId: 'vid-2',
      title: 'Manali Trance',
      artist: 'The Local Train',
      thumbnailUrl: 'https://img.youtube.com/vi/vid-2/hqdefault.jpg',
      duration: undefined,
    })
  })
})