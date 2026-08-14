import type { Rider, RiderStatus } from '../../../types'
import type { RiderLocation, RiderPresence } from '../types'
import { PRESENCE_THRESHOLDS_MS } from '../config'
import { calculateDistanceInMeters } from './geo'

/**
 * Presence is derived from the age of a rider's last location timestamp — it
 * is never stored. Thresholds match the backend rider-status logic.
 */
export function presenceForAge(ageMs: number): RiderPresence {
  if (ageMs < 0) return 'live'
  if (ageMs <= PRESENCE_THRESHOLDS_MS.live) return 'live'
  if (ageMs <= PRESENCE_THRESHOLDS_MS.delayed) return 'delayed'
  if (ageMs <= PRESENCE_THRESHOLDS_MS.stale) return 'stale'
  return 'offline'
}

/** Realtime presence -> legacy drawer status (online / weak / offline). */
export function riderStatusForPresence(presence: RiderPresence): RiderStatus {
  if (presence === 'live') return 'online'
  if (presence === 'delayed' || presence === 'stale') return 'weak'
  return 'offline'
}

export function relativeTimeAgo(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts)
  const s = Math.floor(diff / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return `${h}h ago`
}

/**
 * Maps realtime rider locations onto the room-level `Rider` shape used by
 * RidersDrawer / OnlineIndicator. Distances are computed from the current
 * user's own location when available.
 */
export function toRoomRiders(
  locations: RiderLocation[],
  me: RiderLocation | null,
  now = Date.now(),
): Rider[] {
  return locations.map((loc) => {
    const presence = presenceForAge(now - loc.timestamp)
    const distanceKm =
      me && loc.userId !== me.userId
        ? calculateDistanceInMeters(
            me.latitude,
            me.longitude,
            loc.latitude,
            loc.longitude,
          ) / 1000
        : loc.userId === me?.userId
          ? 0
          : undefined
    return {
      id: loc.userId,
      name: loc.name,
      bike: loc.bike,
      status: riderStatusForPresence(presence),
      speed: loc.speed ?? undefined,
      distanceKm,
      lastUpdate: relativeTimeAgo(loc.timestamp, now),
      lat: loc.latitude,
      lng: loc.longitude,
      isMe: loc.isMe,
      accent: loc.accent,
    }
  })
}

/**
 * Merges the static member roster (from trip metadata) with live realtime
 * riders. Members who have not shared a location keep their roster entry as
 * offline; members with live data get their real presence/speed/position.
 */
export function mergeRosterWithRealtime(
  roster: Rider[],
  live: Rider[],
): Rider[] {
  const liveById = new Map(live.map((r) => [r.id, r]))
  return roster.map((member) => liveById.get(member.id) ?? { ...member, status: 'offline' })
}
