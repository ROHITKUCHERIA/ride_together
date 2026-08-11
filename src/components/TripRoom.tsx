import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import ConnectionStatus from './ConnectionStatus'
import CursorSpotlight from './CursorSpotlight'
import FilmGrain from './FilmGrain'
import FloatingActions from './FloatingActions'
import GpsStatus from './GpsStatus'
import LiveMap from './LiveMap'
import LoadingScreen from './LoadingScreen'
import MobileBottomNav from './MobileBottomNav'
import MusicPlayer from './MusicPlayer'
import OnlineIndicator from './OnlineIndicator'
import PlaylistDrawer from './PlaylistDrawer'
import RidersDrawer from './RidersDrawer'
import TripHero from './TripHero'
import TripInfoDrawer from './TripInfoDrawer'
import TripNavigation from './TripNavigation'
import { trip as mockTrip } from '../data/mockData'
import { useIsMobile } from '../hooks/useMediaQuery'
import type { ConnectionState, DrawerKind, GpsState, Playlist, Rider } from '../types'

export default function TripRoom() {
  const isMobile = useIsMobile()

  const [loading, setLoading] = useState(true)
  const [drawer, setDrawer] = useState<DrawerKind>(null)
  const [mapOpen, setMapOpen] = useState(false)
  const [musicExpanded, setMusicExpanded] = useState(false)

  const [riders, setRiders] = useState<Rider[]>(mockTrip.riders)
  const [playlists, setPlaylists] = useState<Playlist[]>(mockTrip.playlists)
  const [connection, setConnection] = useState<ConnectionState>('connected')
  const [gps, setGps] = useState<GpsState>('tracking')

  const [songIndex, setSongIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)

  const ridersRef = useRef(riders)
  ridersRef.current = riders
  const songIndexRef = useRef(songIndex)
  songIndexRef.current = songIndex

  const onlineCount = riders.filter((r) => r.status !== 'offline').length
  const currentSong = mockTrip.songs[songIndex]

  /* ---------- loading ---------- */
  useEffect(() => {
    const t = window.setTimeout(() => setLoading(false), 1450)
    return () => window.clearTimeout(t)
  }, [])

  /* ---------- music playback simulation ---------- */
  const goToSong = useCallback((i: number) => {
    const n = mockTrip.songs.length
    setSongIndex(((i % n) + n) % n)
    setProgress(0)
  }, [])

  const nextSong = useCallback(() => goToSong(songIndexRef.current + 1), [goToSong])
  const prevSong = useCallback(() => goToSong(songIndexRef.current - 1), [goToSong])
  const seek = useCallback((seconds: number) => setProgress(Math.max(0, Math.min(mockTrip.songs[songIndexRef.current].duration, seconds))), [])

  useEffect(() => {
    if (!isPlaying) return
    const id = window.setInterval(() => setProgress((p) => p + 0.5), 500)
    return () => window.clearInterval(id)
  }, [isPlaying])

  useEffect(() => {
    if (progress >= mockTrip.songs[songIndex].duration && progress > 0) nextSong()
  }, [progress, songIndex, nextSong])

  /* ---------- demo: subtle rider presence drift ---------- */
  useEffect(() => {
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
  }, [])

  /* ---------- demo: one brief reconnection blip ---------- */
  useEffect(() => {
    const t = window.setTimeout(() => {
      setConnection('reconnecting')
      window.setTimeout(() => setConnection('connected'), 3500)
    }, 12000)
    return () => window.clearTimeout(t)
  }, [])

  /* ---------- map: lock scroll + escape ---------- */
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

  const addPlaylist = (name: string) => {
    const id = `pl-${Date.now()}`
    setPlaylists((prev) => [
      { id, name, emoji: '🎧', owner: 'Rohit', songCount: 0, scope: 'my' },
      ...prev,
    ])
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-night font-ui text-bone">
      <AnimatePresence>{loading ? <LoadingScreen key="loading" /> : null}</AnimatePresence>

      <TripHero trip={mockTrip} />
      <TripNavigation trip={mockTrip} onlineCount={onlineCount} />

      <FloatingActions
        onOpenMap={() => setMapOpen(true)}
        onOpenPlaylists={() => openDrawer('playlists')}
        onOpenRiders={() => openDrawer('riders')}
        onOpenTripInfo={() => openDrawer('tripinfo')}
      />

      <MusicPlayer
        song={currentSong}
        queueCount={mockTrip.songs.length}
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

      <MobileBottomNav
        onOpenMap={() => setMapOpen(true)}
        onOpenMusic={() => setMusicExpanded(true)}
        onOpenRiders={() => openDrawer('riders')}
        onOpenTripInfo={() => openDrawer('tripinfo')}
      />

      <ConnectionStatus state={connection} />
      <GpsStatus state={gps} onEnable={() => setGps('tracking')} />

      <AnimatePresence>
        {mapOpen ? (
          <LiveMap
            key="livemap"
            open={mapOpen}
            onClose={() => setMapOpen(false)}
            riders={riders}
            connection={connection}
            gps={gps}
            onEnableGps={() => setGps('tracking')}
          />
        ) : null}
      </AnimatePresence>

      <PlaylistDrawer
        open={drawer === 'playlists'}
        onClose={() => setDrawer(null)}
        playlists={playlists}
        onCreate={addPlaylist}
      />
      <RidersDrawer open={drawer === 'riders'} onClose={() => setDrawer(null)} riders={riders} onlineCount={onlineCount} />
      <TripInfoDrawer open={drawer === 'tripinfo'} onClose={() => setDrawer(null)} trip={mockTrip} />

      {/* mobile / tablet keeps a compact online chip in the nav's empty center slot */}
      <div className="rt-online-chip pointer-events-none fixed left-1/2 top-3 z-40 -translate-x-1/2 lg:hidden">
        <OnlineIndicator count={onlineCount} className="bg-night/45" />
      </div>

      <FilmGrain />
      <CursorSpotlight />
    </div>
  )
}
