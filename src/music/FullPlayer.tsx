import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  ListMusic,
  Music2,
  Pause,
  Play,
  RefreshCw,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import Equalizer from '../components/Equalizer'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'
import { useIsMobile } from '../hooks/useMediaQuery'
import { useMusicPlayer } from './context'
import { formatTime } from './playerState'

interface SeekBarProps {
  value: number
  max: number
  ariaLabel: string
  onChange: (next: number) => void
  className?: string
}

function SeekBar({ value, max, ariaLabel, onChange, className }: SeekBarProps) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const draggingRef = useRef(false)
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0

  const apply = (clientX: number) => {
    const el = trackRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    onChange(ratio * max)
  }

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      className={`group relative h-10 cursor-pointer touch-none ${className ?? ''}`}
      onPointerDown={(e) => {
        draggingRef.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        apply(e.clientX)
      }}
      onPointerMove={(e) => {
        if (draggingRef.current) apply(e.clientX)
      }}
      onPointerUp={() => {
        draggingRef.current = false
      }}
      onPointerCancel={() => {
        draggingRef.current = false
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') onChange(Math.min(max, value + 5))
        if (e.key === 'ArrowLeft') onChange(Math.max(0, value - 5))
      }}
    >
      <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 overflow-hidden rounded-full bg-white/12">
        <div
          className="h-full rounded-full bg-gradient-to-r from-ember to-sunset transition-[width] duration-150 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        aria-hidden="true"
        className="absolute top-1/2 size-3.5 -translate-y-1/2 rounded-full bg-bone opacity-0 shadow-[0_2px_8px_rgba(0,0,0,0.5)] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        style={{ left: `calc(${pct}% - 7px)` }}
      />
    </div>
  )
}

/**
 * Full-screen music player overlay. Pure presentation — every control forwards
 * to the single central music player, so nothing here owns playback state.
 */
