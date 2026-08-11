import { useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronUp, ExternalLink, Music2, X } from 'lucide-react'
import AlbumArt from './AlbumArt'
import Equalizer from './Equalizer'
import MusicControls from './MusicControls'
import type { Song } from '../types'

interface MusicPlayerProps {
  song: Song
  queueCount: number
  isPlaying: boolean
  progress: number
  onToggle: () => void
  onPrev: () => void
  onNext: () => void
  onSeek: (seconds: number) => void
  isMobile: boolean
  expanded: boolean
  onSetExpanded: (v: boolean) => void
}

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

export default function MusicPlayer({
  song,
  queueCount,
  isPlaying,
  progress,
  onToggle,
  onPrev,
  onNext,
  onSeek,
  isMobile,
  expanded,
  onSetExpanded,
}: MusicPlayerProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const pct = Math.min(100, (progress / song.duration) * 100)

  const seekFromEvent = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = trackRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    onSeek(ratio * song.duration)
  }

  if (isMobile) {
    return (
      <>
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, delay: 1.35, ease: 'easeOut' }}
          className="rt-mobile-player fixed inset-x-3 z-40"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 78px)' }}
        >
          <button
            type="button"
            onClick={() => onSetExpanded(true)}
            className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-[rgba(20,20,20,0.7)] p-3 text-left backdrop-blur-xl transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-ember"
            aria-label={`Open full music player — ${song.title} by ${song.artist}`}
          >
            <AlbumArt from={song.accentFrom} to={song.accentTo} size={52} playing={isPlaying} rounded="rounded-xl" title={song.title} artist={song.artist} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm font-semibold text-bone">{song.title}</p>
              <p className="flex items-center gap-1.5 truncate text-xs text-mist/80">
                {song.artist}
                {isPlaying ? <Equalizer playing className="ml-1" /> : null}
              </p>
            </div>
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-bone text-night" aria-hidden="true">
              {isPlaying ? <span className="flex gap-[3px]" role="presentation"><span className="rt-eq-bar h-4 w-[3px] rounded-full bg-night/70" /><span className="rt-eq-bar h-4 w-[3px] rounded-full bg-night/70" style={{ animationDelay: '0.2s' }} /><span className="rt-eq-bar h-4 w-[3px] rounded-full bg-night/70" style={{ animationDelay: '0.4s' }} /></span> : <Music2 size={18} />}
            </span>
            <ChevronUp size={16} className="shrink-0 text-mist/60" aria-hidden="true" />
          </button>
        </motion.div>

        <AnimatePresence>
          {expanded ? (
            <motion.div
              className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-night/90 px-6 backdrop-blur-2xl"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              role="dialog"
              aria-modal="true"
              aria-label="Music player"
            >
              <div
                className="pointer-events-none absolute inset-0"
                style={{ background: `radial-gradient(80% 50% at 50% 115%, ${song.accentFrom}22, transparent 70%)` }}
                aria-hidden="true"
              />
              <button
                type="button"
                onClick={() => onSetExpanded(false)}
                aria-label="Close music player"
                className="absolute right-4 top-4 z-10 grid size-10 place-items-center rounded-full border border-white/10 bg-white/5 text-mist transition hover:bg-white/10 hover:text-bone focus-visible:outline-2 focus-visible:outline-ember"
              >
                <X size={18} />
              </button>

              <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.45, ease: 'easeOut' }}>
                <AlbumArt from={song.accentFrom} to={song.accentTo} size={Math.min(340, window.innerWidth - 96)} playing={isPlaying} rounded="rounded-3xl" title={song.title} artist={song.artist} />
              </motion.div>

              <motion.div
                initial={{ y: 16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.1, duration: 0.4 }}
                className="mt-8 flex w-full max-w-sm flex-col items-center"
              >
                <p className="text-center font-display text-2xl font-bold tracking-tight text-bone">{song.title}</p>
                <p className="mt-1 text-sm text-mist/80">{song.artist}</p>
                <p className="mt-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-mist/50">
                  {queueCount} in queue {isPlaying ? <Equalizer playing className="ml-1" /> : null}
                </p>

                <div
                  ref={trackRef}
                  role="slider"
                  aria-label="Seek"
                  aria-valuemin={0}
                  aria-valuemax={song.duration}
                  aria-valuenow={Math.floor(progress)}
                  tabIndex={0}
                  onPointerDown={seekFromEvent}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowRight') onSeek(Math.min(song.duration, progress + 5))
                    if (e.key === 'ArrowLeft') onSeek(Math.max(0, progress - 5))
                  }}
                  className="group mt-6 w-full cursor-pointer"
                >
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/12">
                    <div className="relative h-full rounded-full bg-gradient-to-r from-ember to-sunset transition-[width] duration-300 ease-linear" style={{ width: `${pct}%` }}>
                      <span className="absolute -right-1 top-1/2 size-3 -translate-y-1/2 rounded-full bg-bone opacity-0 shadow transition group-hover:opacity-100" />
                    </div>
                  </div>
                  <div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-mist/60">
                    <span>{formatTime(progress)}</span>
                    <span>{formatTime(song.duration)}</span>
                  </div>
                </div>

                <div className="mt-4">
                  <MusicControls size="md" isPlaying={isPlaying} onToggle={onToggle} onPrev={onPrev} onNext={onNext} />
                </div>

                <a
                  href={song.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-4 py-2 text-xs font-medium text-bone/80 transition hover:scale-[1.03] hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-ember"
                >
                  Listen on {song.provider === 'spotify' ? 'Spotify' : 'YouTube Music'}
                  <ExternalLink size={12} aria-hidden="true" />
                </a>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </>
    )
  }

  // desktop floating player
  return (
    <motion.div
      initial={{ y: 70, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, delay: 1.3, ease: 'easeOut' }}
      className="rt-desktop-player fixed bottom-6 left-1/2 z-40 w-[min(480px,max(300px,calc(100vw-360px)))] -translate-x-1/2"
    >
      <div className="flex items-center gap-4 rounded-3xl border border-white/12 bg-[rgba(20,20,20,0.55)] p-4 pr-5 shadow-2xl backdrop-blur-2xl">
        <AlbumArt from={song.accentFrom} to={song.accentTo} size={72} playing={isPlaying} rounded="rounded-2xl" title={song.title} artist={song.artist} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-display text-[15px] font-semibold text-bone">{song.title}</p>
            <span className="shrink-0" aria-hidden="true">
              {isPlaying ? <Equalizer playing className="mr-2" /> : null}
            </span>
          </div>
          <p className="truncate text-xs text-mist/80">{song.artist}</p>
          <div
            ref={trackRef}
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={song.duration}
            aria-valuenow={Math.floor(progress)}
            tabIndex={0}
            onPointerDown={seekFromEvent}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') onSeek(Math.min(song.duration, progress + 5))
              if (e.key === 'ArrowLeft') onSeek(Math.max(0, progress - 5))
            }}
            className="group mt-2.5 w-full cursor-pointer"
          >
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/12">
              <div className="relative h-full rounded-full bg-gradient-to-r from-ember to-sunset transition-[width] duration-300 ease-linear" style={{ width: `${pct}%` }}>
                <span className="absolute -right-1 top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-bone opacity-0 transition group-hover:opacity-100" />
              </div>
            </div>
          </div>
        </div>
        <MusicControls size="sm" isPlaying={isPlaying} onToggle={onToggle} onPrev={onPrev} onNext={onNext} />
      </div>
    </motion.div>
  )
}
