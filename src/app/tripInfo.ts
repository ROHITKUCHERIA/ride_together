import type { Rider, TripInfo } from '../types'
import type { Trip, TripMember } from '../types/api'

const ACCENTS = ['#ff6b2c', '#3ddc84', '#4dc4ff', '#ffb14d', '#e0242f', '#c084fc', '#34d399', '#22d3ee', '#f472b6']

export function formatTripDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(s)))
}

function tripDays(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime()
  const end = new Date(endIso).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 1
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1)
}

/** Maps the backend trip/members payload onto the demo `TripInfo` shape so the
 * existing TripRoom presentation layer renders without changes. */
export function toDemoTrip(trip: Trip, members: TripMember[], currentUserId: string): TripInfo {
  const creator = members.find((m) => m.role === 'OWNER')?.name ?? 'Trip'
  const riders: Rider[] = members.map((m, i) => ({
    id: m.id,
    name: m.name,
    bike: 'Rider',
    status: 'offline',
    speed: undefined,
    distanceKm: undefined,
    lastUpdate: 'not sharing location',
    lat: 0,
    lng: 0,
    isMe: m.id === currentUserId,
    accent: ACCENTS[i % ACCENTS.length],
  }))

  const routeKm =
    trip.startLatitude != null &&
    trip.startLongitude != null &&
    trip.destinationLatitude != null &&
    trip.destinationLongitude != null
      ? distanceKm(trip.startLatitude, trip.startLongitude, trip.destinationLatitude, trip.destinationLongitude)
      : 0

  return {
    id: trip.id,
    slug: trip.id,
    name: trip.name,
    destination: trip.destination,
    origin: trip.startLocation?.trim() || 'Start',
    distanceKm: routeKm,
    days: tripDays(trip.startDate, trip.endDate),
    startDate: formatTripDate(trip.startDate),
    endDate: formatTripDate(trip.endDate),
    creator,
    inviteCode: trip.inviteCode,
    inviteUrl: `${window.location.origin}/app?invite=${trip.inviteCode}`,
    riders,
    songs: [],
    playlists: [],
  }
}

export interface TripMapRoute {
  origin: [number, number] | null
  destination: [number, number] | null
}

export function tripMapRoute(trip: Trip): TripMapRoute {
  return {
    origin:
      trip.startLatitude != null && trip.startLongitude != null
        ? [trip.startLatitude, trip.startLongitude]
        : null,
    destination:
      trip.destinationLatitude != null && trip.destinationLongitude != null
        ? [trip.destinationLatitude, trip.destinationLongitude]
        : null,
  }
}