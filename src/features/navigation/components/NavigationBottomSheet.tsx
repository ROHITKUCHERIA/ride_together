import { motion } from 'framer-motion'
import { AlertTriangle, ArrowRight, Crosshair, Flag, Loader2, MapPin, RefreshCw, Satellite } from 'lucide-react'
import Button from '../../../components/ui/Button'
import DestinationSearch from './DestinationSearch'
import ManeuverIcon from './ManeuverIcon'
import { formatDistance, formatDuration, formatEta } from '../utils/format'
import { maneuverRoadLine, maneuverTitle } from '../utils/maneuver'
import type { GroupDestination, NavigationDestination, NavigationProgress, NavigationStatus, RouteResult } from '../types'

interface NavigationBottomSheetProps {
  status: NavigationStatus
  destination: NavigationDestination | null
  route: RouteResult | null
  error: string | null
  remainingDistanceMeters: number | null
  remainingDurationSeconds: number | null
  progress: NavigationProgress | null
  /** Shared trip destination (Host-set); offered as a one-tap target. */
  groupDestination?: GroupDestination | null
  onUseGroupDestination?: (destination: GroupDestination) => void
  onSelectDestination: (destination: NavigationDestination) => void
  onClearDestination: () => void
  onStart: () => void
  onStop: () => void
  onReroute: () => void
}

