import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  AudioLines,
  ListMusic,
  MoreVertical,
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
import { useIsMobile } from '../hooks/useMediaQuery'
import { useMusicPlayer, type MusicPlayerContextValue } from './context'
import { formatTime } from './playerState'
import type { QueueItem } from './playerState'

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
      className={`group relative h-7 cursor-pointer touch-none ${className ?? ''}`}
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
      <div className="absolute top-1/2 h-[3px] w-full -translate-y-1/2 overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full bg-cyan-400 transition-[width] duration-100 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        aria-hidden="true"
        className="absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-cyan-400 shadow-[0_0_0_3px_rgba(34,211,238,0.18)] transition-transform duration-150 group-hover:scale-125"
        style={{ left: `calc(${pct}% - 5px)` }}
      />
    </div>
  )
}

interface LeftRailProps {
  music: MusicPlayerContextValue
  onGoQueue: () => void
}

function LeftRail({ music, onGoQueue }: LeftRailProps) {
  const { state, current } = music
  return (
    <div className="flex flex-1 flex-col gap-7 p-3">
      <section>
        <p className="px-2.5 font-mono text-[9px] uppercase tracking-[0.3em] text-zinc-500">Music</p>
        <nav className="mt-2 space-y-0.5" aria-label="Music player sections">
          <div className="flex items-center gap-2.5 rounded-md bg-zinc-800/60 px-2.5 py-2 text-[13px] font-medium text-zinc-100">
            <Play size={12} className="shrink-0 text-cyan-400" fill="currentColor" aria-hidden="true" />
            <span>Now Playing</span>
            {state.isPlaying ? (
              <span className="ml-auto" aria-label="Playing">
                <Equalizer playing bars={3} className="h-3" barClassName="bg-cyan-400" />
              </span>
            ) : (
              <span className="ml-auto size-1.5 rounded-full bg-zinc-600" aria-hidden="true" />
            )}
          </div>
          <button
            type="button"
            onClick={onGoQueue}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-zinc-400 transition hover:bg-zinc-800/40 hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            <ListMusic size={12} className="shrink-0" aria-hidden="true" />
            <span>Up Next</span>
            <span className="ml-auto font-mono text-[10px] text-zinc-500">{state.queue.length}</span>
          </button>
        </nav>
      </section>

      <section>
        <p className="px-2.5 font-mono text-[9px] uppercase tracking-[0.3em] text-zinc-500">Track Info</p>
        <dl className="mt-2 space-y-1 px-2.5 font-mono text-[11px]">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-zinc-500">source</dt>
            <dd className="text-zinc-300">YouTube</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-zinc-500">status</dt>
            <dd className={state.isPlaying ? 'text-cyan-400' : 'text-zinc-300'}>
              {state.loading ? 'loading' : state.isPlaying ? 'playing' : 'paused'}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-zinc-500">position</dt>
            <dd className="text-zinc-300">{current ? `${state.currentIndex + 1} / ${state.queue.length}` : '–'}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-zinc-500">volume</dt>
            <dd className="text-zinc-300">{state.muted ? 0 : state.volume}%</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}

function MainPlayer({ music }: { music: MusicPlayerContextValue }) {
  const { state, current } = music
  if (!current) return null
  const thumbnailUrl = current.song.thumbnailUrl

  return (
    <div className="relative flex min-h-full flex-col items-center justify-center px-5 py-8 sm:px-8 lg:py-10">
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-80 w-full object-cover opacity-[0.14] blur-3xl"
        />
      ) : null}

      <div className="relative flex w-full max-w-xl flex-col items-center">
        {/* artwork */}
        <div className="h-44 w-44 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-[0_16px_56px_-20px_rgba(0,0,0,0.9)] sm:h-56 sm:w-56 lg:h-64 lg:w-64">
          {thumbnailUrl !== null ? (
            <img src={thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full w-full place-items-center text-zinc-600">
              <Music2 size={40} aria-hidden="true" />
            </span>
          )}
        </div>

        {/* song info */}
        <div className="mt-7 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-zinc-500">&gt; Now Playing</p>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
            {current.song.title}
          </h2>
          <p className="mt-1 text-sm text-zinc-400">{current.song.artist}</p>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
            YouTube · {current.song.duration ? formatTime(current.song.duration) : formatTime(state.duration)}
          </p>
        </div>

        {/* waveform */}
        <div className="mt-6 opacity-70">
          <Equalizer playing={state.isPlaying} bars={36} className="h-6 items-center gap-[3px]" barClassName="bg-cyan-400/60" />
        </div>

        {/* status rows: error / prompt / loading */}
        {state.error ? (
          <div className="mt-6 flex w-full max-w-md items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3.5 py-2.5" role="alert">
            <AlertTriangle size={14} className="shrink-0 text-red-400" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-left font-mono text-[11px] text-red-200">{state.error}</p>
            <button
              type="button"
              onClick={music.retryCurrent}
              className="shrink-0 rounded-md border border-red-400/30 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-red-300 transition hover:bg-red-400/10 focus-visible:outline-2 focus-visible:outline-red-400"
            >
              <RefreshCw size={11} className="mr-1 inline-block" aria-hidden="true" />
              Retry
            </button>
          </div>
        ) : null}

        {state.needsPlayPrompt && !state.isPlaying && !state.error ? (
          <button
            type="button"
            onClick={music.resumePlay}
            className="mt-6 flex items-center gap-2 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-2 font-mono text-[11px] uppercase tracking-wider text-cyan-300 transition hover:bg-cyan-500/15 focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            <Play size={12} fill="currentColor" aria-hidden="true" />
            Tap play
          </button>
        ) : null}

        {state.loading ? (
          <p className="mt-5 animate-pulse font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">loading…</p>
        ) : null}

        {/* progress */}
        <div className="mt-5 w-full max-w-md">
          <SeekBar value={state.currentTime} max={state.duration || 1} ariaLabel="Seek" onChange={music.seek} />
          <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] text-zinc-500">
            <span>{formatTime(state.currentTime)}</span>
            <span>{formatTime(state.duration)}</span>
          </div>
        </div>

        {/* controls */}
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={music.prev}
            aria-label="Previous song"
            className="grid size-11 place-items-center rounded-lg text-zinc-400 transition hover:bg-zinc-800/60 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            <SkipBack size={18} />
          </button>

          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={music.togglePlay}
            aria-label={state.isPlaying ? 'Pause' : 'Play'}
            className="grid size-14 place-items-center rounded-full border border-zinc-700 bg-zinc-900 text-zinc-100 shadow-[0_10px_32px_-16px_rgba(0,0,0,0.9)] transition hover:scale-[1.04] hover:border-cyan-500/50 focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            {state.isPlaying ? (
              <Pause size={20} fill="currentColor" aria-hidden="true" />
            ) : (
              <Play size={20} fill="currentColor" className="ml-0.5" aria-hidden="true" />
            )}
          </motion.button>

          <button
            type="button"
            onClick={music.next}
            aria-label="Next song"
            className="grid size-11 place-items-center rounded-lg text-zinc-400 transition hover:bg-zinc-800/60 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            <SkipForward size={18} />
          </button>
        </div>

        {/* volume */}
        <div className="mt-6 flex w-full max-w-xs items-center gap-3">
          <button
            type="button"
            onClick={music.toggleMute}
            aria-label={state.muted ? 'Unmute' : 'Mute'}
            className="shrink-0 text-zinc-400 transition hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            {state.muted || state.volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <SeekBar
            value={state.muted ? 0 : state.volume}
            max={100}
            ariaLabel="Volume"
            onChange={music.setVolume}
            className="flex-1"
          />
          <span className="w-9 shrink-0 text-right font-mono text-[10px] text-zinc-500">{state.muted ? 0 : state.volume}%</span>
        </div>
      </div>
    </div>
  )
}

