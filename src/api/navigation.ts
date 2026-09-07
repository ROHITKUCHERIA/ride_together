import { apiRequest } from '../lib/apiClient'
import type { RequestOptions } from '../lib/apiClient'
import type {
  GeoPoint,
  GroupDestination,
  GroupNavigationSnapshot,
  GroupNavigationStatus,
  NavigationSessionPayload,
  TripRerouteResult,
} from '../features/navigation/types'

export function getGroupNavigationSnapshot(
  tripId: string,
  options: RequestOptions = {},
): Promise<GroupNavigationSnapshot> {
  return apiRequest<GroupNavigationSnapshot>(`/api/trips/${tripId}/navigation`, options)
}

/** Start (or restart) my navigation session. Group sessions drive to the
 *  trip's shared destination; personal sessions are stored for reconnect only. */
export function startNavigationSession(
  tripId: string,
  mode: 'group' | 'personal' = 'group',
): Promise<NavigationSessionPayload> {
  return apiRequest<NavigationSessionPayload>(`/api/trips/${tripId}/navigation/session`, {
    method: 'POST',
    body: { mode },
    quiet: true,
  })
}

export function updateNavigationSession(
  tripId: string,
  input: {
    status: GroupNavigationStatus
    eta?: number
    distanceRemainingMeters?: number
  },
  options: RequestOptions = {},
): Promise<NavigationSessionPayload> {
  return apiRequest<NavigationSessionPayload>(`/api/trips/${tripId}/navigation/session`, {
    method: 'PATCH',
    body: input,
    ...options,
  })
}

export async function stopNavigationSession(tripId: string): Promise<void> {
  await apiRequest(`/api/trips/${tripId}/navigation/session`, {
    method: 'DELETE',
    quiet: true,
  })
}

/**
 * Group reroute with a client-supplied idempotency key. The backend echoes the
 * requestId back — the client applies only the newest response, so a slower
 * older reroute can never overwrite a fresher one.
 */
export async function requestGroupReroute(
  tripId: string,
  origin: GeoPoint,
  destination: GeoPoint,
  requestId: string,
  options: RequestOptions = {},
): Promise<TripRerouteResult> {
  return apiRequest<TripRerouteResult>(`/api/trips/${tripId}/navigation/reroute`, {
    method: 'POST',
    body: { origin, destination, requestId },
    ...options,
    quiet: true,
  })
}

export interface TripDestinationResult {
  destination: GroupDestination | null
}

/** Host only. Set/update the shared trip destination (broadcasts to the room). */
export function setTripDestination(
  tripId: string,
  input: { latitude: number; longitude: number; name?: string },
): Promise<TripDestinationResult> {
  return apiRequest<TripDestinationResult>(`/api/trips/${tripId}/destination`, {
    method: 'PUT',
    body: input,
  })
}

export function getTripDestination(
  tripId: string,
  options: RequestOptions = {},
): Promise<TripDestinationResult> {
  return apiRequest<TripDestinationResult>(`/api/trips/${tripId}/destination`, options)
}

/** Host only. Clear the shared trip destination (broadcasts to the room). */
export function clearTripDestination(tripId: string): Promise<TripDestinationResult> {
  return apiRequest<TripDestinationResult>(`/api/trips/${tripId}/destination`, {
    method: 'DELETE',
  })
}