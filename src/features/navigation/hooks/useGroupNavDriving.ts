import { useEffect, useMemo, useRef } from 'react'
import { useStore } from '../../live-map/state/observable'
import { useConnection } from '../../live-map/hooks/useLiveMap'
import { rideController } from '../../live-map/services/rideController'
import { navigationStore } from '../state/navigationStore'
import { groupNavStore } from '../state/groupNavStore'
import { useGroupNavigation } from './useGroupNavigation'
import type { GroupNavigationStatus } from '../types'

/** Client-side safety valve: report at most once per 15s during a drive. */
const MOTION_REPORT_INTERVAL_MS = 15_000

/**
 * Bridges the local turn-by-turn driver (useNavigation) into the shared group
 * (backend sessions + ETA), ONLY while the rider drives to the trip's shared
 * destination. Lifecycle:
 *   navigating  → start a group session once
 *   every tick  → throttle-reported status/ETA (that is the group ETA source)
 *   off_route / rerouting / gps_lost → reported as transitions
 *   completed   → arrived (excluded from the group ETA)
 *   ready/idle  → stop the session (the rider left the drive)
 *
 * Demo mode (no backend socket) is a no-op: the MockRealtimeService mirrors a
 * mock group state instead.
 */
export function useGroupNavDriving() {
  const navState = useStore(navigationStore)
  const group = useStore(groupNavStore)
  const connection = useConnection()
  const tripId = group.tripId ?? undefined
  const groupNavApi = useGroupNavigation(tripId)

  const activeRef = useRef(false)
  const arrivedSentRef = useRef(false)
  const lastMotionRef = useRef<{ at: number; status: string }>({ at: 0, status: '' })

  const backend = rideController.getSocketRealtime() !== null
  const driving = useMemo(() => {
    const d = navState.destination
    const g = group.destination
    if (!d || !g) return false
    const latClose = Math.abs(d.latitude - g.latitude) < 1e-5
    const lngClose = Math.abs(d.longitude - g.longitude) < 1e-5
    return latClose && lngClose
  }, [navState.destination, group.destination])

  // --- lifecycle: start / arrive / stop ----------------------------------
  useEffect(() => {
    if (!backend || !driving) return
    const status = navState.status
    if (status === 'navigating') {
      if (!activeRef.current) {
        activeRef.current = true
        arrivedSentRef.current = false
        lastMotionRef.current = { at: 0, status: '' }
        void groupNavApi.startSession()
      }
      return
    }
    if (status === 'completed') {
      if (activeRef.current && !arrivedSentRef.current) {
        arrivedSentRef.current = true
        activeRef.current = false
        const eta = navState.progress?.etaEpochMs ?? Date.now()
        void groupNavApi.reportStatus('arrived', { eta })
      }
      return
    }
    // ready / idle / locating left the drive → stop the session.
    if (activeRef.current) {
      activeRef.current = false
      void groupNavApi.stopSession()
    }
  }, [backend, driving, navState.status, navState.progress?.etaEpochMs, groupNavApi])

  // --- motion reporting: transitions + throttled ETA heartbeat ----------
  useEffect(() => {
    if (!backend || !driving || !activeRef.current) return
    if (navState.status !== 'navigating') return

    const status: GroupNavigationStatus = navState.rerouting
      ? 'rerouting'
      : navState.offRoute
        ? 'off_route'
        : navState.gpsLost
          ? 'gps_lost'
          : 'navigating'

    const now = Date.now()
    const last = lastMotionRef.current
    const transitioned = last.status !== status
    const timeUp = now - last.at >= MOTION_REPORT_INTERVAL_MS
    if (!transitioned && !timeUp) return

    lastMotionRef.current = { at: now, status }
    void groupNavApi.reportStatus(status, {
      eta: navState.progress?.etaEpochMs ?? undefined,
      distanceRemainingMeters: navState.remainingDistanceMeters ?? undefined,
    })
  }, [
    backend,
    driving,
    groupNavApi,
    navState.status,
    navState.rerouting,
    navState.offRoute,
    navState.gpsLost,
    navState.progress?.etaEpochMs,
    navState.remainingDistanceMeters,
  ])

  return { connection }
}