interface QueuePanelProps {
  music: MusicPlayerContextValue
  menuKey: string | null
  onMenuKey: (key: string | null) => void
}

function QueuePanel({ music, menuKey, onMenuKey }: QueuePanelProps) {
  const { state } = music
  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-[1] flex items-center justify-between border-b border-zinc-800/80 bg-zinc-950/90 px-4 py-3 backdrop-blur">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-400">Up Next</p>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-zinc-600">{state.queue.length} tracks</span>
          {state.queue.length > 1 ? (
            <button
              type="button"
              onClick={music.clearQueue}
              aria-label="Clear queue"
              className="rounded-md p-1.5 text-zinc-500 transition hover:bg-zinc-800/60 hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-cyan-400"
            >
              <Trash2 size={13} />
            </button>
          ) : null}
        </div>
      </div>

      <ul className="flex-1 space-y-0.5 p-2" aria-label="Up next">
        {state.queue.length === 0 ? (
          <li className="px-3 py-10 text-center font-mono text-[11px] text-zinc-600">queue empty</li>
        ) : (
          state.queue.map((item, index) => (
            <QueueRow
              key={item.key}
              item={item}
              index={index}
              isCurrent={state.currentIndex === index}
              music={music}
              menuOpen={menuKey === item.key}
              onMenu={() => onMenuKey(menuKey === item.key ? null : item.key)}
            />
          ))
        )}
      </ul>
    </div>
  )
}

interface QueueRowProps {
  item: QueueItem
  index: number
  isCurrent: boolean
  music: MusicPlayerContextValue
  menuOpen: boolean
  onMenu: () => void
}