export default function NavigationBottomSheet({
  status,
  destination,
  route,
  error,
  remainingDistanceMeters,
  remainingDurationSeconds,
  progress,
  groupDestination,
  onUseGroupDestination,
  onSelectDestination,
  onClearDestination,
  onStart,
  onStop,
  onReroute,
}: NavigationBottomSheetProps) {
  const searching = status === 'idle'
  const picking = searching || status === 'locating'

  return (
    <motion.div
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="pointer-events-auto mx-auto w-full max-w-md rounded-t-2xl border border-white/12 bg-charcoal/95 shadow-[0_-12px_40px_rgba(0,0,0,0.5)] backdrop-blur-2xl sm:rounded-2xl"
    >
      <div className="mx-auto my-2 h-1 w-10 rounded-full bg-white/15" aria-hidden="true" />

      {status === 'locating' ? (
        <div className="flex items-center gap-3 px-5 pb-5 pt-2">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ember/15">
            <Loader2 size={17} className="animate-spin text-ember" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="font-display text-sm font-bold text-bone">Getting your location…</p>
            <p className="text-[11px] text-mist/70">Allow location access to find your route.</p>
          </div>
          <Satellite size={16} className="ml-auto shrink-0 text-mist/40" aria-hidden="true" />
        </div>
      ) : null}

      {status === 'route_loading' ? (
        <div className="flex items-center gap-3 px-5 pb-5 pt-2">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ember/15">
            <Loader2 size={17} className="animate-spin text-ember" aria-hidden="true" />
          </span>
          <div>
            <p className="font-display text-sm font-bold text-bone">Calculating route…</p>
            <p className="text-[11px] text-mist/70">{destination?.name ?? 'to your destination'}</p>
          </div>
        </div>
      ) : null}

      {searching ? (
        <div className="px-4 pb-5 pt-1">
          {groupDestination && onUseGroupDestination ? (
            <button
              type="button"
              onClick={() => onUseGroupDestination(groupDestination)}
              className="rt-tap mb-2.5 flex w-full items-center gap-2.5 rounded-2xl border border-live/25 bg-live/10 px-3 py-2.5 text-left transition hover:bg-live/15 focus-visible:outline-2 focus-visible:outline-ember"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-live/15">
                <Flag size={15} className="text-live" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-[13px] font-bold text-bone">Ride to shared destination</span>
                <span className="block truncate text-[11px] text-live/80">
                  {groupDestination.name ??
                    `${groupDestination.latitude.toFixed(5)}, ${groupDestination.longitude.toFixed(5)}`}
                </span>
              </span>
              <ArrowRight size={16} className="shrink-0 text-live/70" aria-hidden="true" />
            </button>
          ) : null}
          <p className="mb-2.5 px-1 text-[11px] font-medium uppercase tracking-[0.18em] text-mist/60">
            Pick a destination
          </p>
          <DestinationSearch onSelect={onSelectDestination} disabled={!picking} />
          <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-mist/50">
            <Crosshair size={12} aria-hidden="true" />
            or tap anywhere on the map to set it
          </p>
        </div>
      ) : null}

      {status === 'error' ? (
        <div className="px-5 pb-5 pt-1">
          <div className="flex items-start gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-road/15">
              <AlertTriangle size={14} className="text-road" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="font-display text-sm font-bold text-bone">Route unavailable</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-mist/80">{error}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            {destination ? (
              <Button variant="danger" size="sm" block onClick={onReroute}>
                <RefreshCw size={14} aria-hidden="true" /> Try again
              </Button>
            ) : null}
            <Button variant="outline" size="sm" block onClick={onClearDestination}>
              Change destination
            </Button>
          </div>
        </div>
      ) : null}

      {(status === 'ready' || status === 'navigating') && destination ? (
        <div className="px-5 pb-5 pt-1">
          <div className="flex items-start gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-road/15">
              <Flag size={15} className="text-road" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-mist/60">Destination</p>
              <p className="truncate font-display text-base font-bold text-bone">
                {destination.name ?? `Pinned location · ${destination.latitude.toFixed(5)}, ${destination.longitude.toFixed(5)}`}
              </p>
            </div>
          </div>

          {status === 'ready' && route ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Stat label="Distance" value={formatDistance(route.distanceMeters)} />
              <Stat label="Est. time" value={formatDuration(route.durationSeconds)} />
            </div>
          ) : null}

          {status === 'navigating' ? (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Stat label="Remaining" value={formatDistance(remainingDistanceMeters)} />
              <Stat label="ETA" value={formatEta(progress?.etaEpochMs ?? null)} />
              <Stat label="Est. time" value={formatDuration(remainingDurationSeconds)} />
            </div>
          ) : null}

          {/* next maneuver — secondary, always below the primary header */}
          {status === 'navigating' && progress?.nextInstruction ? (
            <div
              className="mt-2.5 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
              aria-label="Next maneuver"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/5 text-mist/80">
                <ManeuverIcon
                  type={progress.nextInstruction.type}
                  modifier={progress.nextInstruction.modifier}
                  exitNumber={progress.nextInstruction.exitNumber}
                  size={17}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-bone/90">
                  {maneuverTitle(progress.nextInstruction.type, progress.nextInstruction.modifier, progress.nextInstruction.exitNumber)}
                  {maneuverRoadLine(progress.nextInstruction) ? (
                    <span className="text-mist/70"> onto {maneuverRoadLine(progress.nextInstruction)}</span>
                  ) : null}
                </span>
                <span className="block text-[10px] uppercase tracking-[0.16em] text-mist/50">Next</span>
              </span>
              {progress.distanceToNextInstructionMeters !== null ? (
                <span className="shrink-0 text-[11px] font-semibold text-mist/70">
                  {formatDistance(progress.distanceToNextInstructionMeters)}
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="mt-3.5 flex items-center gap-2">
            {status === 'ready' ? (
              <Button block onClick={onStart}>
                <ArrowRight size={15} aria-hidden="true" /> Start Navigation
              </Button>
            ) : (
              <Button block onClick={onStop} variant="danger">
                Stop Navigation
              </Button>
            )}
            <button
              type="button"
              onClick={onClearDestination}
              aria-label="Change destination"
              className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/12 bg-white/5 text-mist transition hover:bg-white/10 hover:text-bone focus-visible:outline-2 focus-visible:outline-ember"
            >
              <MapPin size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}

      {status === 'completed' && destination ? (
        <div className="flex items-center gap-3 px-5 pb-5 pt-2">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-live/15 text-lg">
            🎉
          </span>
          <div className="min-w-0">
            <p className="font-display text-sm font-bold text-bone">You have arrived</p>
            <p className="truncate text-[11px] text-mist/70">
              {destination.name ?? `${destination.latitude.toFixed(5)}, ${destination.longitude.toFixed(5)}`}
            </p>
          </div>
          <Button className="ml-auto shrink-0" size="sm" onClick={onClearDestination}>
            Done
          </Button>
        </div>
      ) : null}
    </motion.div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
      <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-mist/60">{label}</p>
      <p className="mt-0.5 font-display text-base font-bold text-bone">{value}</p>
    </div>
  )
}