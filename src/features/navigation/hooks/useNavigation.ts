import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useStore } from '../../live-map/state/observable'
import { useGps, useRiders } from '../../live-map/hooks/useLiveMap'
import { rideController } from '../../live-map/services/rideController'
import { gpsStore } from '../../live-map/state/gpsStore'
import { navigationStore } from '../state/navigationStore'
import { groupNavStore } from '../state/groupNavStore'
import { calculateRoute } from '../services/RoutingService'
import { requestGroupReroute } from '../../../api/navigation'
import { computeNavigationProgress, instructionsAlongRoute } from '../services/navigationProgress'
import { ReroutePolicy, type RerouteConfig } from '../services/rerouting'
import { VoiceGuidanceService, type VoiceGuidance } from '../services/voiceGuidance'
import { resolveHeading, type HeadingState } from '../services/heading'
import {
  NAV_ARRIVAL_THRESHOLD_METERS,
  NAV_AUTO_REROUTE_DELAY_MS,
  NAV_AUTO_REROUTE_ENABLED,
  NAV_AUTO_REROUTE_MIN_INTERVAL_MS,
  NAV_GPS_POOR_ACCURACY_METERS,
  NAV_GPS_SIGNAL_LOST_AFTER_MS,
  NAV_HEADING_MAX_STEP_DEG,
  NAV_MANEUVER_COMPLETION_THRESHOLD_METERS,
  NAV_MANEUVER_FAR_THRESHOLD_METERS,
  NAV_MANEUVER_NEAR_THRESHOLD_METERS,
  NAV_OFF_ROUTE_CONFIRMATION_SAMPLES,
  NAV_OFF_ROUTE_MAX_ACCURACY_METERS,
  NAV_OFF_ROUTE_THRESHOLD_METERS,
  NAV_RECENTER_ZOOM,
  NAV_ROUTE_CACHE_TTL_MS,
  NAV_VOICE_ENABLED,
} from '../config'
import {
  isArrived,
  isOffRoute,
} from '../utils/routeProgress'
import { maneuverVoicePhrase } from '../utils/maneuver'
import { calculateDistanceInMeters } from '../../live-map/utils/geo'
import type {
  GeoPoint,
  NavigationDestination,
  RouteResult,
} from '../types'

/** Cached route promises keyed by origin+destination. Since origin is always the
 *  rider's current position at request time, a moved rider gets a fresh key and
 *  a fresh route — the initial route is never recomputed per GPS tick. Entries
 *  expire after NAV_ROUTE_CACHE_TTL_MS. */
interface CacheEntry {
  at: number
  pending: Promise<RouteResult>
}
const routeCache = new Map<string, CacheEntry>()

/** Test/debug helper — drops cached routes so a retry re-fetches. */
export function clearNavigationRouteCache(): void {
  routeCache.clear()
}

