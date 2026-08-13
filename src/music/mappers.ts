import type { TripSongItem, YouTubeVideoResult } from '../types/api'
import type { PlayerSong } from './playerState'

/** Maps a Trip Music library song into a playable PlayerSong. */
export function tripSongToPlayerSong(song: TripSongItem): PlayerSong {
  return {
    id: song.songId,
    videoId: song.youtubeVideoId,
    title: song.title,
    artist: song.channelTitle,
    thumbnailUrl: song.thumbnailUrl,
    duration: song.durationSeconds ?? undefined,
  }
}

/** Maps a YouTube search result into a playable PlayerSong. */
export function searchResultToPlayerSong(result: YouTubeVideoResult): PlayerSong {
  return {
    id: result.videoId,
    videoId: result.videoId,
    title: result.title,
    artist: result.channelTitle,
    thumbnailUrl: result.thumbnailUrl,
  }
}