export default function FullPlayer() {
  const music = useMusicPlayer()
  const { state, current } = music
  const isMobile = useIsMobile()
  const [queueOpen, setQueueOpen] = useState(false)

  const open = state.fullPlayerOpen && current !== null

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') music.closeFullPlayer()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, music])

  useEffect(() => {
    if (!open) setQueueOpen(false)
  }, [open])

  const panelMotion = isMobile
    ? { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' } }
    : { initial: { opacity: 0, scale: 0.94, y: 12 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: 0.96, y: 12 } }

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Music player">
          <motion.div
            className="absolute inset-0 bg-night/70 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={music.closeFullPlayer}
          />

          <motion.div
            initial={panelMotion.initial}
            animate={panelMotion.animate}
            exit={panelMotion.exit}
            transition={{ type: isMobile ? 'spring' : 'tween', damping: 30, stiffness: 300, duration: isMobile ? undefined : 0.35 }}
            className={`rt-scroll relative flex flex-col overflow-y-auto border-white/10 bg-[rgba(16,16,19,0.94)] backdrop-blur-2xl ${
              isMobile
                ? 'max-h-[92dvh] w-full rounded-t-[2rem] border-t px-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] pt-6'
                : 'w-full max-w-lg rounded-[2rem] border p-7 shadow-2xl'
            }`}
          >
            {isMobile ? (
              <span className="mx-auto mb-4 h-1 w-12 rounded-full bg-white/15" aria-hidden="true" />
            ) : null}

            <button
              type="button"
              onClick={music.closeFullPlayer}
              aria-label="Close music player"
              className={`grid size-10 place-items-center rounded-full border border-white/10 bg-white/5 text-mist transition hover:scale-105 hover:bg-white/10 hover:text-bone focus-visible:outline-2 focus-visible:outline-ember ${
                isMobile ? 'absolute right-5 top-6' : 'absolute right-6 top-6'
              }`}
            >
              <X size={17} />
            </button>

            {current ? (
              <>
                {/* artwork */}
                <div className="relative mx-auto mt-2 w-full overflow-hidden rounded-3xl">
                  {current.song.thumbnailUrl !== null ? (
                    <img
                      src={current.song.thumbnailUrl}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="aspect-video w-full object-cover ring-1 ring-white/10"
                    />
                  ) : (
                    <span className="grid aspect-video w-full place-items-center bg-gradient-to-br from-ember/20 to-transparent text-ember/70 ring-1 ring-white/10">
                      <Music2 size={64} aria-hidden="true" />
                    </span>
                  )}

                  {state.isPlaying ? (
                    <span className="pointer-events-none absolute inset-0 grid place-items-center bg-gradient-to-t from-night/70 via-transparent to-transparent">
                      <span className="grid size-16 place-items-center rounded-full bg-night/55 backdrop-blur-sm">
                        <Equalizer playing bars={5} className="h-5" />
                      </span>
                    </span>
                  ) : null}
                </div>

                {/* title + meta */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05, duration: 0.35 }}
                  className="mt-5 text-center"
                >
                  <h2 className="font-display text-2xl font-bold tracking-tight text-bone">{current.song.title}</h2>
                  <p className="mt-1 text-sm text-mist/80">{current.song.artist}</p>
                  <p className="mt-2 flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-[0.26em] text-mist/50">
                    {state.queue.length} in queue
                    {state.isPlaying ? <Equalizer playing className="ml-1" /> : null}
                  </p>
                </motion.div>

                {/* error */}
                {state.error ? (
                  <div className="mt-5 flex items-start gap-3 rounded-2xl border border-road/30 bg-road/10 px-4 py-3 text-left" role="alert">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0 text-road" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-bone">{state.error}</p>
                      <Button variant="danger" size="sm" onClick={music.retryCurrent} className="mt-2">
                        <RefreshCw size={13} aria-hidden="true" /> Try again
                      </Button>
                    </div>
                  </div>
                ) : null}

                {/* autoplay prompt */}
                {state.needsPlayPrompt && !state.isPlaying && !state.error ? (
                  <motion.button
                    type="button"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={music.resumePlay}
                    className="mx-auto mt-5 inline-flex items-center gap-2 rounded-full border border-ember/40 bg-ember/15 px-5 py-2.5 text-sm font-semibold text-bone transition hover:bg-ember/25 focus-visible:outline-2 focus-visible:outline-ember"
                  >
                    <span className="relative flex size-2" aria-hidden="true">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ember opacity-60" />
                      <span className="relative inline-flex size-2 rounded-full bg-ember" />
                    </span>
                    Tap Play to start music
                  </motion.button>
                ) : null}

                {/* progress */}
                <div className="mt-5">
                  <SeekBar value={state.currentTime} max={state.duration || 1} ariaLabel="Seek" onChange={music.seek} />
                  <div className="flex justify-between text-[10px] tabular-nums text-mist/55">
                    <span>{formatTime(state.currentTime)}</span>
                    <span>{formatTime(state.duration)}</span>
                  </div>
                </div>

                {/* controls */}
                <div className="mt-1 flex items-center justify-center gap-5">
                  <button
                    type="button"
                    onClick={music.prev}
                    aria-label="Previous song"
                    className="grid size-12 place-items-center rounded-full text-bone/70 transition hover:scale-110 hover:text-bone focus-visible:outline-2 focus-visible:outline-ember"
                  >
                    <SkipBack size={22} />
                  </button>

                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    onClick={music.togglePlay}
                    aria-label={state.isPlaying ? 'Pause' : 'Play'}
                    className="relative grid size-20 place-items-center rounded-full bg-bone text-night shadow-[0_12px_40px_-12px_rgba(244,239,231,0.55)] transition hover:scale-[1.03] hover:bg-white focus-visible:outline-2 focus-visible:outline-ember"
                  >
                    {state.isPlaying ? (
                      <>
                        <span
                          aria-hidden="true"
                          className="absolute -inset-1.5 animate-spin rounded-full"
                          style={{ background: 'conic-gradient(from 180deg, transparent 0deg, rgba(255,107,44,0.5) 130deg, transparent 240deg)' }}
                        />
                        <Pause size={30} fill="currentColor" className="relative" />
                      </>
                    ) : (
                      <Play size={30} fill="currentColor" className="relative ml-1" />
                    )}
                  </motion.button>

                  <button
                    type="button"
                    onClick={music.next}
                    aria-label="Next song"
                    className="grid size-12 place-items-center rounded-full text-bone/70 transition hover:scale-110 hover:text-bone focus-visible:outline-2 focus-visible:outline-ember"
                  >
                    <SkipForward size={22} />
                  </button>
                </div>

                {state.loading ? <Spinner label="Loading…" /> : null}

                {/* volume */}
                <div className="mt-5 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={music.toggleMute}
                    aria-label={state.muted ? 'Unmute' : 'Mute'}
                    className="grid size-9 shrink-0 place-items-center rounded-full text-bone/80 transition hover:text-bone focus-visible:outline-2 focus-visible:outline-ember"
                  >
                    {state.muted || state.volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </button>
                  <SeekBar
                    value={state.muted ? 0 : state.volume}
                    max={100}
                    ariaLabel="Volume"
                    onChange={music.setVolume}
                    className="flex-1"
                  />
                  <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-mist/55">{state.muted ? 0 : state.volume}%</span>
                </div>

                {/* queue */}
                <div className="mt-6 border-t border-white/8 pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setQueueOpen((v) => !v)}
                      aria-expanded={queueOpen}
                      className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-bone/80 transition hover:bg-white/5 hover:text-bone focus-visible:outline-2 focus-visible:outline-ember"
                    >
                      <ListMusic size={15} aria-hidden="true" />
                      Queue {state.queue.length > 0 ? `· ${state.queue.length}` : ''}
                    </button>
                    {state.queue.length > 1 ? (
                      <Button variant="ghost" size="sm" onClick={music.clearQueue}>
                        <Trash2 size={13} aria-hidden="true" /> Clear
                      </Button>
                    ) : null}
                  </div>

                  <AnimatePresence initial={false}>
                    {queueOpen && state.queue.length > 0 ? (
                      <motion.ul
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                        className="rt-scroll mt-3 max-h-64 overflow-y-auto space-y-1.5"
                        aria-label="Up next"
                      >
                        {state.queue.map((item, index) => {
                          const isCurrent = state.currentIndex === index
                          return (
                            <li
                              key={item.key}
                              className={`flex items-center gap-3 rounded-xl border p-2.5 transition ${
                                isCurrent ? 'border-ember/30 bg-ember/10' : 'border-white/8 bg-white/[0.03]'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => music.playIndex(index)}
                                className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-ember"
                                aria-label={`Play ${item.song.title}`}
                              >
                                {item.song.thumbnailUrl !== null ? (
                                  <img
                                    src={item.song.thumbnailUrl}
                                    alt=""
                                    loading="lazy"
                                    referrerPolicy="no-referrer"
                                    className="size-10 shrink-0 rounded-lg object-cover ring-1 ring-white/10"
                                  />
                                ) : (
                                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/5 text-mist/50 ring-1 ring-white/10">
                                    <Music2 size={14} aria-hidden="true" />
                                  </span>
                                )}
                                <span className="min-w-0 flex-1">
                                  <span className={`block truncate text-sm ${isCurrent ? 'font-semibold text-bone' : 'text-bone/85'}`}>
                                    {item.song.title}
                                  </span>
                                  <span className="block truncate text-[11px] text-mist/65">{item.song.artist}</span>
                                </span>
                              </button>

                              {isCurrent ? (
                                <span className="shrink-0" aria-label="Now playing">
                                  <Equalizer playing />
                                </span>
                              ) : null}

                              <button
                                type="button"
                                onClick={() => music.removeFromQueue(item.key)}
                                aria-label={`Remove ${item.song.title} from queue`}
                                className="grid size-8 shrink-0 place-items-center rounded-full text-mist/60 transition hover:bg-road/15 hover:text-road focus-visible:outline-2 focus-visible:outline-road"
                              >
                                <Trash2 size={13} />
                              </button>
                            </li>
                          )
                        })}
                      </motion.ul>
                    ) : null}
                  </AnimatePresence>
                </div>
              </>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  )
}