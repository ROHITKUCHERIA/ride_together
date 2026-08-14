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
    : 'bottom-6 right-6 left-auto w-[min(380px,calc(100vw-2rem))]'

  return (
    <AnimatePresence>
      <motion.div
        key="mini-player"
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 16, opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className={`fixed z-[45] ${positionClass}`}
        style={isMobile && onTripPage ? { paddingBottom: '0' } : undefined}
      >
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/85 shadow-[0_16px_48px_-16px_rgba(0,0,0,0.85)] backdrop-blur-xl">
          <button
            type="button"
            onClick={music.openFullPlayer}
            aria-label={`Open full music player — ${current.song.title} by ${current.song.artist}`}
            className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-zinc-800/40 focus-visible:outline-2 focus-visible:outline-cyan-400 active:scale-[0.99]"
          >
            <span className="shrink-0">
              {current.song.thumbnailUrl !== null ? (
                <img
                  src={current.song.thumbnailUrl}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="size-10 rounded-md border border-zinc-800 object-cover"
                />
              ) : (
                <span className="grid size-10 place-items-center rounded-md bg-zinc-800/60 text-zinc-600">
                  <Music2 size={14} aria-hidden="true" />
                </span>
              )}
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.25em] text-zinc-500">
                &gt; Now Playing
                {state.isPlaying ? (
                  <Equalizer playing bars={3} className="h-2.5" barClassName="bg-cyan-400" />
                ) : (
                  <span className="size-1.5 rounded-full bg-zinc-600" aria-hidden="true" />
                )}
              </span>
              <span className="mt-0.5 block truncate font-display text-[13px] font-semibold text-zinc-100">
                {current.song.title}
              </span>
              <span className="mt-0.5 block truncate font-mono text-[10px] text-zinc-500">
                {current.song.artist} · {formatTime(state.currentTime)} / {formatTime(state.duration)}
              </span>
            </span>

            <span className="flex shrink-0 items-center gap-1.5">
              <span
                role="button"
                tabIndex={0}
                aria-label={state.isPlaying ? 'Pause' : 'Play'}
                className="grid size-9 place-items-center rounded-md border border-zinc-700 bg-zinc-800/70 text-zinc-100 transition hover:border-cyan-500/50 hover:text-cyan-300 focus-visible:outline-2 focus-visible:outline-cyan-400"
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
                  <Pause size={15} fill="currentColor" />
                ) : (
                  <Play size={15} fill="currentColor" className="ml-0.5" />
                )}
              </span>
              <span
                role="button"
                tabIndex={0}
                aria-label="Next song"
                className="hidden size-9 place-items-center rounded-md text-zinc-400 transition hover:bg-zinc-800/60 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-cyan-400 sm:grid"
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
              <ChevronUp size={14} className="text-zinc-600" aria-hidden="true" />
            </span>
          </button>

          {/* progress */}
          <div className="relative h-[3px] w-full bg-zinc-800" aria-hidden="true">
            <div
              className="h-full bg-cyan-400 transition-[width] duration-300 ease-linear"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}