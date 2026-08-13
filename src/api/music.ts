import { apiRequest } from '../lib/apiClient'
import type { TripMusicSearchPage, TripSongItem } from '../types/api'

/** Searches YouTube (server-side, cached) for songs a member can add. */
export async function searchTripMusic(
  tripId: string,
  q: string,
  pageToken?: string,
): Promise<TripMusicSearchPage> {
  const params = new URLSearchParams({ q })
  if (pageToken) params.set('pageToken', pageToken)
  return apiRequest<TripMusicSearchPage>(
    `/api/trips/${tripId}/music/search?${params.toString()}`,
  )
}

/** Lists the shared music library for a trip. */
export async function listTripMusic(tripId: string): Promise<TripSongItem[]> {
  return apiRequest<TripSongItem[]>(`/api/trips/${tripId}/music`)
}

/** Adds a song (by YouTube video id) to the trip's shared library. */
export async function addTripSong(
  tripId: string,
  youtubeVideoId: string,
): Promise<TripSongItem> {
  return apiRequest<TripSongItem>(`/api/trips/${tripId}/music`, {
    method: 'POST',
    body: { youtubeVideoId },
  })
}

/** Removes a song from the trip's library (OWNER/ADMIN/own adds). */
export async function removeTripSong(
  tripId: string,
  songId: string,
): Promise<void> {
  await apiRequest(`/api/trips/${tripId}/music/${songId}`, {
    method: 'DELETE',
  })
}
