import { useRef, useState } from 'react'
import {
  Crown,
  Loader2,
  Music2,
  Pause,
  Play,
  RefreshCw,
  Radio,
  SkipForward,
  Users,
  X,
} from 'lucide-react'
import type { TripJamApi } from '../jam/useTripJam'
import { useMusicPlayer } from '../music/context'
import { formatTime } from '../music/playerState'
import Button from './ui/Button'

function formatDuration(seconds: number): string {
  return formatTime(seconds)
}

/**
 * The Trip Jam surface (Spotify-Jam-style synchronized listening). Rendered
 * inside the trip music drawer. The Host controls playback; participants follow
 * the authoritative server state without any manual refresh. The trip playlist
 * stays untouched — this only ends the synchronized session.
 */
export default function TripJamPanel({ jam }: { jam: TripJamApi }) {
  const music = useMusicPlayer()
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [dragPos, setDragPos] = useState<number | null>(null)

  const { ui, isHost, isParticipant } = jam
  const state = ui.jam

  const current = music.current
  const position = dragPos ?? music.state.currentTime
  const duration = music.state.duration > 0 ? music.state.duration : (current?.song.duration ?? 0)
  const pct = duration > 0 ? Math.min(100, Math.max(0, (position / duration) * 100)) : 0

  const connectionOk = ui.connection === 'connected'
  const hostOffline = state ? !state.hostOnline : false

  /* ---------------- phases ---------------- */

  if (ui.phase === 'loading') {
    return (
      <section className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4" aria-label="Trip Jam">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-accent/25 bg-accent/10 text-accent">
            <Radio size={16} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-accent">Trip Jam</p>
            <p className="truncate text-sm font-semibold text-bone">Synchronizing…</p>
          </div>
          <Loader2 size={16} className="shrink-0 animate-spin text-accent" aria-hidden="true" />
        </div>
      </section>
    )
  }

  if (ui.phase === 'deleted' || (ui.phase !== 'active' && !state)) {
    return (
      <section className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4" aria-label="Trip Jam">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/12 bg-white/5 text-accent">
            <Radio size={16} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-accent">Trip Jam</p>
            {ui.endedMessage ? (
              <>
                <p className="mt-1 text-sm font-medium text-bone">{ui.endedMessage}</p>
                <p className="mt-0.5 text-xs text-mist/70">Your trip music is still here.</p>
              </>
            ) : (
              <>
                <p className="mt-1 text-sm font-medium text-bone">Hear the same song, together</p>
                <p className="mt-0.5 text-xs text-mist/70">
                  Start a Jam and every rider on this trip follows the same playback in real time.
                </p>
              </>
            )}
          </div>
        </div>
        <Button
          variant="accent"
          block
          loading={ui.syncing}
          onClick={() => void jam.createJam()}
          className="mt-3"
        >
          <Radio size={15} aria-hidden="true" />
          {ui.endedMessage ? 'Start a new Jam' : 'Start a Jam'}
        </Button>
      </section>
    )
  }

  if (!state) return null

  /* ---------------- active jam ---------------- */

  const song = state.currentSong
  const inJam = isHost || isParticipant
  const needsTap = inJam && music.state.jamMode && music.state.isPlaying && music.state.needsPlayPrompt

  return (
    <section className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4" aria-label="Trip Jam">
      {/* header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Radio size={13} className="text-accent" aria-hidden="true" />
          <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-accent">Trip Jam</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-mist/60" aria-live="polite">
          {!connectionOk ? (
            <span className="flex items-center gap-1 text-sunset">
              <RefreshCw size={11} aria-hidden="true" />
              Reconnecting…
            </span>
          ) : music.state.loading ? (
            <span className="flex items-center gap-1">
              <RefreshCw size={11} className="animate-spin" aria-hidden="true" />
              Syncing…
            </span>
          ) : (
            <span className="flex items-center gap-1 text-live">
              <span className="size-1.5 rounded-full bg-live" aria-hidden="true" />
              Synced
            </span>
          )}
        </div>
      </div>

      {ui.notice ? (
        <p role="alert" className="mt-2 rounded-lg border border-road/35 bg-road/10 px-2.5 py-1.5 text-[11px] text-road">
          {ui.notice}
        </p>
      ) : null}
      {hostOffline ? (
        <p role="alert" className="mt-2 rounded-lg border border-road/35 bg-road/10 px-2.5 py-1.5 text-[11px] text-road">
          The Host is currently disconnected. Playback is paused until they return.
        </p>
      ) : null}

      {/* host badge */}
      <div className="mt-3 flex items-center gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent/15 text-[10px] font-bold text-accent">
          {state.hostName.slice(0, 1).toUpperCase()}
        </span>
        <p className="min-w-0 truncate text-sm font-semibold text-bone">{state.hostName}</p>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent">
          <Crown size={9} aria-hidden="true" />
          Host
        </span>
      </div>

      {/* current song */}
      <div className="mt-3 flex items-center gap-3">
        {song?.thumbnailUrl ? (
          <img
            src={song.thumbnailUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="size-14 shrink-0 rounded-xl object-cover ring-1 ring-white/10"
          />
        ) : (
          <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-white/5 text-mist/50 ring-1 ring-white/10">
            <Music2 size={18} aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-mist/50">Currently Playing</p>
          <p className="truncate font-display text-sm font-semibold text-bone">{song?.title ?? 'No song yet'}</p>
          <p className="truncate text-xs text-mist/70">{song?.channelTitle ?? '—'}</p>
        </div>
      </div>

      {/* progress + host transport */}
      <div className="mt-3">
        {isHost ? (
          <HostSeekBar
            value={position}
            max={duration || 1}
            onChange={(v) => setDragPos(v)}
            onCommit={(v) => void jam.seek(v)}
          />
        ) : (
          <div className="relative h-[3px] w-full overflow-hidden rounded-full bg-white/10" aria-hidden="true">
            <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
        )}
        <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] text-mist/60">
          <span>{formatDuration(position)}</span>
          <span>{formatDuration(duration)}</span>
        </div>
      </div>

      {needsTap ? (
        <button
          type="button"
          onClick={music.resumePlay}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2.5 text-xs font-semibold text-accent transition hover:bg-accent/15 focus-visible:outline-2 focus-visible:outline-accent"
        >
          <Play size={14} fill="currentColor" aria-hidden="true" />
          Tap to sync with Jam
        </button>
      ) : null}

      {isHost ? (
        <div className="mt-3 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => void jam.control(music.state.isPlaying ? 'pause' : 'play')}
            aria-label={music.state.isPlaying ? 'Pause the Jam' : 'Play the Jam'}
            className="grid size-12 place-items-center rounded-full border border-white/12 bg-white/5 text-bone transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-accent active:scale-95"
          >
            {music.state.isPlaying ? (
              <Pause size={17} fill="currentColor" aria-hidden="true" />
            ) : (
              <Play size={17} fill="currentColor" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            onClick={() => void jam.control('next')}
            aria-label="Next song in the Jam"
            className="grid size-11 place-items-center rounded-full border border-white/12 bg-white/5 text-bone transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-accent active:scale-95"
          >
            <SkipForward size={16} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <p className="mt-3 text-center text-[10px] text-mist/50">Host controls playback</p>
      )}

      {/* participants */}
      <div className="mt-4 border-t border-white/8 pt-3">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-mist/60">
          <Users size={11} aria-hidden="true" />
          {state.participants.length} {state.participants.length === 1 ? 'person' : 'people'} in this Jam
        </p>
        <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto pr-1">
          {state.participants.map((p) => (
            <li key={p.userId} className="flex items-center gap-2 text-xs">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-white/8 text-[9px] font-bold text-bone">
                {p.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 truncate text-bone/90">{p.name}</span>
              {p.userId === state.hostId ? (
                <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-accent">
                  <Crown size={8} aria-hidden="true" />
                  Host
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      {/* actions */}
      <div className="mt-4 flex items-center gap-2">
        {inJam ? (
          <Button
            variant="outline"
            block
            onClick={() => void jam.leave()}
            aria-label="Leave the Jam"
          >
            <X size={14} aria-hidden="true" />
            Leave Jam
          </Button>
        ) : (
          <Button variant="accent" block onClick={() => void jam.join()} aria-label="Join the Jam">
            <Radio size={14} aria-hidden="true" />
            Join Jam
          </Button>
        )}

        {isHost ? (
          confirmEnd ? (
            <div className="flex w-full flex-col gap-2 rounded-xl border border-road/35 bg-road/10 p-3">
              <p className="text-xs font-medium text-bone">End Jam?</p>
              <p className="text-[11px] leading-relaxed text-mist/70">
                This will remove all participants from the Jam and stop synchronized playback. The trip music stays.
              </p>
              <div className="flex items-center gap-2">
                <Button variant="ghost" block onClick={() => setConfirmEnd(false)}>
                  Cancel
                </Button>
                <Button variant="danger" block onClick={() => void jam.deleteJam()}>
                  End Jam
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="danger" onClick={() => setConfirmEnd(true)} aria-label="End the Jam">
              End Jam
            </Button>
          )
        ) : null}
      </div>
    </section>
  )
}

/** Host-only seek bar: live-drags locally and commits on release via the Jam. */
function HostSeekBar({
  value,
  max,
  onChange,
  onCommit,
}: {
  value: number
  max: number
  onChange: (v: number) => void
  onCommit: (v: number) => void
}) {
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
      aria-label="Seek the Jam playback"
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      className="group relative h-7 cursor-pointer touch-none"
      onPointerDown={(e) => {
        draggingRef.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        apply(e.clientX)
      }}
      onPointerMove={(e) => {
        if (draggingRef.current) apply(e.clientX)
      }}
      onPointerUp={(e) => {
        draggingRef.current = false
        const el = trackRef.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
        onCommit(ratio * max)
      }}
      onPointerCancel={() => {
        draggingRef.current = false
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') onCommit(Math.min(max, value + 5))
        if (e.key === 'ArrowLeft') onCommit(Math.max(0, value - 5))
      }}
    >
      <div className="absolute top-1/2 h-[3px] w-full -translate-y-1/2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <span
        aria-hidden="true"
        className="absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_0_3px_rgba(255,107,44,0.2)] transition-transform duration-150 group-hover:scale-125"
        style={{ left: `calc(${pct}% - 5px)` }}
      />
    </div>
  )
}
