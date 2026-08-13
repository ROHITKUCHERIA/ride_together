import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import ConnectionStatus from './ConnectionStatus'
import CursorSpotlight from './CursorSpotlight'
import FilmGrain from './FilmGrain'
import FloatingActions from './FloatingActions'
import GpsStatus from './GpsStatus'
import LoadingScreen from './LoadingScreen'
import MobileBottomNav from './MobileBottomNav'
import MusicPlayer from './MusicPlayer'
import OnlineIndicator from './OnlineIndicator'
import PlaylistDrawer from './PlaylistDrawer'
import RidersDrawer from './RidersDrawer'
import TripHero from './TripHero'
import TripInfoDrawer from './TripInfoDrawer'
import TripNavigation from './TripNavigation'
import ManageTripDrawer from '../app/components/ManageTripDrawer'
import { trip as mockTrip } from '../data/mockData'
import { useIsMobile } from '../hooks/useMediaQuery'
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
  const isMobile = useIsMobile()
  const thisTrip = trip ?? mockTrip

  const [loading, setLoading] = useState(true)
  const [drawer, setDrawer] = useState<DrawerKind>(null)
  const [manageOpen, setManageOpen] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)
  const [musicExpanded, setMusicExpanded] = useState(false)

  const [riders, setRiders] = useState<Rider[]>(thisTrip.riders)
  const [playlists, setPlaylists] = useState<Playlist[]>(thisTrip.playlists)
  const [connection, setConnection] = useState<ConnectionState>('connected')
  const [gps, setGps] = useState<GpsState>('tracking')

  const [songIndex, setSongIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)

  const ridersRef = useRef(riders)
  ridersRef.current = riders
  const songIndexRef = useRef(songIndex)
  songIndexRef.current = songIndex

  /* sync presentation data when the source trip changes (e.g. after refresh) */
  useEffect(() => {
    setRiders(thisTrip.riders)
    setPlaylists(thisTrip.playlists)
  }, [thisTrip])

  const songs = thisTrip.songs
  const hasMusic = songs.length > 0
  const currentSong = songs[songIndex]
  const onlineCount = riders.filter((r) => r.status !== 'offline').length

  /* ---------- loading ---------- */
  useEffect(() => {
    const t = window.setTimeout(() => setLoading(false), 1450)
    return () => window.clearTimeout(t)
  }, [])

  /* ---------- music playback simulation ---------- */
  const goToSong = useCallback(
    (i: number) => {
      const n = songs.length
      if (n === 0) return
      setSongIndex(((i % n) + n) % n)
      setProgress(0)
    },
    [songs.length],
  )

  const nextSong = useCallback(() => goToSong(songIndexRef.current + 1), [goToSong])
  const prevSong = useCallback(() => goToSong(songIndexRef.current - 1), [goToSong])

  const seek = useCallback(
    (seconds: number) => {
      const song = songs[songIndexRef.current]
      if (!song) return
      setProgress(Math.max(0, Math.min(song.duration, seconds)))
    },
    [songs],
  )

  useEffect(() => {
    if (!isPlaying) return
    const id = window.setInterval(() => setProgress((p) => p + 0.5), 500)
    return () => window.clearInterval(id)
  }, [isPlaying])

  useEffect(() => {
    const song = songs[songIndex]
    if (song && progress >= song.duration && progress > 0) nextSong()
  }, [progress, songIndex, songs, nextSong])

  useEffect(() => {
    if (!currentSong && songIndex !== 0) setSongIndex(0)
  }, [currentSong, songIndex])

  /* ---------- demo: subtle rider presence drift ---------- */
  useEffect(() => {
    if (!trip) return
    const id = window.setInterval(() => {
      const online = ridersRef.current.filter((r) => r.status === 'online')
      if (online.length <= 5) return
      const victim = online[Math.floor(Math.random() * online.length)]
      ridersRef.current = ridersRef.current.map((r) => (r.id === victim.id ? { ...r, status: 'weak' as const } : r))
      setRiders(ridersRef.current)
      window.setTimeout(() => {
        ridersRef.current = ridersRef.current.map((r) =>
          r.id === victim.id ? { ...r, status: 'online' as const, speed: 72 } : r,
        )
        setRiders(ridersRef.current)
      }, 7000)
    }, 26000)
    return () => window.clearInterval(id)
  }, [trip])

  /* ---------- demo: one brief reconnection blip ---------- */
  useEffect(() => {
    if (!trip) return
    const t = window.setTimeout(() => {
      setConnection('reconnecting')
      window.setTimeout(() => setConnection('connected'), 3500)
    }, 12000)
    return () => window.clearTimeout(t)
  }, [trip])

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

  useEffect(() => {
    if (!musicExpanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMusicExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [musicExpanded])

  const openDrawer = (kind: Exclude<DrawerKind, null>) => setDrawer((d) => (d === kind ? null : kind))

  const handleOpenMusic = () => {
    if (hasMusic) setMusicExpanded(true)
    else openDrawer('playlists')
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
        onOpenPlaylists={() => openDrawer('playlists')}
        onOpenRiders={() => openDrawer('riders')}
        onOpenTripInfo={() => openDrawer('tripinfo')}
      />

      {currentSong ? (
        <MusicPlayer
          song={currentSong}
          queueCount={songs.length}
          isPlaying={isPlaying}
          progress={progress}
          onToggle={() => setIsPlaying((p) => !p)}
          onPrev={prevSong}
          onNext={nextSong}
          onSeek={seek}
          isMobile={isMobile}
          expanded={musicExpanded}
          onSetExpanded={setMusicExpanded}
        />
      ) : null}

      <MobileBottomNav
        active={mapOpen ? 'map' : undefined}
        onOpenMap={() => setMapOpen(true)}
        onOpenMusic={handleOpenMusic}
        onOpenRiders={() => openDrawer('riders')}
        onOpenTripInfo={() => openDrawer('tripinfo')}
      />

      <ConnectionStatus state={connection} />
      <GpsStatus state={gps} onEnable={() => setGps('tracking')} />

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