/** Idempotency key for group reroutes (crypto UUID with a clock fallback). */
function newRequestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `reroute-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
}

const MIN_ORIGIN_DEST_DISTANCE_METERS = 20
const ROUTE_UPDATED_DURATION_MS = 3000
const NOTICE_DURATION_MS = 4000

const REROUTE_CONFIG: RerouteConfig = {
  enabled: NAV_AUTO_REROUTE_ENABLED,
  delayMs: NAV_AUTO_REROUTE_DELAY_MS,
  minIntervalMs: NAV_AUTO_REROUTE_MIN_INTERVAL_MS,
  confirmationSamples: NAV_OFF_ROUTE_CONFIRMATION_SAMPLES,
}

const HEADING_CONFIG = {
  minMovementMeters: 8,
  maxStepDeg: NAV_HEADING_MAX_STEP_DEG,
  poorAccuracyMeters: NAV_GPS_POOR_ACCURACY_METERS,
}

interface MapLike {
  flyTo: (center: [number, number], zoom?: number, options?: Record<string, unknown>) => void
}

/**
 * State machine + actions for turn-by-turn navigation (Phase 2). GPS position
 * comes from the existing shared rider store (same throttled watcher the live
 * map uses — no duplicate watcher). Route calculation, progress, maneuvers,
 * automatic rerouting and voice guidance are layered on top; group rider
 * tracking / Socket.IO are never touched here.
 */
export function useNavigation() {
  const gps = useGps()
  const { riders } = useRiders()
  const state = useStore(navigationStore)

  const me = useMemo(() => riders.find((r) => r.isMe) ?? null, [riders])
  const position = useMemo<GeoPoint | null>(
    () => (me ? { latitude: me.latitude, longitude: me.longitude } : null),
    [me],
  )
  const meAccuracy = me?.accuracy ?? null
  const meHeading = me?.heading ?? null

  const positionRef = useRef<GeoPoint | null>(null)
  positionRef.current = position
  const wantsToDriveRef = useRef(false)

  /** Precomputed instruction → distance-along-route cache, refreshed per route. */
  const alongCacheRef = useRef<ReturnType<typeof instructionsAlongRoute> | null>(null)
  const reroutePolicyRef = useRef<ReroutePolicy>(new ReroutePolicy(REROUTE_CONFIG))
  const rerouteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const voiceRef = useRef<VoiceGuidance | null>(null)
  if (!voiceRef.current) voiceRef.current = new VoiceGuidanceService({ enabled: NAV_VOICE_ENABLED })
  const headingStateRef = useRef<HeadingState>({ heading: null, lastPosition: null })

  /* Keep the store's voice toggle in sync with the service on mount. */
  useEffect(() => {
    navigationStore.setVoiceEnabled(voiceRef.current?.isEnabled() ?? false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchRouteCached = useCallback(
    async (origin: GeoPoint, destination: NavigationDestination): Promise<RouteResult> => {
      const key = `${origin.latitude.toFixed(5)},${origin.longitude.toFixed(5)}|${destination.latitude.toFixed(5)},${destination.longitude.toFixed(5)}`
      const now = Date.now()
      const existing = routeCache.get(key)
      if (existing && now - existing.at < NAV_ROUTE_CACHE_TTL_MS) {
        return existing.pending
      }
      if (existing) routeCache.delete(key)
      const pending = calculateRoute(origin, destination)
      routeCache.set(key, { at: now, pending })
      pending.catch(() => routeCache.delete(key))
      return pending
    },
    [],
  )

  /**
   * Route fetch for (re)routing. Solo destinations use the local route cache +
   * provider backend exactly as before. When driving the trip's SHARED
   * destination over the backend socket, reroutes go through the group endpoint
   * so the distributed cooldown + observer broadcasts apply — and the echoed
   * requestId guarantees only the newest response is ever applied (stale
   * responses are discarded, never overwriting a fresher route).
   */
  const latestRerouteRef = useRef<string | null>(null)

  const fetchGroupAwareRoute = useCallback(
    async (origin: GeoPoint, destination: NavigationDestination): Promise<RouteResult> => {
      const group = groupNavStore.getState().destination
      const realtime = rideController.getSocketRealtime()
      const isGroupTarget =
        group !== null &&
        realtime !== null &&
        Math.abs(group.latitude - destination.latitude) < 1e-5 &&
        Math.abs(group.longitude - destination.longitude) < 1e-5
      if (!isGroupTarget) return fetchRouteCached(origin, destination)

      const tripId = realtime.identity?.tripId
      if (!tripId) return fetchRouteCached(origin, destination)

      const requestId = newRequestId()
      latestRerouteRef.current = requestId
      const result = await requestGroupReroute(
        tripId,
        { latitude: origin.latitude, longitude: origin.longitude },
        { latitude: destination.latitude, longitude: destination.longitude },
        requestId,
      )
      if (latestRerouteRef.current !== result.requestId) {
        // A newer reroute won the race — never apply this stale route.
        return navigationStore.getState().route ?? result.route
      }
      return result.route
    },
    [fetchRouteCached],
  )

  /* Cancel any pending reroute evaluation (back on route, cooldown, leaving). */
  const clearRerouteTimer = useCallback(() => {
    if (rerouteTimerRef.current !== null) {
      clearTimeout(rerouteTimerRef.current)
      rerouteTimerRef.current = null
    }
  }, [])

  /* Replaces the active route without leaving the navigating state (auto and
   * manual reroute). The old route stays rendered on failure. */
  const performReroute = useCallback(async () => {
    const { destination, rerouting } = navigationStore.getState()
    if (rerouting) return
    if (!destination) return
    const current = positionRef.current
    if (!current) return

    clearRerouteTimer()
    const policy = reroutePolicyRef.current
    policy.begin()
    navigationStore.setRerouting(true)
    navigationStore.setRouteUpdated(false)
    navigationStore.setNotice(null)
    navigationStore.setError(null)

    try {
      const route = await fetchGroupAwareRoute(current, destination)
      navigationStore.setRoute(route)
      alongCacheRef.current = instructionsAlongRoute(route)
      policy.succeed()
      voiceRef.current?.reset()
      navigationStore.setOffRoute(false)
      navigationStore.setRerouting(false)
      navigationStore.setRouteUpdated(true)
      window.setTimeout(() => navigationStore.setRouteUpdated(false), ROUTE_UPDATED_DURATION_MS)
    } catch (err) {
      policy.fail()
      navigationStore.setRerouting(false)
      const message =
        err instanceof Error && err.message ? err.message : 'Unable to recalculate route'
      navigationStore.setNotice(message)
      window.setTimeout(() => navigationStore.setNotice(null), NOTICE_DURATION_MS)
    }
  }, [fetchGroupAwareRoute, clearRerouteTimer])

  /* Once a deviation is confirmed, re-evaluate after the delay elapses — even
   * if the GPS fix stops updating mid-deviation. Without this, a frozen fix
   * could leave the rider waiting forever for the reroute request. */
  const armRerouteTimer = useCallback(() => {
    if (rerouteTimerRef.current !== null) return
    rerouteTimerRef.current = setTimeout(() => {
      rerouteTimerRef.current = null
      if (navigationStore.getState().status !== 'navigating') return
      if (reroutePolicyRef.current.sample(true, Date.now()) === 'trigger') {
        void performReroute()
      }
    }, REROUTE_CONFIG.delayMs)
  }, [performReroute])

  /* Drop the pending timer when the hook unmounts. */
  useEffect(() => clearRerouteTimer, [clearRerouteTimer])

  const computeRoute = useCallback(
    async (origin: GeoPoint, destination: NavigationDestination): Promise<void> => {
      const tooClose = calculateDistanceInMeters(
        origin.latitude,
        origin.longitude,
        destination.latitude,
        destination.longitude,
      )
      if (tooClose < MIN_ORIGIN_DEST_DISTANCE_METERS) {
        navigationStore.setError('Destination is too close to your current location.')
        navigationStore.setStatus('error')
        return
      }

      navigationStore.setStatus('route_loading')
      navigationStore.setError(null)
      try {
        const route = await fetchRouteCached(origin, destination)
        navigationStore.setRoute(route)
        alongCacheRef.current = instructionsAlongRoute(route)
        reroutePolicyRef.current = new ReroutePolicy(REROUTE_CONFIG)
        clearRerouteTimer()
        voiceRef.current?.reset()
        navigationStore.setStatus('ready')
      } catch (err) {
        const message =
          err instanceof Error && err.message
            ? err.message
            : 'Could not calculate a route. Try again in a moment.'
        navigationStore.setError(message)
        navigationStore.setStatus('error')
      }
    },
    [fetchRouteCached, clearRerouteTimer],
  )

  /* GPS fix arrives: kick off a pending route or fall through to idle. */
  useEffect(() => {
    if (state.status !== 'locating') return
    if (!position) return
    if (state.destination && !state.route) {
      void computeRoute(position, state.destination)
    } else if (state.destination && state.route && wantsToDriveRef.current) {
      wantsToDriveRef.current = false
      navigationStore.setOffRoute(false)
      navigationStore.setStatus('navigating')
    } else if (!state.destination) {
      navigationStore.setStatus('idle')
    }
  }, [position, state.status, state.destination, state.route, computeRoute])

  /* Auto-start once the initial route is ready (user tapped Start while loading). */
  useEffect(() => {
    if (state.status === 'ready' && wantsToDriveRef.current) {
      wantsToDriveRef.current = false
      navigationStore.setOffRoute(false)
      navigationStore.setStatus('navigating')
    }
  }, [state.status])

  /* While navigating: progress, maneuvers, accuracy-aware off-route, automatic
   * rerouting, voice announcements, ETA and arrival. Runs per GPS tick only. */
  useEffect(() => {
    if (state.status !== 'navigating' || !position || !state.route || !state.destination) return
    const route = state.route

    navigationStore.setGpsAccuracy(meAccuracy)

    // Heading: device → movement bearing → hold; never rotate on a poor fix.
    const headingRes = resolveHeading(
      headingStateRef.current,
      { heading: meHeading, latitude: position.latitude, longitude: position.longitude, accuracy: meAccuracy },
      HEADING_CONFIG,
    )
    headingStateRef.current = headingRes.state
    navigationStore.setHeading(headingRes.result.heading)

    const progress = computeNavigationProgress(
      route,
      position,
      alongCacheRef.current,
      NAV_MANEUVER_COMPLETION_THRESHOLD_METERS,
    )
    navigationStore.setProgress(progress)
    navigationStore.setRemaining(progress.distanceRemainingMeters, progress.durationRemainingSeconds)

    // Accuracy-aware off-route: effective threshold = baseline + GPS accuracy
    // margin so one high-error fix cannot trigger a reroute.
    const effectiveThreshold =
      NAV_OFF_ROUTE_THRESHOLD_METERS +
      Math.min(meAccuracy ?? 0, NAV_OFF_ROUTE_MAX_ACCURACY_METERS)
    const drifted = isOffRoute(position, route, effectiveThreshold)
    const trustworthy =
      meAccuracy === null || meAccuracy <= NAV_GPS_POOR_ACCURACY_METERS
    navigationStore.setOffRoute(drifted && trustworthy)

    // Automatic rerouting (policy gates cooldown, samples, delay, in-flight).
    const decision = reroutePolicyRef.current.sample(drifted && trustworthy, Date.now())
    if (decision === 'trigger') {
      clearRerouteTimer()
      void performReroute()
    } else if (decision === 'confirming') {
      armRerouteTimer()
    } else {
      clearRerouteTimer()
    }

    // Voice countdown for the current maneuver (far → near, never repeated).
    const voice = voiceRef.current
    const inst = progress.currentInstruction
    if (voice && inst && progress.distanceToCurrentInstructionMeters !== null && inst.type !== 'arrive') {
      const d = progress.distanceToCurrentInstructionMeters
      if (d <= NAV_MANEUVER_NEAR_THRESHOLD_METERS) {
        voice.speak(`${inst.id}:near`, maneuverVoicePhrase(inst, 'near'))
      } else if (d <= NAV_MANEUVER_FAR_THRESHOLD_METERS) {
        voice.speak(`${inst.id}:far`, maneuverVoicePhrase(inst, 'far', d))
      }
    }

    // Arrival: proximity on the route + within destination threshold.
    if (isArrived(position, state.destination, NAV_ARRIVAL_THRESHOLD_METERS)) {
      voice?.speak('arrive', 'You have arrived at your destination.', true)
      navigationStore.setStatus('completed')
    }
  }, [
    position,
    me,
    meAccuracy,
    meHeading,
    state.status,
    state.route,
    state.destination,
    performReroute,
    clearRerouteTimer,
    armRerouteTimer,
  ])

  /* GPS starvation while driving surfaces a "signal lost" notice, even when
   * the fix disappears entirely (no position at all). */
  useEffect(() => {
    if (state.status !== 'navigating') {
      navigationStore.setGpsLost(false)
      return
    }
    const lost =
      !position ||
      !me ||
      Date.now() - me.timestamp > NAV_GPS_SIGNAL_LOST_AFTER_MS
    navigationStore.setGpsLost(lost)
  }, [position, me, state.status])

  const openNavigation = useCallback(() => {
    const mode = gpsStore.getState().mode
    if (mode !== 'active' && mode !== 'starting') rideController.startSharingLocation()
    if (!navigationStore.getState().destination) navigationStore.setStatus('locating')
  }, [])

  const setDestination = useCallback(
    (destination: NavigationDestination | null) => {
      navigationStore.setError(null)
      if (!destination) {
        navigationStore.setDestination(null)
        navigationStore.setRoute(null)
        navigationStore.setRemaining(null, null)
        navigationStore.setProgress(null)
        navigationStore.setOffRoute(false)
        navigationStore.setNotice(null)
        navigationStore.setStatus('idle')
        return
      }
      navigationStore.setDestination(destination)
      navigationStore.setRoute(null)
      const current = positionRef.current
      if (current) {
        void computeRoute(current, destination)
      } else {
        navigationStore.setStatus('locating')
      }
    },
    [computeRoute],
  )

  const clearDestination = useCallback(() => setDestination(null), [setDestination])

  const startNavigation = useCallback(() => {
    const { destination, route } = navigationStore.getState()
    if (!destination) return
    if (!positionRef.current) {
      wantsToDriveRef.current = true
      rideController.startSharingLocation()
      navigationStore.setStatus('locating')
      return
    }
    if (!route) {
      wantsToDriveRef.current = true
      navigationStore.setStatus('locating')
      void computeRoute(positionRef.current, destination)
      return
    }
    wantsToDriveRef.current = false
    navigationStore.setOffRoute(false)
    navigationStore.setStatus('navigating')
  }, [computeRoute])

  const stopNavigation = useCallback(() => {
    clearRerouteTimer()
    reroutePolicyRef.current.reset()
    voiceRef.current?.stop()
    navigationStore.setOffRoute(false)
    navigationStore.setRemaining(null, null)
    navigationStore.setProgress(null)
    navigationStore.setGpsLost(false)
    if (navigationStore.getState().route) {
      navigationStore.setStatus('ready')
    } else {
      navigationStore.setStatus('idle')
    }
  }, [clearRerouteTimer])

  /** Explicit re-route from the current position (off-route recovery). */
  const reroute = useCallback(() => {
    const policy = reroutePolicyRef.current
    // Manual reroutes respect the in-flight guard but not the auto cooldown.
    if (policy.isRerouting()) return
    const { destination } = navigationStore.getState()
    if (!destination) return
    const current = positionRef.current
    if (!current) {
      wantsToDriveRef.current = true
      rideController.startSharingLocation()
      navigationStore.setStatus('locating')
      return
    }
    wantsToDriveRef.current = true
    navigationStore.setOffRoute(false)
    void performReroute()
  }, [performReroute])

  const recenter = useCallback((map: MapLike | null) => {
    const pos = positionRef.current
    if (!map || !pos) return
    map.flyTo([pos.latitude, pos.longitude], NAV_RECENTER_ZOOM, { duration: 0.8 })
  }, [])

  const toggleVoice = useCallback(() => {
    const next = !navigationStore.getState().voiceEnabled
    voiceRef.current?.setEnabled(next)
    navigationStore.setVoiceEnabled(next)
  }, [])

  /** Map click → set destination (picking disabled while actively navigating). */
  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      const { status } = navigationStore.getState()
      if (status === 'navigating' || status === 'completed' || status === 'route_loading') return
      void setDestination({ latitude: lat, longitude: lng })
    },
    [setDestination],
  )

  return {
    gps,
    position,
    heading: state.heading,
    status: state.status,
    destination: state.destination,
    route: state.route,
    error: state.error,
    offRoute: state.offRoute,
    remainingDistanceMeters: state.remainingDistanceMeters,
    remainingDurationSeconds: state.remainingDurationSeconds,
    progress: state.progress,
    rerouting: state.rerouting,
    routeUpdated: state.routeUpdated,
    notice: state.notice,
    voiceEnabled: state.voiceEnabled,
    voiceSupported: voiceRef.current?.isSupported() ?? false,
    gpsLost: state.gpsLost,
    gpsAccuracy: state.gpsAccuracy,
    openNavigation,
    setDestination,
    clearDestination,
    startNavigation,
    stopNavigation,
    reroute,
    recenter,
    toggleVoice,
    handleMapClick,
  }
}

export type NavigationApi = ReturnType<typeof useNavigation>