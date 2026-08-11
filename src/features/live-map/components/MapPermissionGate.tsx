import { motion } from 'framer-motion'
import { AlertTriangle, MapPin, Navigation, Pause, Play, Satellite } from 'lucide-react'
import type { GpsMode } from '../types'

interface MapPermissionGateProps {
  mode: GpsMode
  error: string | null
  accuracy: number | null
  onStart: () => void
  onPause: () => void
}

export default function MapPermissionGate({ mode, error, accuracy, onStart, onPause }: MapPermissionGateProps) {
  if (mode === 'active') {
    const weak = accuracy !== null && accuracy > 300
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={`pointer-events-auto flex items-center gap-2 rounded-full border px-3.5 py-2 backdrop-blur-xl ${
          weak ? 'border-sunset/40 bg-sunset/10' : 'border-live/40 bg-live/10'
        }`}
      >
        <span className={`size-2 rounded-full ${weak ? 'animate-pulse bg-sunset' : 'animate-pulse bg-live'}`} aria-hidden="true" />
        <span className={`text-[11px] font-medium ${weak ? 'text-sunset' : 'text-live'}`}>
          {weak ? 'Poor signal · approximating' : `Sharing location · ${accuracy !== null ? `±${Math.round(accuracy)}m` : 'live'}`}
        </span>
        <button
          type="button"
          onClick={onPause}
          className="ml-1 rounded-full bg-white/10 p-1.5 text-bone/80 transition hover:bg-white/20"
          aria-label="Pause location sharing"
        >
          <Pause size={12} aria-hidden="true" />
        </button>
      </motion.div>
    )
  }

  if (mode === 'paused') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="pointer-events-auto flex items-center gap-2 rounded-full border border-mist/25 bg-night/85 px-3.5 py-2 backdrop-blur-xl"
      >
        <Pause size={13} className="text-mist" aria-hidden="true" />
        <span className="text-[11px] font-medium text-mist/80">Location sharing is paused</span>
        <button
          type="button"
          onClick={onStart}
          className="ml-1 rounded-full bg-live/15 px-2.5 py-1 text-[10px] font-semibold text-live transition hover:bg-live/25"
        >
          Resume
        </button>
      </motion.div>
    )
  }

  const denied = mode === 'denied'
  const errored = mode === 'error' || mode === 'unsupported' || mode === 'starting'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`pointer-events-auto w-[min(92vw,340px)] rounded-2xl border p-4 backdrop-blur-xl ${
        denied || errored ? 'border-road/35 bg-night/85' : 'border-white/12 bg-night/85'
      }`}
    >
      {denied || errored ? (
        <>
          <div className="flex items-start gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-road/15">
              <AlertTriangle size={15} className="text-road" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="font-display text-sm font-bold text-bone">
                {denied ? 'Location access denied' : mode === 'unsupported' ? 'Location unsupported' : 'GPS unavailable'}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-mist/70">{error ?? 'Could not acquire your position.'}</p>
            </div>
          </div>
          {mode !== 'unsupported' ? (
            <button
              type="button"
              onClick={onStart}
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-ember px-3 py-2 text-xs font-semibold text-night transition hover:brightness-110"
            >
              <Play size={12} aria-hidden="true" /> Try again
            </button>
          ) : null}
        </>
      ) : (
        <>
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-live/15">
              <Navigation size={16} className="text-live" aria-hidden="true" />
            </span>
            <div>
              <p className="font-display text-sm font-bold text-bone">Share your location</p>
              <p className="text-[11px] text-mist/70">Riders can see your live position on the map.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onStart}
            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-ember px-3 py-2.5 text-xs font-semibold text-night transition hover:brightness-110"
          >
            <MapPin size={13} aria-hidden="true" /> Start Location Sharing
          </button>
          <p className="mt-2 flex items-center gap-1.5 text-[10px] text-mist/50">
            <Satellite size={10} aria-hidden="true" />
            Only shared while this screen is active. Stop anytime.
          </p>
        </>
      )}
    </motion.div>
  )
}
