import { AnimatePresence, motion } from 'framer-motion'
import { ChevronUp, Music2, Pause, Play, SkipForward } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { useIsMobile } from '../hooks/useMediaQuery'
import Equalizer from '../components/Equalizer'
import { useMusicPlayer } from './context'
import { formatTime } from './playerState'

/** Compact, persistent bar shown while a song is active. Tapping it opens the full player. */
export default function MiniPlayer() {
  const music = useMusicPlayer()
  const { state, current } = music
  const isMobile = useIsMobile()
  const location = useLocation()
  const onTripPage = location.pathname.startsWith('/app/trips/')

  if (!current) return null

  const pct = state.duration > 0 ? Math.min(100, (state.currentTime / state.duration) * 100) : 0

  const positionClass = isMobile
    ? `inset-x-3 ${onTripPage ? 'bottom-[calc(env(safe-area-inset-bottom,0px)+76px)]' : 'bottom-[calc(env(safe-area-inset-bottom,0px)+12px)]'}`
    : 'bottom-6 right-6 left-auto w-[min(400px,calc(100vw-2rem))]'

  return (
    <AnimatePresence>
      <motion.div
        key="mini-player"
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className={`fixed z-[45] ${positionClass}`}
        style={isMobile && onTripPage ? { paddingBottom: '0' } : undefined}
      >
        <div className="overflow-hidden rounded-2xl border border-white/12 bg-[rgba(20,20,20,0.82)] shadow-2xl backdrop-blur-2xl">
          <button
            type="button"
            onClick={music.openFullPlayer}
            aria-label={`Open full music player — ${current.song.title} by ${current.song.artist}`}
            className="flex w-full items-center gap-3 p-3 text-left transition hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-ember active:scale-[0.99]"
          >
            {current.song.thumbnailUrl !== null ? (
              <img
                src={current.song.thumbnailUrl}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="size-12 shrink-0 rounded-xl object-cover ring-1 ring-white/10"
              />
            ) : (
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-white/5 text-mist/50 ring-1 ring-white/10">
                <Music2 size={16} aria-hidden="true" />
              </span>
            )}

            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-sm font-semibold text-bone">{current.song.title}</span>
              <span className="mt-0.5 block truncate text-xs text-mist/80">
                {current.song.artist}
                {state.isPlaying ? <Equalizer playing className="ml-1.5 inline-block align-middle" /> : null}
              </span>
              <span className="mt-0.5 block text-[10px] tabular-nums text-mist/50">
                {formatTime(state.currentTime)} / {formatTime(state.duration)}
              </span>
            </span>

            <span className="flex shrink-0 items-center gap-2">
              <span
                role="button"
                tabIndex={0}
                aria-label={state.isPlaying ? 'Pause' : 'Play'}
                className="grid size-11 place-items-center rounded-full bg-bone text-night transition hover:bg-white focus-visible:outline-2 focus-visible:outline-ember"
                onClick={(e) => {
                  e.stopPropagation()
                  if (state.needsPlayPrompt && !state.isPlaying) music.resumePlay()
                  else music.togglePlay()
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    e.stopPropagation()
                    if (state.needsPlayPrompt && !state.isPlaying) music.resumePlay()
                    else music.togglePlay()
                  }
                }}
              >
                {state.isPlaying ? (
                  <Pause size={18} fill="currentColor" />
                ) : (
                  <Play size={18} fill="currentColor" className="ml-0.5" />
                )}
              </span>
              <span
                role="button"
                tabIndex={0}
                aria-label="Next song"
                className="hidden grid size-10 place-items-center rounded-full text-bone/70 transition hover:scale-110 hover:text-bone focus-visible:outline-2 focus-visible:outline-ember sm:grid"
                onClick={(e) => {
                  e.stopPropagation()
                  music.next()
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    e.stopPropagation()
                    music.next()
                  }
                }}
              >
                <SkipForward size={15} />
              </span>
              <ChevronUp size={15} className="text-mist/50" aria-hidden="true" />
            </span>
          </button>

          <div className="relative h-0.5 w-full bg-white/10" aria-hidden="true">
            <div
              className="h-full rounded-r-full bg-gradient-to-r from-ember to-sunset transition-[width] duration-500 ease-linear"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}