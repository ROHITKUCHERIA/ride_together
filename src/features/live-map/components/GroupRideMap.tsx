import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { Map as LeafletMap, LatLngBoundsExpression } from 'leaflet'
import { ArrowLeft, CalendarRange, MapPin, Navigation, Radio, WifiOff } from 'lucide-react'
import type { MapViewMode } from '../types'
import { useStore } from '../state/observable'
import { navigationStore } from '../../navigation/state/navigationStore'
import { useNavigation } from '../../navigation/hooks/useNavigation'
import { NAV_GPS_POOR_ACCURACY_METERS } from '../../navigation/config'
import GroupNavPanel from '../../navigation/components/GroupNavPanel'
import NavigationOverlay from '../../navigation/components/NavigationOverlay'
import NavigationMapLayers from '../../navigation/components/NavigationMapLayers'
import { useGroupNav } from '../../navigation/state/groupNavStore'
import type { GroupDestination } from '../../navigation/types'
import { resolveTileProviders } from '../providers/mapProviders'
import { useRiders, useConnection, useGps, useGroupMetrics, presenceFor, presenceCounts } from '../hooks/useLiveMap'
import { rideController } from '../services/rideController'
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  FIT_GROUP_MAX_ZOOM,
  FOLLOW_MIN_MOVE_METERS,
  MAP_MAX_ZOOM,
  MAP_MIN_ZOOM,
  NAV_CAMERA_PITCH_DEG,
  NAVIGATION_ZOOM,
  SINGLE_RIDER_ZOOM,
} from '../config'
import { calculateDistanceInMeters } from '../utils/geo'
import { formatDistance, formatDuration, formatEta } from '../../navigation/utils/format'
import { useGroupAlert } from '../hooks/useGroupAlert'
import { useRiderStatusAlerts } from '../hooks/useRiderStatusAlerts'
import { mapCamera } from '../services/mapCamera'
import { trip as mockTrip } from '../../../data/mockData'
import { useIsMobile } from '../../../hooks/useMediaQuery'
import { useTheme } from '../../../theme/ThemeContext'
import { useAuth } from '../../../auth/AuthContext'
import type { Rider, TripInfo } from '../../../types'
import type { TripMapRoute } from '../../../app/tripInfo'
import RiderMarker from './RiderMarker'
import RouteLayer from './RouteLayer'
import MapControls from './MapControls'
import GroupStatusCard from './GroupStatusCard'
import GroupSummaryCard from './GroupSummaryCard'
import RiderCard from './RiderCard'
import RiderBottomSheet from './RiderBottomSheet'
import MapPermissionGate from './MapPermissionGate'
import MobileBottomNav from '../../../components/MobileBottomNav'

interface GroupRideMapProps {
  onClose: () => void
  onExitToMusic: () => void
  onExitToPlaylists: () => void
  onExitToRiders: () => void
  onExitToTripInfo: () => void
  /** Backend trip id for the realtime connection (pinned in real mode). */
  tripId?: string
  /** Force the backend Socket.IO service (real authenticated trips). */
  useBackend?: boolean
  /** The trip this map renders. Falls back to the demo trip when omitted. */
  trip?: TripInfo
  /** Start/destination coordinates for the route line (real mode). */
  mapRoute?: TripMapRoute
  /** Merged member roster (roster + live) driving every count display so the
      map's online/total numbers match the Riders list and trip info. */
  roster?: Rider[]
  /** Creator user id — marks the signed-in user as the Host in real mode. */
  createdBy?: string
}

