import type { Trip, TripMember } from '../../types/api'

/**
 * Change detection for the room poll. Every poll returns fresh object
 * identities — without this, each cycle would rebuild the derived trip,
 * re-render the room and re-fit the live map (visible jump + tile reload)
 * even when nothing actually changed.
 */
export function haveMembersChanged(prev: TripMember[], next: TripMember[]): boolean {
  if (prev.length !== next.length) return true
  return next.some((m, i) => {
    const o = prev[i]
    return (
      o === undefined ||
      o.id !== m.id ||
      o.name !== m.name ||
      o.avatarUrl !== m.avatarUrl ||
      o.role !== m.role ||
      o.joinedAt !== m.joinedAt
    )
  })
}

/** Trips carry nested objects, so compare the serialized payload. */
export function hasTripChanged(prev: Trip | null, next: Trip): boolean {
  if (prev === null) return true
  return JSON.stringify(prev) !== JSON.stringify(next)
}
