import { useCallback, useEffect, useRef } from 'react'
import { useStore } from '../../live-map/state/observable'
import { useConnection } from '../../live-map/hooks/useLiveMap'
import { rideController } from '../../live-map/services/rideController'
import { groupNavStore, type GroupNavState } from '../state/groupNavStore'
import * as navApi from '../../../api/navigation'
import type {
  GeoPoint,
  GroupNavigationStatus,
} from '../types'

export interface GroupNavigationApi extends GroupNavState {
  /** Re-fetch the trip's group navigation snapshot (reconnect recovery). */
  refresh: () => Promise<void>
  /** Host only: set/update the shared destination. Returns true on success. */
  setDestination: (input: { latitude: number; longitude: number; name?: string }) => Promise<boolean>
  /** Host only: clear the shared destination. Returns true on success. */
  clearDestination: () => Promise<boolean>
  /** Start (or restart) OUR group navigation session. */
  startSession: () => Promise<void>
  /** Report our status/ETA to the group (broadcast to every rider). */
  reportStatus: (
    status: GroupNavigationStatus,
    opts?: { eta?: number; distanceRemainingMeters?: number },
  ) => Promise<void>
  /** Stop our group navigation session. */
  stopSession: () => Promise<void>
  /** Group reroute with requestId idempotency. Returns null when rejected
   *  (e.g. inside the cooldown window) so callers keep the current route. */
  reroute: (origin: GeoPoint, destination: GeoPoint) => Promise<{ requestId: string; route: unknown } | null>
  me: { userId: string; tripId: string } | null
}

function newRequestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `reroute-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
}

/**
 * Group navigation API for the current user. REST mutations (Host destination,
 * my session, group reroute) plus the live mirror from the shared socket.
 * Snapshot refreshes on mount + every reconnect so recovery never needs a
 * manual refresh. In demo (mock) mode the REST calls are skipped because there
 * is no backend socket to talk to — the MockRealtimeService mirrors state.
 */
export function useGroupNavigation(tripId?: string): GroupNavigationApi {
  const state = useStore(groupNavStore)
  const connection = useConnection()

  const tripIdRef = useRef(tripId)
  tripIdRef.current = tripId
  const prevConnectionRef = useRef(connection)

  const backend = rideController.getSocketRealtime()

  const refresh = useCallback(async () => {
    const t = tripIdRef.current
    if (!t || !rideController.getSocketRealtime()) return
    try {
      const snapshot = await navApi.getGroupNavigationSnapshot(t, { quiet: true })
      groupNavStore.applySnapshot(t, snapshot)
    } catch {
      // Keep the current mirror; the next reconnect (or manual retry) refreshes.
    }
  }, [])

  useEffect(() => {
    if (tripId) void refresh()
  }, [tripId, refresh])

  // Reconnect recovery: when the transport re-establishes, re-sync the group
  // snapshot while riding out any socket.state gaps.
  useEffect(() => {
    const prev = prevConnectionRef.current
    prevConnectionRef.current = connection
    if (connection === 'connected' && prev === 'reconnecting') {
      void refresh()
    }
  }, [connection, refresh])

  const setDestination = useCallback(
    async (input: { latitude: number; longitude: number; name?: string }) => {
      const t = tripIdRef.current
      if (!t) return false
      try {
        const result = await navApi.setTripDestination(t, input)
        if (result.destination) {
          groupNavStore.applyDestination(t, result.destination)
          return true
        }
      } catch {
        /* surfaced by the host panel */
      }
      return false
    },
    [],
  )

  const clearDestination = useCallback(async () => {
    const t = tripIdRef.current
    if (!t) return false
    try {
      await navApi.clearTripDestination(t)
      groupNavStore.applyDestination(t, null)
      return true
    } catch {
      return false
    }
  }, [])

  const startSession = useCallback(async () => {
    const t = tripIdRef.current
    if (!t || !rideController.getSocketRealtime()) return
    try {
      const payload = await navApi.startNavigationSession(t, 'group')
      groupNavStore.applyNavEvent('navigation:started', payload)
    } catch {
      /* destination missing / throttled — the group panel mirrors the server */
    }
  }, [])

  const reportStatus = useCallback(
    async (status: GroupNavigationStatus, opts: { eta?: number; distanceRemainingMeters?: number } = {}) => {
      const t = tripIdRef.current
      if (!t || !rideController.getSocketRealtime()) return
      try {
        const payload = await navApi.updateNavigationSession(t, {
          status,
          eta: opts.eta,
          distanceRemainingMeters: opts.distanceRemainingMeters,
        })
        groupNavStore.applyNavEvent('navigation:status', payload)
      } catch {
        /* a transition outside our window is fine — the server stays authoritative */
      }
    },
    [],
  )

  const stopSession = useCallback(async () => {
    const t = tripIdRef.current
    const realtime = rideController.getSocketRealtime()
    if (!t || !realtime) return
    const me = realtime.identity
    if (!me) return
    try {
      await navApi.stopNavigationSession(t)
    } finally {
      groupNavStore.applyNavEvent('navigation:stopped', {
        tripId: t,
        userId: me.userId,
        mode: 'group',
        status: 'idle',
        updatedAt: new Date().toISOString(),
      })
    }
  }, [])

  const reroute = useCallback(
    async (origin: GeoPoint, destination: GeoPoint) => {
      const t = tripIdRef.current
      const realtime = rideController.getSocketRealtime()
      if (!t || !realtime) return null
      try {
        return await navApi.requestGroupReroute(t, origin, destination, newRequestId())
      } catch {
        return null // cooldown or routing failure — caller keeps the current route
      }
    },
    [],
  )

  const me = backend?.identity ?? null

  return {
    ...state,
    refresh,
    setDestination,
    clearDestination,
    startSession,
    reportStatus,
    stopSession,
    reroute,
    me,
  }
}