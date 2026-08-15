import { useEffect, useMemo } from 'react'
import { rideController } from '../services/rideController'
import { hasGeolocationPermission } from '../services/LocationService'
import { useConnection, useGps, useRiders } from './useLiveMap'
import type { TripStatus } from '../../../types/api'
import type { GpsState, Rider } from '../../../types'
import { mergeRosterWithRealtime, toRoomRiders } from '../utils/riderMapper'

const ENDED_STATUSES: ReadonlySet<TripStatus> = new Set(['COMPLETED', 'CANCELLED'])

interface UseTripRealtimeOptions {
  /** Backend trip id for the realtime room. Undefined = demo (mock) mode. */
  tripId?: string
  /** Trip status — gates live GPS sharing on ended trips. */
  status?: TripStatus
  /** Static member roster (trip metadata) merged with live rider data. */
  roster?: Rider[]
}

/**
 * Owns the room-level realtime lifecycle: connects the Socket.IO service when
 * a backend trip is active, joins the trip room, and disposes everything on
 * unmount or when the trip ends.
 *
 * Realtime sources are already derived in the live-map stores, so the room
 * subscribes through the same hooks the map uses — there is no second socket.
 */
export function useTripRealtime({ tripId, status, roster }: UseTripRealtimeOptions) {
  const ended = status !== undefined && ENDED_STATUSES.has(status)

  // Connect once per trip. When the trip is ended we never open a realtime
  // session (the backend rejects ended-trip updates anyway).
  useEffect(() => {
    if (!tripId || ended) return
    rideController.init(tripId, { backend: true })
    return () => rideController.dispose()
  }, [tripId, ended])

  // Stop GPS sharing immediately if the trip transitions to ended while the
  // room is mounted (e.g. the owner marks it COMPLETED from the manage sheet).
  useEffect(() => {
    if (ended) rideController.pauseLocationSharing()
  }, [ended])

  // If the browser already holds geolocation permission for this site, begin
  // sharing right away — entering a trip with location already enabled must
  // not show the "Location unavailable" prompt. Auto-start only happens on a
  // confirmed "granted" state; pending/denied still surface the Enable prompt.
  useEffect(() => {
    if (!tripId || ended) return
    let cancelled = false
    void hasGeolocationPermission().then((granted) => {
      if (granted && !cancelled) rideController.startSharingLocation()
    })
    return () => {
      cancelled = true
    }
  }, [tripId, ended])

  const connection = useConnection()
  const gps = useGps()
  const { riders } = useRiders()

// Room-level GPS banner state: a working fix (or one being acquired) counts
// as "tracking". Anything else (inactive / paused / denied / error) surfaces
// the room's location prompt — 'starting' is transient and needs no prompt.
const gpsState: GpsState =
  gps.mode === 'active' || gps.mode === 'starting' ? 'tracking' : 'unavailable'

  // Realtime riders projected onto the room-level Rider shape. `me` is used
  // for distance-from-user on the riders list. When a roster is supplied the
  // two are merged so members who have not shared a location still appear.
  const roomRiders = useMemo(() => {
    const me = riders.find((r) => r.isMe) ?? null
    const live = toRoomRiders(riders, me)
    return roster && roster.length > 0 ? mergeRosterWithRealtime(roster, live) : live
  }, [riders, roster])

  return { connection, gps, gpsState, roomRiders }
}
