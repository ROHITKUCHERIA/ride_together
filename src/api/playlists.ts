import { apiRequest } from '../lib/apiClient'
import type {
  CreatePlaylistInput,
  Playlist,
  PlaylistDetail,
  PlaylistSongItem,
  UpdatePlaylistInput,
} from '../types/api'

/** Lists my playlists (personal + any trip playlists I own). */
export async function listMyPlaylists(): Promise<Playlist[]> {
  return apiRequest<Playlist[]>('/api/playlists')
}

/** Lists the playlists visible in a trip (public + my own). */
export async function listTripPlaylists(tripId: string): Promise<Playlist[]> {
  return apiRequest<Playlist[]>(`/api/trips/${tripId}/playlists`)
}

/** Fetches one playlist including its songs. */
export async function getPlaylist(id: string): Promise<PlaylistDetail> {
  return apiRequest<PlaylistDetail>(`/api/playlists/${id}`)
}

export async function createPlaylist(input: CreatePlaylistInput): Promise<PlaylistDetail> {
  return apiRequest<PlaylistDetail>('/api/playlists', { method: 'POST', body: input })
}

export async function updatePlaylist(
  id: string,
  input: UpdatePlaylistInput,
): Promise<Playlist> {
  return apiRequest<Playlist>(`/api/playlists/${id}`, { method: 'PUT', body: input })
}

export async function deletePlaylist(id: string): Promise<void> {
  await apiRequest(`/api/playlists/${id}`, { method: 'DELETE' })
}

/** Adds a Song (already in the shared Song table) to a playlist. */
export async function addSongToPlaylist(
  playlistId: string,
  songId: string,
): Promise<PlaylistSongItem> {
  return apiRequest<PlaylistSongItem>(`/api/playlists/${playlistId}/songs`, {
    method: 'POST',
    body: { songId },
  })
}

/** Removes a song from a playlist (the Song itself is never deleted). */
export async function removeSongFromPlaylist(
  playlistId: string,
  songId: string,
): Promise<void> {
  await apiRequest(`/api/playlists/${playlistId}/songs/${songId}`, {
    method: 'DELETE',
  })
}

/** Applies a full new Song-id order to a playlist. */
export async function reorderPlaylistSongs(
  playlistId: string,
  songIds: string[],
): Promise<void> {
  await apiRequest(`/api/playlists/${playlistId}/songs/reorder`, {
    method: 'PATCH',
    body: { songIds },
  })
}