export default function GroupRideMap({ onClose, onExitToMusic, onExitToPlaylists, onExitToRiders, onExitToTripInfo, tripId, useBackend, trip = mockTrip, mapRoute, roster, createdBy }: GroupRideMapProps) {
  const currentTrip = trip
  const isMobile = useIsMobile()
  const { riders } = useRiders()
  const connection = useConnection()
  const gps = useGps()
  const metrics = useGroupMetrics()
  const { user } = useAuth()
  const nav = useNavigation()
  const group = useGroupNav()
  const { alert: groupAlert, dismiss: dismissGroupAlert } = useGroupAlert()
  const { alert: statusAlert, dismiss: dismissStatusAlert } = useRiderStatusAlerts()

  const providers = useMemo(() => resolveTileProviders(), [])
  const { theme } = useTheme()
  const themeProviderId = useMemo(
    () =>
      providers.find((p) => p.id === (theme === 'day' ? 'light' : 'dark'))?.id ??
      providers[0]?.id ??
      'dark',
    [providers, theme],
  )
  const [providerId, setProviderId] = useState(themeProviderId)
  const [userCycledProvider, setUserCycledProvider] = useState(false)
  const [viewMode, setViewMode] = useState<MapViewMode>('group')
  const [bearingMode, setBearingMode] = useState<'north' | 'compass'>('north')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [navigationOpen, setNavigationOpen] = useState(false)
  /** Clean-map mode: hides the overlay cards (rail, ETA header, status pills)
      so the map itself is fully visible. Persisted per device. Essential chrome
      (top bar, controls, stop bar, permission prompts) always stays. */
  const [cardsHidden, setCardsHidden] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('rt:map:cards-hidden') === '1'
    } catch {
      return false
    }
  })
  const toggleCards = useCallback(() => {
    setCardsHidden((v) => {
      const next = !v
      try {
        window.localStorage.setItem('rt:map:cards-hidden', next ? '1' : '0')
      } catch {
        /* storage unavailable — session-only toggle */
      }
      return next
    })
  }, [])
  /** Live zoom level — keeps the +/- buttons' disabled states in sync. */
  const [zoom, setZoom] = useState(DEFAULT_MAP_ZOOM)

  // Auto-follow the app theme (day = light tiles, night = dark tiles) until the
  // rider manually cycles providers for this session.
  useEffect(() => {
    if (userCycledProvider) return
    setProviderId(themeProviderId)
  }, [themeProviderId, userCycledProvider])

  const mapElRef = useRef<LeafletMap | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const meRef = useRef<{ lat: number; lng: number } | null>(null)

  const me = useMemo(() => riders.find((r) => r.isMe) ?? null, [riders])
  meRef.current = me ? { lat: me.latitude, lng: me.longitude } : null
  const meUserId = me?.userId ?? undefined
  const navState = useStore(navigationStore)
  const effectiveHeading = navState.heading ?? me?.heading ?? null

  const active = useMemo(() => riders.filter((r) => presenceFor(r.timestamp) !== 'offline'), [riders])
  const counts = useMemo(() => presenceCounts(riders), [riders])
  const following = viewMode === 'follow'

  /* Count displays (badge, group cards) come from the merged roster so the map
     always agrees with the Riders list and Trip Info. Falls back to the raw
     realtime snapshot when no roor is supplied (defensive only — the TripRoom
     always passes it). */
  const displayCounts = useMemo(() => {
    if (roster && roster.length > 0) {
      return {
        online: roster.filter((r) => r.status !== 'offline').length,
        weak: roster.filter((r) => r.status === 'weak').length,
        offline: roster.filter((r) => r.status === 'offline').length,
        total: roster.length,
      }
    }
    return {
      online: active.length,
      weak: counts.delayed + counts.stale,
      offline: counts.offline,
      total: riders.length,
    }
  }, [roster, active, counts, riders])

  /* Group navigation badges per rider (skip idle/offline — presence already
     communicates those states via the marker ring). */
  const navStatusByUser = useMemo(() => {
    const map = new Map<string, string>()
    for (const session of group.riders) {
      if (session.status !== 'idle' && session.status !== 'offline') {
        map.set(session.userId, session.status)
      }
    }
    return map
  }, [group.riders])

  /* Demo mode is single-pilot: the map treats the viewer as the Host. Real
     trips mark the Host by the trip's creator id against the signed-in user. */
  const isHost = useMemo(() => {
    if (!useBackend) return true
    return Boolean(createdBy && user?.id && user.id === createdBy)
  }, [useBackend, createdBy, user])

  /* Riders sharing a coordinate (~11m grid) get a small visual fan so markers
     never sit exactly on top of each other. Pure visual nudge — the Leaflet
     position (and therefore routing, distance, clusters) is untouched. */
  const markerSpreads = useMemo(() => {
    const offsets = new Map<string, [number, number]>()
    const cells = new Map<string, string[]>()
    riders.forEach((r) => {
      const key = `${r.latitude.toFixed(4)},${r.longitude.toFixed(4)}`
      const ids = cells.get(key) ?? []
      ids.push(r.userId)
      cells.set(key, ids)
    })
    cells.forEach((ids) => {
      if (ids.length < 2) return
      const step = (Math.PI * 2) / ids.length
      ids.forEach((id, i) => {
        const angle = -Math.PI / 2 + step * i
        offsets.set(id, [Math.round(Math.cos(angle) * 13), Math.round(Math.sin(angle) * 13)])
      })
    })
    return offsets
  }, [riders])

  const meLat = me?.latitude
  const meLng = me?.longitude

  const selectedRider = useMemo(
    () => riders.find((r) => r.userId === selectedId) ?? null,
    [riders, selectedId],
  )
  const selectedDistance = useMemo(() => {
    if (!selectedRider || !me) return null
    if (selectedRider.userId === me.userId) return 0
    return calculateDistanceInMeters(
      me.latitude, me.longitude,
      selectedRider.latitude, selectedRider.longitude,
    )
  }, [selectedRider, me])

  /* ---------- controller lifecycle ----------
     Backend mode: the TripRoom owns the realtime connection (useTripRealtime),
     so the map only reads the shared stores and must never dispose it on close.
     Demo mode keeps its own in-browser mock simulation. */
  useEffect(() => {
    if (!useBackend) {
      rideController.init(tripId ?? currentTrip.id, { backend: false })
      return () => rideController.dispose()
    }
  }, [tripId, useBackend, currentTrip.id])

  /* ---------- fit group on open ---------- */
  const fitGroup = useCallback(() => {
    const map = mapElRef.current
    if (!map) return
    const pts: [number, number][] = [
      ...active.map((r) => [r.latitude, r.longitude] as [number, number]),
      ...currentTrip.riders
        .filter((r) => r.status !== 'offline' && (r.lat !== 0 || r.lng !== 0))
        .map((r) => [r.lat, r.lng] as [number, number]),
    ]
    if (me) pts.push([me.latitude, me.longitude])
    if (pts.length === 0) {
      map.setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM)
      return
    }
    map.fitBounds(pts as LatLngBoundsExpression, { padding: [48, 48], maxZoom: FIT_GROUP_MAX_ZOOM })
    setViewMode('group')
    mapCamera.setFollowMode('free')
  }, [active, me, currentTrip.riders])

  /* ---------- fit group on open (once per trip) ----------
     Deliberately NOT keyed on the fitGroup callback identity: roster/trip
     props get fresh identities on every members poll, and refitting on each
     one yanks the camera (the "map keeps refreshing" bug). The poll layer now
     also skips no-op updates, so this is a second line of defence. */
  const fitGroupRef = useRef(fitGroup)
  fitGroupRef.current = fitGroup
  const fitOnOpenTripRef = useRef<string | null>(null)
  useEffect(() => {
    if (fitOnOpenTripRef.current === currentTrip.id) return
    fitOnOpenTripRef.current = currentTrip.id
    const t = window.setTimeout(() => fitGroupRef.current(), 350)
    return () => window.clearTimeout(t)
  }, [currentTrip.id])

  /* ---------- manual pan/zoom disables follow ----------
     NOTE: no 'rotate' listener here — the controller fires 'rotate' during every
     programmatic heading-up turn, which must NOT cancel navigation follow. */
  useEffect(() => {
    const map = mapElRef.current
    if (!map) return
    const onUserGesture = () => {
      if (viewMode !== 'follow' && viewMode !== 'group') return
      setViewMode('free')
      mapCamera.setFollowMode('free')
    }
    map.on('dragstart', onUserGesture)
    map.on('zoomstart', onUserGesture)
    return () => {
      map.off('dragstart', onUserGesture)
      map.off('zoomstart', onUserGesture)
    }
  }, [viewMode])

  /* ---------- Google Maps-style follow me (north-up or heading-up) ----------
     ONE camera effect follows the rider: bearing + Leaflet movement are applied
     together inside the controller on the same GPS tick (never flyTo per tick). */

  const poorAccuracy = navState.gpsAccuracy != null && navState.gpsAccuracy > NAV_GPS_POOR_ACCURACY_METERS
  const wantHeadingUp =
    bearingMode === 'compass' && effectiveHeading != null && !navState.gpsLost && !poorAccuracy

  const followTick = useCallback(() => {
    const meNow = meRef.current
    const map = mapElRef.current
    if (!meNow || !map || !following) return
    mapCamera.followLocation({
      center: [meNow.lat, meNow.lng],
      bearing: wantHeadingUp ? mapCamera.headingToBearing(effectiveHeading as number) : 0,
      pitch: wantHeadingUp ? NAV_CAMERA_PITCH_DEG : 0,
      zoom: Math.max(map.getZoom(), SINGLE_RIDER_ZOOM),
      minMoveMeters: FOLLOW_MIN_MOVE_METERS,
    })
  }, [following, wantHeadingUp, effectiveHeading])

  useEffect(() => {
    followTick()
  }, [followTick, meLat, meLng])

  /* Enable following from a control: flip React viewMode + controller followMode
     and re-center on the rider with the current heading/zoom/pitch, so the very
     next GPS tick keeps moving the camera (Recenter semantics — never once-only).
     In compass mode this restores the full navigation camera (heading-up + tilt).
     Otherwise a plain North-up recenter. */
  const enableFollow = useCallback(() => {
    setViewMode('follow')
    mapCamera.setFollowMode(wantHeadingUp ? 'heading-up' : 'follow')
    if (meRef.current) {
      if (wantHeadingUp) {
        mapCamera.enterNavigationMode({
          center: [meRef.current.lat, meRef.current.lng],
          bearing: mapCamera.headingToBearing(effectiveHeading as number),
          zoom: NAVIGATION_ZOOM,
          pitch: NAV_CAMERA_PITCH_DEG,
        })
      } else {
        mapCamera.recenter([meRef.current.lat, meRef.current.lng], {
          bearing: 0,
          pitch: 0,
          zoom: SINGLE_RIDER_ZOOM,
        })
      }
    } else {
      rideController.startSharingLocation()
    }
  }, [wantHeadingUp, effectiveHeading])

  const disableFollow = useCallback(() => {
    setViewMode('free')
    mapCamera.setFollowMode('free')
  }, [])

  const goToMe = enableFollow

  const toggleFollow = useCallback(() => {
    if (viewMode === 'follow') disableFollow()
    else enableFollow()
  }, [viewMode, disableFollow, enableFollow])

  /* ---------- navigation mode ---------- */
  const getMap = useCallback(() => mapElRef.current, [])

  /* One-tap "Ride together": aim the turn-by-turn driver at the trip's shared
     destination and open the navigation overlay. */
  const handleNavigateToShared = useCallback(
    (destination: GroupDestination) => {
      nav.setDestination({ latitude: destination.latitude, longitude: destination.longitude, name: destination.name })
      setNavigationOpen(true)
    },
    [nav],
  )

  const closeNavigation = useCallback(() => {
    // Closing while actively driving pauses the session (route + destination
    // are kept so navigation can resume from the map).
    if (navigationStore.getState().status === 'navigating') {
      navigationStore.setStatus('ready')
    }
    setNavigationOpen(false)
  }, [])

  const cycleProvider = useCallback(() => {
    setUserCycledProvider(true)
    setProviderId((prev) => {
      const i = providers.findIndex((p) => p.id === prev)
      return providers[(i + 1) % providers.length]?.id ?? prev
    })
  }, [providers])

  const provider = providers.find((p) => p.id === providerId) ?? providers[0]

  const routeCoords = useMemo<[number, number][] | null>(() => {
    if (!mapRoute) return null
    const pts: [number, number][] = []
    if (mapRoute.origin) pts.push(mapRoute.origin)
    if (mapRoute.destination) pts.push(mapRoute.destination)
    return pts.length >= 2 ? pts : null
  }, [mapRoute])

  // Trip-bound navigation: the planned destination is the ONLY target.
  // No free-form search — every rider navigates the same trip.
  const tripNavDestination = useMemo<GroupDestination | null>(() => {
    if (!mapRoute?.destination) return null
    return {
      latitude: mapRoute.destination[0],
      longitude: mapRoute.destination[1],
      name: currentTrip.destination || group.destination?.name || undefined,
    }
  }, [mapRoute, currentTrip.destination, group.destination?.name])
  const hasTripRoute = tripNavDestination !== null
  const isTripNavigating = navState.status === 'navigating' || navState.status === 'ready'
  /* Navigation layers mounted (blue position dot + nav route). While they are
     on, the group "me" marker and the trip-layer pins stay off — the blue dot
     covers my position and the nav layer owns the single destination pin, so
     nothing ever stacks duplicates on one coordinate. */
  const navLayersOn = navigationOpen || isTripNavigating

  function MapCapture({ onReady }: { onReady: (m: LeafletMap) => void }) {
    const m = useMap()
    useEffect(() => { onReady(m) }, [m, onReady])
    return null
  }
  const handleMapReady = useCallback((m: LeafletMap) => {
    mapElRef.current = m
    if (wrapperRef.current) mapCamera.attach(m, wrapperRef.current)
  }, [])

  // Attach camera controller to map + wrapper (single source for bearing).
  // Also mirrors the live zoom level so the zoom buttons enable/disable at
  // the rails (Leaflet itself clamps, this is purely the button state).
  useEffect(() => {
    const map = mapElRef.current
    const wrapper = wrapperRef.current
    if (!map || !wrapper) return
    mapCamera.attach(map, wrapper)
    setZoom(map.getZoom())
    const onZoom = () => setZoom(map.getZoom())
    map.on('zoomend', onZoom)
    return () => {
      map.off('zoomend', onZoom)
      mapCamera.detach()
    }
  }, [providerId])

  // Header bearing is driven ONLY by the follow cycle (followTick applies the
  // heading-up rotation on the same tick as the Leaflet move) and by the
  // North/Compass buttons — no standalone rotation effect that could fight it.

  const handleNorth = useCallback(() => {
    setBearingMode('north')
    setViewMode('follow')
    mapCamera.setFollowMode('follow')
    // North-up + top-down: bearing 0 AND pitch 0. Follow stays active — GPS,
    // navigation, rerouting and voice continue untouched.
    mapCamera.resetOrientation({ animate: true })
  }, [])

  /* Flexible zoom rails: one animated step per tap, clamped by the map's
     min/max zoom (19 = closest street-level detail). Works in every mode —
     follow keeps the chosen zoom on the next GPS tick. */
  const handleZoomIn = useCallback(() => {
    mapElRef.current?.zoomIn()
  }, [])

  const handleZoomOut = useCallback(() => {
    mapElRef.current?.zoomOut()
  }, [])

  /* Navigation arrow / compass: heading-up + tilted navigation camera.
     Bearing→heading, pitch→NAV_CAMERA_PITCH_DEG and zoom→NAVIGATION_ZOOM are
     animated together as one transition; the rider is anchored lower-middle. */
  const handleCompass = useCallback(() => {
    setBearingMode('compass')
    setViewMode('follow')
    mapCamera.setFollowMode('heading-up')
    const heading = effectiveHeading
    const poor = navState.gpsAccuracy != null && navState.gpsAccuracy > NAV_GPS_POOR_ACCURACY_METERS
    const usableHeading = heading != null && !navState.gpsLost && !poor
    if (meRef.current) {
      mapCamera.enterNavigationMode({
        center: [meRef.current.lat, meRef.current.lng],
        bearing: usableHeading ? mapCamera.headingToBearing(heading as number) : mapCamera.getBearing(),
        zoom: NAVIGATION_ZOOM,
        pitch: NAV_CAMERA_PITCH_DEG,
      })
    } else {
      rideController.startSharingLocation()
    }
  }, [effectiveHeading, navState.gpsAccuracy, navState.gpsLost])

  /* Trip-bound navigation auto-engages Google Maps-style follow the moment the
     planned route becomes active (overlay closed). If the rider manually
     dragged the map ('free'), the camera stays free — GPS, routing and voice
     continue regardless. Compass mode also unlocks the tilted navigation camera
     immediately (not just after the first GPS move). */
  useEffect(() => {
    if (!hasTripRoute || navigationOpen) return
    if (navState.status !== 'navigating') return
    if (viewMode === 'follow' || viewMode === 'free') return
    const headingUp = bearingMode === 'compass'
    setViewMode('follow')
    mapCamera.setFollowMode(headingUp ? 'heading-up' : 'follow')
    if (headingUp && meRef.current) {
      mapCamera.enterNavigationMode({
        center: [meRef.current.lat, meRef.current.lng],
        bearing: wantHeadingUp ? mapCamera.headingToBearing(effectiveHeading as number) : mapCamera.getBearing(),
        zoom: NAVIGATION_ZOOM,
        pitch: NAV_CAMERA_PITCH_DEG,
      })
    }
  }, [navState.status, hasTripRoute, navigationOpen, viewMode, bearingMode, wantHeadingUp, effectiveHeading])

  const startTripNavigation = useCallback(() => {
    if (!tripNavDestination) return
    setNavigationOpen(false)
    nav.setDestination({ latitude: tripNavDestination.latitude, longitude: tripNavDestination.longitude, name: tripNavDestination.name })
    // Queue the drive — startNavigation handles waiting for the first route + GPS fix.
    nav.startNavigation()
    enableFollow()
  }, [nav, tripNavDestination, enableFollow])

  const stopTripNavigation = useCallback(() => {
    setNavigationOpen(false)
    if (navState.status === 'navigating') navigationStore.setStatus('ready')
    nav.clearDestination()
    setViewMode('group')
    mapCamera.setFollowMode('free')
  }, [nav, navState.status])

  return (
    <motion.div
      className="fixed inset-0 z-[70] bg-night"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      role="dialog"
      aria-modal="true"
      aria-label="Live group ride map"
    >
      {/* Horizon backdrop: the tilted nav camera can expose hairline slivers at
          the frame edges — this reads as distant sky/haze instead of blank. */}
      <div aria-hidden="true" className="absolute inset-0 z-0 bg-gradient-to-b from-[#33415e] via-[#171c2b] to-night" />
      {/* Oversized bleed: rotateX foreshortening + bearing rotation shrink the map
          plane, so the wrapper extends past the viewport (extra headroom on top
          where the horizon sits). Rider anchor math is size-relative, so the
          rider stays pinned at the same screen fraction. */}
      <div ref={wrapperRef} className="absolute -inset-x-[18%] -top-[45%] -bottom-[20%] z-0 overflow-hidden">
        <MapContainer
          center={DEFAULT_MAP_CENTER}
          zoom={DEFAULT_MAP_ZOOM}
          minZoom={MAP_MIN_ZOOM}
          maxZoom={MAP_MAX_ZOOM}
          zoomControl={false}
          scrollWheelZoom
          attributionControl
          className="absolute inset-0"
        >
          <MapCapture onReady={handleMapReady} />
          {provider ? (
            <TileLayer url={provider.url} attribution={provider.attribution} maxZoom={provider.maxZoom} />
          ) : null}
          <RouteLayer route={tripId || useBackend ? routeCoords : undefined} hidePins={navLayersOn} />
          {riders.filter((r) => (navLayersOn ? !r.isMe : true)).map((r) => (
            <RiderMarker
              key={r.userId}
              rider={r}
              selected={selectedId === r.userId}
              spread={markerSpreads.get(r.userId)}
              navStatus={navStatusByUser.get(r.userId)}
              onSelect={setSelectedId}
            />
          ))}
          {navigationOpen || isTripNavigating ? <NavigationMapLayers /> : null}
        </MapContainer>
      </div>

      {/* top bar */}
      {!navigationOpen ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[5] flex items-center justify-between gap-2 px-3 sm:px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)', paddingBottom: '0.75rem' }}>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close live map"
            className="rt-tap pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/12 bg-night/70 px-3.5 text-xs font-medium text-bone backdrop-blur-xl transition hover:scale-[1.03] hover:bg-night/85 focus-visible:outline-2 focus-visible:outline-ember"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            <span className="hidden sm:inline">Back to Trip</span>
          </button>
          {hasTripRoute ? (
            isTripNavigating ? (
              <button
                type="button"
                onClick={stopTripNavigation}
                aria-label="Stop trip navigation"
                className="rt-tap pointer-events-auto inline-flex items-center gap-2 rounded-full border border-road/40 bg-road/15 px-3.5 text-xs font-semibold text-road backdrop-blur-xl transition hover:scale-[1.03] hover:bg-road/25 focus-visible:outline-2 focus-visible:outline-ember"
              >
                <Navigation size={14} aria-hidden="true" />
                Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={startTripNavigation}
                aria-label="Start trip navigation"
                className="rt-tap pointer-events-auto inline-flex items-center gap-2 rounded-full border border-live/40 bg-live/15 px-3.5 text-xs font-semibold text-live backdrop-blur-xl transition hover:scale-[1.03] hover:bg-live/25 focus-visible:outline-2 focus-visible:outline-ember"
              >
                <Navigation size={14} aria-hidden="true" />
                Start Trip
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={() => setNavigationOpen(true)}
              aria-label="Start navigation"
              className="rt-tap pointer-events-auto inline-flex items-center gap-2 rounded-full border border-live/40 bg-live/15 px-3.5 text-xs font-semibold text-live backdrop-blur-xl transition hover:scale-[1.03] hover:bg-live/25 focus-visible:outline-2 focus-visible:outline-ember"
            >
              <Navigation size={14} aria-hidden="true" />
              Navigate
            </button>
          )}
          <div className="pointer-events-auto hidden items-center gap-2 rounded-full border border-white/12 bg-night/70 px-4 py-2 backdrop-blur-xl md:flex">
            <Radio size={13} className={connection === 'connected' ? 'text-live' : 'animate-pulse text-sunset'} aria-hidden="true" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-bone/85">
              {connection === 'connected' ? 'Live Map' : connection === 'connecting' ? 'Connecting…' : connection === 'reconnecting' ? 'Reconnecting…' : 'Offline'}
            </span>
          </div>
          <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-night/70 px-3.5 py-2 text-[11px] font-medium text-bone/85 backdrop-blur-xl">
            <MapPin size={12} className="text-ember" aria-hidden="true" />
            {displayCounts.online}/{displayCounts.total} riding
          </span>
        </div>
      ) : null}

      {/* group summary + status — top-left rail. Width-capped so cards never
          slide under the right control rail, and height-capped with internal
          scroll so cards stack instead of colliding with the bottom pills/nav
          on short screens. While trip-navigating on mobile the centered ETA
          header occupies the top, so the rail starts below it. Same glass
          cards, no visual change otherwise. Hidden entirely in clean-map mode. */}
      {!navigationOpen && !cardsHidden ? (
        <div
          className="pointer-events-none absolute left-3 z-[5] flex flex-col gap-2 overflow-y-auto [scrollbar-width:none] sm:left-4 [&::-webkit-scrollbar]:hidden"
          style={{
            top:
              isMobile && isTripNavigating
                ? 'calc(max(env(safe-area-inset-top, 0px), 0.75rem) + 12rem)'
                : 'calc(max(env(safe-area-inset-top, 0px), 0.75rem) + 3.5rem)',
            width: 'min(20rem, calc(100vw - 6rem))',
            maxHeight:
              isMobile && isTripNavigating
                ? 'calc(100dvh - 26rem)'
                : isMobile
                  ? 'calc(100dvh - 17rem)'
                  : 'calc(100dvh - 12rem)',
          }}
        >
          <GroupSummaryCard
            tripName={currentTrip.name}
            origin={currentTrip.origin}
            destination={currentTrip.destination}
            routeKm={currentTrip.distanceKm}
            live={displayCounts.online}
            delayed={displayCounts.weak}
            offline={displayCounts.offline}
          />
          <GroupStatusCard
            health={metrics.health}
            activeCount={displayCounts.online}
            totalCount={displayCounts.total}
            nearestMeters={metrics.nearest?.distanceMeters ?? null}
          />
          <GroupNavPanel
            tripId={useBackend ? tripId : undefined}
            isHost={isHost}
            meUserId={meUserId}
            tripDestination={tripNavDestination}
            tripNavigating={isTripNavigating}
            onStartTripNavigation={startTripNavigation}
            onStopTripNavigation={stopTripNavigation}
            onOpenNavigation={() => setNavigationOpen(true)}
            onNavigateToShared={handleNavigateToShared}
          />
        </div>
      ) : null}

      {/* inline trip navigation header when driving the planned route (no separate screen) */}
      {hasTripRoute && isTripNavigating && !navigationOpen && !cardsHidden ? (
        <div className="pointer-events-none absolute inset-x-0 top-[calc(max(env(safe-area-inset-top,0px),0.75rem)+3.4rem)] z-[5] flex justify-center px-3 sm:px-4">
          <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-white/12 bg-night/85 p-3 backdrop-blur-2xl">
            <p className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-mist/50">
              <Navigation size={11} className="text-live" aria-hidden="true" /> Trip Navigation
            </p>
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-semibold text-bone">
                {formatDistance(navState.remainingDistanceMeters)}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-semibold text-bone">
                ETA {formatEta(navState.progress?.etaEpochMs ?? null)}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-semibold text-bone">
                {formatDuration(navState.remainingDurationSeconds)}
              </span>
            </p>
            {navState.progress?.currentInstruction ? (
              <p className="mt-2 text-[12px] leading-snug text-bone/85">
                {navState.progress.currentInstruction.text}
                {navState.progress.distanceToCurrentInstructionMeters != null
                  ? ` · ${formatDistance(navState.progress.distanceToCurrentInstructionMeters)}`
                  : ''}
              </p>
            ) : null}
            {navState.offRoute ? <p className="mt-2 text-[11px] font-medium text-sunset">Off route — recalculating…</p> : null}
          </div>
        </div>
      ) : null}

      {/* group cohesion alert — beep + toast when a rider lags or pulls ahead */}
      {groupAlert ? (
        <div className="pointer-events-auto absolute inset-x-3 top-[calc(max(env(safe-area-inset-top,0px),0.75rem)+6.8rem)] z-[8] flex justify-center sm:inset-x-4">
          <div
            role="alert"
            aria-live="assertive"
            className={`flex w-full max-w-md items-start gap-2.5 rounded-2xl border px-3.5 py-3 shadow-2xl backdrop-blur-xl ${
              groupAlert.kind === 'split' ? 'border-road/40 bg-road/15 text-bone' : 'border-sunset/40 bg-sunset/15 text-bone'
            }`}
          >
            <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${groupAlert.kind === 'split' ? 'bg-road text-night' : 'bg-sunset text-night'}`}>
              <Radio size={14} aria-hidden="true" />
            </span>
            <p className="min-w-0 flex-1 text-[12px] font-medium leading-snug">{groupAlert.message}</p>
            <button
              type="button"
              onClick={dismissGroupAlert}
              aria-label="Dismiss alert"
              className="shrink-0 rounded-full p-1 text-bone/70 hover:bg-white/10 hover:text-bone"
            >
              ×
            </button>
          </div>
        </div>
      ) : null}

      {/* rider status alert — toast + beep when a teammate goes offline, comes
          back, or drifts off the planned route. Stacks below the cohesion
          toast when both are visible. */}
      {statusAlert ? (
        <div className={`pointer-events-auto absolute inset-x-3 z-[8] flex justify-center sm:inset-x-4 ${groupAlert ? 'top-[calc(max(env(safe-area-inset-top,0px),0.75rem)+11.8rem)]' : 'top-[calc(max(env(safe-area-inset-top,0px),0.75rem)+6.8rem)]'}`}>
          <div
            role="alert"
            aria-live="assertive"
            className={`flex w-full max-w-md items-start gap-2.5 rounded-2xl border px-3.5 py-3 shadow-2xl backdrop-blur-xl ${
              statusAlert.kind === 'rider-offline'
                ? 'border-road/40 bg-road/15 text-bone'
                : statusAlert.kind === 'rider-back'
                  ? 'border-live/40 bg-live/15 text-bone'
                  : 'border-sunset/40 bg-sunset/15 text-bone'
            }`}
          >
            <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${
              statusAlert.kind === 'rider-offline'
                ? 'bg-road text-night'
                : statusAlert.kind === 'rider-back'
                  ? 'bg-live text-night'
                  : 'bg-sunset text-night'
            }`}>
              {statusAlert.kind === 'rider-offline' ? <WifiOff size={14} aria-hidden="true" /> : <Radio size={14} aria-hidden="true" />}
            </span>
            <p className="min-w-0 flex-1 text-[12px] font-medium leading-snug">{statusAlert.message}</p>
            <button
              type="button"
              onClick={dismissStatusAlert}
              aria-label="Dismiss alert"
              className="shrink-0 rounded-full p-1 text-bone/70 hover:bg-white/10 hover:text-bone"
            >
              ×
            </button>
          </div>
        </div>
      ) : null}

      {/* controls */}
      {!navigationOpen && !isTripNavigating ? (
        <MapControls
          viewMode={viewMode}
          following={following}
          bearingMode={bearingMode}
          bearing={mapCamera.getBearing()}
          tileProviderId={providerId}
          providers={providers}
          zoom={zoom}
          minZoom={MAP_MIN_ZOOM}
          maxZoom={MAP_MAX_ZOOM}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          cardsHidden={cardsHidden}
          onToggleCards={toggleCards}
          onGoToMe={goToMe}
          onToggleFollow={toggleFollow}
          onFitGroup={fitGroup}
          onNorth={handleNorth}
          onCompass={handleCompass}
          onCycleProvider={cycleProvider}
        />
      ) : null}
      {/* Trip-navigating controls. Desktop keeps the vertically-centered rail;
          mobile docks it above the bottom pill stack so the buttons never float
          over the ETA header or the top bar pills. */}
      {isTripNavigating && !navigationOpen ? (
        <div className={`pointer-events-auto absolute z-[5] flex flex-col gap-3 ${
          isMobile
            ? 'bottom-[max(env(safe-area-inset-bottom,0px),190px)] right-[max(env(safe-area-inset-right,0px),0.75rem)]'
            : 'right-[max(env(safe-area-inset-right,0px),1.25rem)] top-1/2 -translate-y-1/2'
        }`}>
          <MapControls
            viewMode={viewMode}
            following={following}
            bearingMode={bearingMode}
            bearing={mapCamera.getBearing()}
            tileProviderId={providerId}
            providers={providers}
            zoom={zoom}
            minZoom={MAP_MIN_ZOOM}
            maxZoom={MAP_MAX_ZOOM}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            cardsHidden={cardsHidden}
            onToggleCards={toggleCards}
            onGoToMe={goToMe}
            onToggleFollow={toggleFollow}
            onFitGroup={fitGroup}
            onNorth={handleNorth}
            onCompass={handleCompass}
            onCycleProvider={cycleProvider}
          />
        </div>
      ) : null}

      {/* GPS permission / sharing state. Bottom-centered on every form factor
          so it never sits on top of the left card rail; when trip-navigating
          it stacks above the bottom stop bar instead of overlapping it. In
          clean-map mode the status pills hide, but permission/error prompts
          always stay visible. */}
      {(!cardsHidden || (gps.mode !== 'active' && gps.mode !== 'paused')) && (
      <div
        className={`pointer-events-none absolute z-[5] ${
          navigationOpen
            ? 'inset-x-0 top-[calc(max(env(safe-area-inset-top,0px),0.75rem)+3.5rem)] flex justify-center px-4'
            : isMobile
              ? 'inset-x-3 bottom-[max(env(safe-area-inset-bottom,0px),118px)] flex justify-center'
              : `inset-x-0 ${hasTripRoute && isTripNavigating ? 'bottom-20' : 'bottom-5'} flex justify-center px-4`
        }`}
      >
        <MapPermissionGate
          mode={gps.mode}
          error={gps.error}
          accuracy={gps.accuracy}
          onStart={() => rideController.startSharingLocation()}
          onPause={() => rideController.pauseLocationSharing()}
        />
      </div>
      )}

      {/* desktop: bottom-left trip info */}
      {!isMobile && !navigationOpen && !cardsHidden && (
        <div className="pointer-events-auto absolute bottom-5 left-4 z-[5] w-[min(30vw,300px)] rounded-2xl border border-white/12 bg-night/85 p-3.5 backdrop-blur-2xl">
          <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-mist/50">{currentTrip.name}</p>
          <p className="mt-1 font-display text-base font-bold text-bone">
            {currentTrip.origin} → {currentTrip.destination}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-mist/70">
            <CalendarRange size={11} aria-hidden="true" />
            {currentTrip.startDate} · {currentTrip.days} days
          </p>
        </div>
      )}

      {/* trip navigation — bottom stop bar (mobile + desktop) when driving planned route */}
      {hasTripRoute && isTripNavigating && !navigationOpen ? (
        <div className={`pointer-events-none absolute z-[6] flex justify-center px-3 ${isMobile ? 'inset-x-3 bottom-[max(env(safe-area-inset-bottom,0px),64px)]' : 'inset-x-0 bottom-5'}`}>
          <div className="pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-2xl border border-white/12 bg-night/85 px-3 py-2.5 backdrop-blur-2xl">
            <span className="flex-1 truncate text-[12px] font-medium text-bone/90">
              {currentTrip.origin} → {currentTrip.destination}
            </span>
            <button
              type="button"
              onClick={stopTripNavigation}
              className="shrink-0 rounded-full bg-road px-4 py-1.5 text-xs font-semibold text-night transition hover:bg-road/90"
            >
              Stop Trip
            </button>
          </div>
        </div>
      ) : null}

      {/* desktop: selected rider card bottom-right */}
      {!isMobile && !navigationOpen && selectedRider ? (
        <div className="absolute bottom-5 right-5 z-[6]">
          <AnimatePresence>
            <RiderCard
              key={selectedRider.userId}
              rider={selectedRider}
              presence={presenceFor(selectedRider.timestamp)}
              distanceFromMeMeters={selectedDistance}
              isMe={selectedRider.isMe ?? false}
              onClose={() => setSelectedId(null)}
            />
          </AnimatePresence>
        </div>
      ) : null}

      {/* mobile: rider bottom sheet */}
      {isMobile && !navigationOpen && selectedRider ? (
        <AnimatePresence>
          <RiderBottomSheet
            key={selectedRider.userId}
            rider={selectedRider}
            presence={presenceFor(selectedRider.timestamp)}
            distanceFromMeMeters={selectedDistance}
            isMe={selectedRider.isMe ?? false}
            onClose={() => setSelectedId(null)}
          />
        </AnimatePresence>
      ) : null}

      {/* mobile bottom nav — Map highlighted */}
      {isMobile && !navigationOpen && (
        <div className="absolute inset-x-0 bottom-0 z-[7]">
          <MobileBottomNav
            active="map"
            onOpenMap={() => {}}
            onOpenMusic={onExitToMusic}
            onOpenPlaylists={onExitToPlaylists}
            onOpenRiders={onExitToRiders}
            onOpenTripInfo={onExitToTripInfo}
          />
        </div>
      )}

      {/* Phase-1 navigation — layered over the live map; rider tracking continues */}
      {navigationOpen ? (
        <NavigationOverlay
          onClose={closeNavigation}
          getMap={getMap}
          online={displayCounts.online}
          total={displayCounts.total}
        />
      ) : null}
    </motion.div>
  )
}
