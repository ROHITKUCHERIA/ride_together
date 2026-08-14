import { lazy, Suspense, useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import ConnectionStatus from './ConnectionStatus'
import CursorSpotlight from './CursorSpotlight'
import FilmGrain from './FilmGrain'
import FloatingActions from './FloatingActions'
import GpsStatus from './GpsStatus'
import LoadingScreen from './LoadingScreen'
import MobileBottomNav from './MobileBottomNav'
import OnlineIndicator from './OnlineIndicator'
import PlaylistDrawer from './PlaylistDrawer'
import RidersDrawer from './RidersDrawer'
import TripHero from './TripHero'
import TripInfoDrawer from './TripInfoDrawer'
import TripMusicDrawer from './TripMusicDrawer'
import TripMusicSearch from './TripMusicSearch'
import TripNavigation from './TripNavigation'
import ManageTripDrawer from '../app/components/ManageTripDrawer'
import { trip as mockTrip } from '../data/mockData'
import { useMusicPlayer } from '../music/context'
import { useTripRealtime } from '../features/live-map/hooks/useTripRealtime'
import { rideController } from '../features/live-map/services/rideController'
import type { ConnectionState, DrawerKind, GpsState, Playlist, Rider, TripInfo } from '../types'
import type { MemberRole, Trip, TripMember } from '../types/api'
import type { TripMapRoute } from '../app/tripInfo'

const GroupRideMap = lazy(() =>
  import('../features/live-map/components/GroupRideMap').then((m) => ({ default: m.default })),
)

interface TripRoomProps {
  trip?: TripInfo
  apiTrip?: Trip
  role?: MemberRole
  members?: TripMember[]
  currentUserId?: string
  tripId?: string
  mapRoute?: TripMapRoute
  onBack?: () => void
  onRefresh?: () => Promise<void>
  onDeleted?: () => void
}

export default function TripRoom({
  trip,
  apiTrip,
  role,
  members = [],
  currentUserId,
  tripId,
  mapRoute,
  onBack,
  onRefresh,
  onDeleted,
}: TripRoomProps) {
  const thisTrip = trip ?? mockTrip
  const music = useMusicPlayer()

  const [loading, setLoading] = useState(true)
  const [drawer, setDrawer] = useState<DrawerKind>(null)
  const [manageOpen, setManageOpen] = useState(false)
  const [tripMusicOpen, setTripMusicOpen] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)

  const [playlists, setPlaylists] = useState<Playlist[]>(thisTrip.playlists)

  /* Real backend trip → real Socket.IO + GPS. The realtime service owns the
     socket connection, room membership and GPS watcher; the room just
     subscribes to the same stores the live map uses. */
  const realtime = useTripRealtime({ tripId, status: apiTrip?.status, roster: thisTrip.riders })

  const [riders, setRiders] = useState<Rider[]>(thisTrip.riders)
  const [connection, setConnection] = useState<ConnectionState>('connected')
  const [gps, setGps] = useState<GpsState>('tracking')

  /* sync presentation data when the source trip changes (e.g. after refresh) */
  useEffect(() => {
    setRiders(thisTrip.riders)
    setPlaylists(thisTrip.playlists)
  }, [thisTrip])

  // Real-mode realtime replaces the simulated room state entirely.
  useEffect(() => {
    if (!tripId) return
    setConnection(realtime.connection)
    setGps(realtime.gpsState)
    setRiders(realtime.roomRiders)
  }, [tripId, realtime.connection, realtime.gpsState, realtime.roomRiders])

  const onlineCount = riders.filter((r) => r.status !== 'offline').length

  /* ---------- loading ---------- */
  useEffect(() => {
    const t = window.setTimeout(() => setLoading(false), 1450)
    return () => window.clearTimeout(t)
  }, [])

  /* ---------- map & music overlays: lock scroll + escape ---------- */
  useEffect(() => {
    if (!mapOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMapOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [mapOpen])

  const openDrawer = (kind: Exclude<DrawerKind, null>) => setDrawer((d) => (d === kind ? null : kind))

  const handleOpenMusic = () => {
    if (music.current) music.openFullPlayer()
    else setTripMusicOpen(true)
  }

  const addPlaylist = (name: string) => {
    const id = `pl-${Date.now()}`
    setPlaylists((prev) => [
      { id, name, emoji: '🎧', owner: 'You', songCount: 0, scope: 'my' },
      ...prev,
    ])
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-night font-ui text-bone">
      <AnimatePresence>{loading ? <LoadingScreen key="loading" /> : null}</AnimatePresence>

      <TripHero trip={thisTrip} />
      <TripNavigation trip={thisTrip} onlineCount={onlineCount} onBack={onBack} />

      <FloatingActions
        onOpenMap={() => setMapOpen(true)}
        onOpenTripMusic={() => setTripMusicOpen(true)}
        onOpenPlaylists={() => openDrawer('playlists')}
        onOpenRiders={() => openDrawer('riders')}
        onOpenTripInfo={() => openDrawer('tripinfo')}
      />

      <MobileBottomNav
        active={mapOpen ? 'map' : undefined}
        onOpenMap={() => setMapOpen(true)}
        onOpenMusic={handleOpenMusic}
        onOpenRiders={() => openDrawer('riders')}
        onOpenTripInfo={() => openDrawer('tripinfo')}
      />

      <ConnectionStatus state={connection} />
      <GpsStatus state={gps} onEnable={() => (tripId ? rideController.startSharingLocation() : setGps('tracking'))} />

      <AnimatePresence>
        {mapOpen ? (
          <Suspense fallback={null}>
            <GroupRideMap
              key="groupridemap"
              tripId={tripId}
              useBackend={Boolean(tripId)}
              trip={thisTrip}
              mapRoute={mapRoute}
              onClose={() => setMapOpen(false)}
              onExitToMusic={handleOpenMusic}
              onExitToRiders={() => {
                setMapOpen(false)
                openDrawer('riders')
              }}
              onExitToTripInfo={() => {
                setMapOpen(false)
                openDrawer('tripinfo')
              }}
            />
          </Suspense>
        ) : null}
      </AnimatePresence>

      <PlaylistDrawer
        open={drawer === 'playlists'}
        onClose={() => setDrawer(null)}
        playlists={playlists}
        onCreate={addPlaylist}
      />
      {tripId ? (
        <TripMusicDrawer
          open={tripMusicOpen}
          onClose={() => setTripMusicOpen(false)}
          tripId={tripId}
          role={role}
          currentUserId={currentUserId}
        />
      ) : null}
      {tripId ? <TripMusicSearch tripId={tripId} /> : null}
      <RidersDrawer open={drawer === 'riders'} onClose={() => setDrawer(null)} riders={riders} onlineCount={onlineCount} />
      <TripInfoDrawer
        open={drawer === 'tripinfo'}
        onClose={() => setDrawer(null)}
        trip={thisTrip}
        role={role}
        canManage={role === 'OWNER' || role === 'ADMIN'}
        onManage={() => {
          setDrawer(null)
          setManageOpen(true)
        }}
      />

      {role && members && onRefresh && apiTrip ? (
        <ManageTripDrawer
          open={manageOpen}
          onClose={() => setManageOpen(false)}
          trip={apiTrip}
          role={role}
          members={members}
          currentUserId={currentUserId ?? ''}
          onRefresh={onRefresh}
          onDeleted={onDeleted ?? onBack ?? (() => {})}
        />
      ) : null}

      {/* mobile / tablet keeps a compact online chip in the nav's empty center slot */}
      <div className="rt-online-chip pointer-events-none fixed left-1/2 top-3 z-40 -translate-x-1/2 lg:hidden">
        <OnlineIndicator count={onlineCount} className="bg-night/45" />
      </div>

      <FilmGrain />
      <CursorSpotlight />
    </div>
  )
}