import { apiRequest } from '../lib/apiClient'
import type { RequestOptions } from '../lib/apiClient'
import type {
  JamControlInput,
  JamStatePayload,
} from '../types/jam'

/** Active Jam for a trip, or null when none exists. */
export function getTripJam(
  tripId: string,
  options: RequestOptions = {},
): Promise<JamStatePayload | null> {
  return apiRequest<JamStatePayload | null>(`/api/trips/${tripId}/jam`, options)
}

/** Create a Jam (caller becomes Host). Returns the existing one when active. */
export function createTripJam(tripId: string): Promise<JamStatePayload> {
  return apiRequest<JamStatePayload>(`/api/trips/${tripId}/jam`, {
    method: 'POST',
  })
}

/** Authoritative state of a specific Jam. */
export function getJamState(jamId: string): Promise<JamStatePayload> {
  return apiRequest<JamStatePayload>(`/api/jam/${jamId}/state`)
}

/** Join a Jam as a participant. */
export function joinJam(jamId: string): Promise<JamStatePayload> {
  return apiRequest<JamStatePayload>(`/api/jam/${jamId}/join`, {
    method: 'POST',
  })
}

/** Leave a Jam (hosts end the Jam instead). */
export function leaveJam(jamId: string): Promise<JamStatePayload> {
  return apiRequest<JamStatePayload>(`/api/jam/${jamId}/leave`, {
    method: 'POST',
  })
}

/** End/delete a Jam (Host only). */
export async function deleteJam(jamId: string): Promise<void> {
  await apiRequest(`/api/jam/${jamId}`, { method: 'DELETE' })
}

/** Host-only playback control (play/pause/seek/song change/next). */
export function jamControl(
  jamId: string,
  input: JamControlInput,
): Promise<JamStatePayload> {
  return apiRequest<JamStatePayload>(`/api/jam/${jamId}/control`, {
    method: 'POST',
    body: input,
  })
}
