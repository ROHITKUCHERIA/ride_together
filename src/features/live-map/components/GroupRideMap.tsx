import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { MapContainer, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { Map as LeafletMap, LatLngBoundsExpression } from 'leaflet'
import { ArrowLeft, CalendarRange, MapPin, Radio } from 'lucide-react'
import type { MapViewMode } from '../types'
import { resolveTileProviders } from '../providers/mapProviders'
import { useRiders, useConnection, useGps, useGroupMetrics, presenceFor, presenceCounts } from '../hooks/useLiveMap'
import { rideController } from '../services/rideController'
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  FIT_GROUP_MAX_ZOOM,
  FOLLOW_ANIMATION_MS,
  SINGLE_RIDER_ZOOM,
} from '../config'
import { calculateDistanceInMeters } from '../utils/geo'
import { trip as mockTrip } from '../../../data/mockData'
import { useIsMobile } from '../../../hooks/useMediaQuery'
import type { TripInfo } from '../../../types'
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
}

export default function GroupRideMap({ onClose, onExitToMusic, onExitToRiders, onExitToTripInfo, tripId, useBackend, trip = mockTrip, mapRoute }: GroupRideMapProps) {
  const currentTrip = trip
  const isMobile = useIsMobile()
  const { riders } = useRiders()
  const connection = useConnection()
  const gps = useGps()
  const metrics = useGroupMetrics()

  const providers = useMemo(() => resolveTileProviders(), [])
  const [providerId, setProviderId] = useState(providers[0]?.id ?? 'dark')
  const [viewMode, setViewMode] = useState<MapViewMode>('group')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const mapElRef = useRef<LeafletMap | null>(null)
  const meRef = useRef<{ lat: number; lng: number } | null>(null)

  const me = useMemo(() => riders.find((r) => r.isMe) ?? null, [riders])
  meRef.current = me ? { lat: me.latitude, lng: me.longitude } : null

  const active = useMemo(() => riders.filter((r) => presenceFor(r.timestamp) !== 'offline'), [riders])
  const counts = useMemo(() => presenceCounts(riders), [riders])
  const following = viewMode === 'follow'

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

  /* ---------- controller lifecycle ---------- */
  useEffect(() => {
    rideController.init(tripId ?? currentTrip.id, { backend: !!useBackend })
    return () => rideController.dispose()
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
  }, [active, me, currentTrip.riders])

  useEffect(() => {
    const t = window.setTimeout(fitGroup, 350)
    return () => window.clearTimeout(t)
  }, [fitGroup])

  /* ---------- manual pan/zoom disables follow ---------- */
  useEffect(() => {
    const map = mapElRef.current
    if (!map) return
    const onUserGesture = () => {
      if (viewMode !== 'follow') return
      setViewMode('free')
    }
    map.on('dragstart', onUserGesture)
    map.on('zoomstart', onUserGesture)
    return () => {
      map.off('dragstart', onUserGesture)
      map.off('zoomstart', onUserGesture)
    }
  }, [viewMode])

  /* ---------- follow me ---------- */
  useEffect(() => {
    const map = mapElRef.current
    if (!map || !following || !meRef.current) return
    map.flyTo([meRef.current.lat, meRef.current.lng], Math.max(map.getZoom(), SINGLE_RIDER_ZOOM), {
      duration: FOLLOW_ANIMATION_MS / 1000,
    })
  }, [following, meLat, meLng])

  const goToMe = useCallback(() => {
    const map = mapElRef.current
    if (!map || !meRef.current) return
    map.flyTo([meRef.current.lat, meRef.current.lng], Math.max(map.getZoom(), SINGLE_RIDER_ZOOM), {
      duration: FOLLOW_ANIMATION_MS / 1000,
    })
    setViewMode('free')
  }, [])

  const cycleProvider = useCallback(() => {
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
      <MapContainer
        ref={mapElRef}
        center={DEFAULT_MAP_CENTER}
        zoom={DEFAULT_MAP_ZOOM}
        zoomControl={false}
        scrollWheelZoom
        attributionControl
        className="absolute inset-0 z-0"
      >
        {provider ? (
          <TileLayer url={provider.url} attribution={provider.attribution} maxZoom={provider.maxZoom} />
        ) : null}
        <RouteLayer route={tripId || useBackend ? routeCoords : undefined} />
        {riders.map((r) => (
          <RiderMarker
            key={r.userId}
            rider={r}
            selected={selectedId === r.userId}
            onSelect={setSelectedId}
          />
        ))}
      </MapContainer>

      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[5] flex items-center justify-between gap-2 p-3 sm:p-4">
        <button
          type="button"
          onClick={onClose}
          className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/12 bg-night/70 px-3.5 py-2 text-xs font-medium text-bone backdrop-blur-xl transition hover:scale-[1.03] hover:bg-night/85 focus-visible:outline-2 focus-visible:outline-ember"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          <span className="hidden sm:inline">Back to Trip</span>
        </button>
        <div className="pointer-events-auto hidden items-center gap-2 rounded-full border border-white/12 bg-night/70 px-4 py-2 backdrop-blur-xl md:flex">
          <Radio size={13} className={connection === 'connected' ? 'text-live' : 'animate-pulse text-sunset'} aria-hidden="true" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-bone/85">
            {connection === 'connected' ? 'Live Map' : connection === 'reconnecting' ? 'Reconnecting…' : 'Offline'}
          </span>
        </div>
        <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-night/70 px-3.5 py-2 text-[11px] font-medium text-bone/85 backdrop-blur-xl">
          <MapPin size={12} className="text-ember" aria-hidden="true" />
          {active.length}/{riders.length} riding
        </span>
      </div>

      {/* group summary + status — top-left */}
      <div className="pointer-events-none absolute left-3 top-16 z-[5] flex flex-col gap-2 sm:left-4 sm:top-[72px]">
        <GroupSummaryCard
          tripName={currentTrip.name}
          origin={currentTrip.origin}
          destination={currentTrip.destination}
          routeKm={currentTrip.distanceKm}
          live={counts.live}
          delayed={counts.delayed}
          offline={counts.offline}
        />
        <GroupStatusCard
          health={metrics.health}
          activeCount={active.length}
          totalCount={riders.length}
          nearestMeters={metrics.nearest?.distanceMeters ?? null}
        />
      </div>

      {/* controls */}
      <MapControls
        viewMode={viewMode}
        following={following}
        tileProviderId={providerId}
        providers={providers}
        onGoToMe={goToMe}
        onToggleFollow={() => setViewMode((v) => (v === 'follow' ? 'free' : 'follow'))}
        onFitGroup={fitGroup}
        onCycleProvider={cycleProvider}
      />

      {/* GPS permission / sharing state */}
      <div
        className={`pointer-events-none absolute z-[5] ${
          isMobile
            ? 'inset-x-3 bottom-[max(env(safe-area-inset-bottom,0px),118px)] flex justify-center'
            : 'left-4 top-1/2 -translate-y-1/2'
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

      {/* desktop: bottom-left trip info */}
      {!isMobile && (
        <div className="pointer-events-auto absolute bottom-5 left-4 z-[5] w-[min(30vw,300px)] rounded-2xl border border-white/12 bg-[rgba(18,18,21,0.85)] p-3.5 backdrop-blur-2xl">
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

      {/* desktop: selected rider card bottom-right */}
      {!isMobile && selectedRider ? (
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
      {isMobile && selectedRider ? (
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
      {isMobile && (
        <div className="absolute inset-x-0 bottom-0 z-[7]">
          <MobileBottomNav
            active="map"
            onOpenMap={() => {}}
            onOpenMusic={onExitToMusic}
            onOpenRiders={onExitToRiders}
            onOpenTripInfo={onExitToTripInfo}
          />
        </div>
      )}
    </motion.div>
  )
}