function QueueRow({ item, index, isCurrent, music, menuOpen, onMenu }: QueueRowProps) {
  return (
    <li className={`group relative flex items-center gap-2.5 rounded-md px-2 py-2 transition ${isCurrent ? 'bg-zinc-800/50' : 'hover:bg-zinc-800/30'}`}>
      {isCurrent ? (
        <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-cyan-400" aria-hidden="true" />
      ) : null}

      <span className="w-5 shrink-0 text-right font-mono text-[10px] text-zinc-600">{String(index + 1).padStart(2, '0')}</span>

      <button
        type="button"
        onClick={() => music.playIndex(index)}
        aria-label={`Play ${item.song.title}`}
        className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-cyan-400"
      >
        {item.song.thumbnailUrl !== null ? (
          <img
            src={item.song.thumbnailUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="size-10 shrink-0 rounded-md border border-zinc-800 object-cover"
          />
        ) : (
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-zinc-800/60 text-zinc-600">
            <Music2 size={14} aria-hidden="true" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[13px] ${isCurrent ? 'font-medium text-zinc-100' : 'text-zinc-300'}`}>
            {item.song.title}
          </span>
          <span className="block truncate text-[11px] text-zinc-500">{item.song.artist}</span>
        </span>
      </button>

      {isCurrent ? (
        <span className="shrink-0" aria-label="Now playing">
          <Equalizer playing bars={4} className="h-3" barClassName="bg-cyan-400" />
        </span>
      ) : null}

      <span className="shrink-0 font-mono text-[10px] text-zinc-600">
        {item.song.duration ? formatTime(item.song.duration) : '—'}
      </span>

      <div className="relative shrink-0">
        <button
          type="button"
          onClick={onMenu}
          aria-label={`Options for ${item.song.title}`}
          aria-expanded={menuOpen}
          className="grid size-7 place-items-center rounded-md text-zinc-600 transition hover:bg-zinc-700/40 hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-cyan-400"
        >
          <MoreVertical size={14} />
        </button>

        {menuOpen ? (
          <>
            <div className="fixed inset-0 z-10" onClick={onMenu} aria-hidden="true" />
            <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-zinc-800 bg-zinc-900 p-1 shadow-xl">
              <button
                type="button"
                onClick={() => music.playIndex(index)}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] text-zinc-300 transition hover:bg-zinc-800/60 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-cyan-400"
              >
                <Play size={12} aria-hidden="true" /> Play
              </button>
              <button
                type="button"
                onClick={() => music.playSongNext(item.song)}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] text-zinc-300 transition hover:bg-zinc-800/60 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-cyan-400"
              >
                <ListMusic size={12} aria-hidden="true" /> Play next
              </button>
              <button
                type="button"
                onClick={() => music.removeFromQueue(item.key)}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] text-red-400 transition hover:bg-red-400/10 focus-visible:outline-2 focus-visible:outline-red-400"
              >
                <Trash2 size={12} aria-hidden="true" /> Remove
              </button>
            </div>
          </>
        ) : null}
      </div>
    </li>
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
  const [menuKey, setMenuKey] = useState<string | null>(null)
  const queueRef = useRef<HTMLElement | null>(null)

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
    if (!open) setMenuKey(null)
  }, [open])

  const goToQueue = () => {
    queueRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  const panelMotion = isMobile
    ? { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' } }
    : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 8 } }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="full-player"
          initial={panelMotion.initial}
          animate={panelMotion.animate}
          exit={panelMotion.exit}
          transition={isMobile ? { type: 'spring', damping: 32, stiffness: 320 } : { type: 'tween', duration: 0.3, ease: 'easeOut' }}
          className="fixed inset-0 z-[90] flex flex-col bg-zinc-950 text-zinc-100"
          role="dialog"
          aria-modal="true"
          aria-label="Music player"
        >
          {/* header */}
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800/80 px-4 sm:px-6">
            <div className="flex items-center gap-2.5">
              <AudioLines size={15} className="text-cyan-400" aria-hidden="true" />
              <span className="font-mono text-[11px] uppercase tracking-[0.32em] text-zinc-400">TripRoom / Music</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="hidden items-center gap-2 sm:flex">
                <span className={`size-1.5 rounded-full ${state.isPlaying ? 'bg-cyan-400' : 'bg-zinc-600'}`} aria-hidden="true" />
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                  {state.loading ? 'loading' : state.isPlaying ? 'playing' : 'paused'}
                </span>
              </span>
              <button
                type="button"
                onClick={music.closeFullPlayer}
                aria-label="Close music player"
                className="grid size-9 place-items-center rounded-md text-zinc-400 transition hover:bg-zinc-800/60 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-cyan-400"
              >
                <X size={16} />
              </button>
            </div>
          </header>

          {/* content */}
          <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_320px] lg:grid-cols-[220px_minmax(0,1fr)_340px]">
            <aside className="hidden min-h-0 flex-col overflow-y-auto border-r border-zinc-800/80 lg:flex">
              <LeftRail music={music} onGoQueue={goToQueue} />
            </aside>

            <main className="relative min-h-0 overflow-y-auto">
              <MainPlayer music={music} />
              {/* queue on mobile/tablet single column */}
              <div className="border-t border-zinc-800/80 md:hidden">
                <QueuePanel music={music} menuKey={menuKey} onMenuKey={setMenuKey} />
              </div>
            </main>

            <aside
              ref={queueRef}
              className="hidden min-h-0 flex-col overflow-y-auto border-l border-zinc-800/80 md:flex"
            >
              <QueuePanel music={music} menuKey={menuKey} onMenuKey={setMenuKey} />
            </aside>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
