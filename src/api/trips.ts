import { apiRequest } from '../lib/apiClient'
import type {
  CreateTripInput,
  MemberRole,
  Paginated,
  Trip,
  TripMember,
  UpdateTripInput,
} from '../types/api'

export async function listTrips(page = 1, limit = 50): Promise<Paginated<Trip>> {
  return apiRequest<Paginated<Trip>>(`/api/trips?page=${page}&limit=${limit}`)
}

export async function getTrip(tripId: string): Promise<Trip> {
  return apiRequest<Trip>(`/api/trips/${tripId}`)
}

export async function createTrip(input: CreateTripInput): Promise<Trip> {
  return apiRequest<Trip>('/api/trips', { method: 'POST', body: input })
}

export async function updateTrip(tripId: string, input: UpdateTripInput): Promise<Trip> {
  return apiRequest<Trip>(`/api/trips/${tripId}`, { method: 'PUT', body: input })
}

export async function deleteTrip(tripId: string): Promise<void> {
  await apiRequest(`/api/trips/${tripId}`, { method: 'DELETE' })
}

export async function joinTrip(inviteCode: string): Promise<Trip> {
  return apiRequest<Trip>('/api/trips/join', { method: 'POST', body: { inviteCode } })
}

export async function leaveTrip(tripId: string): Promise<void> {
  await apiRequest(`/api/trips/${tripId}/leave`, { method: 'POST' })
}

export async function startTrip(tripId: string): Promise<void> {
  await apiRequest(`/api/trips/${tripId}/start`, { method: 'POST' })
}

export async function completeTrip(tripId: string): Promise<void> {
  await apiRequest(`/api/trips/${tripId}/complete`, { method: 'POST' })
}

export async function cancelTrip(tripId: string): Promise<void> {
  await apiRequest(`/api/trips/${tripId}/cancel`, { method: 'POST' })
}

export async function getTripMembers(tripId: string): Promise<TripMember[]> {
  return apiRequest<TripMember[]>(`/api/trips/${tripId}/members`)
}

export interface RiderLocationPayload {
  userId: string
  name: string
  avatarUrl: string | null
  latitude: number
  longitude: number
  accuracy: number
  speed: number | null
  heading: number | null
  lastUpdatedAt: string
  status: string
}

export async function getTripLocations(tripId: string): Promise<RiderLocationPayload[]> {
  return apiRequest<RiderLocationPayload[]>(`/api/trips/${tripId}/locations`)
}

export async function updateMemberRole(
  tripId: string,
  userId: string,
  role: MemberRole,
): Promise<void> {
  await apiRequest(`/api/trips/${tripId}/members/${userId}/role`, {
    method: 'PATCH',
    body: { role },
  })
}

export async function removeMember(tripId: string, userId: string): Promise<void> {
  await apiRequest(`/api/trips/${tripId}/members/${userId}`, { method: 'DELETE' })
}

export async function transferOwnership(tripId: string, newOwnerId: string): Promise<void> {
  await apiRequest(`/api/trips/${tripId}/transfer-ownership`, {
    method: 'POST',
    body: { newOwnerId },
  })
}