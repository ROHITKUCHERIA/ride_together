import { useState } from 'react'
import { Flag, Navigation, Trash2, Users } from 'lucide-react'
import Button from '../../../components/ui/Button'
import DestinationSearch from './DestinationSearch'
import { useGroupNavigation } from '../hooks/useGroupNavigation'
import { formatEta } from '../utils/format'
import type { GroupDestination, GroupNavigationStatus } from '../types'

interface GroupNavPanelProps {
  tripId?: string
  /** The signed-in user owns the trip → may set/clear the shared destination. */
  isHost: boolean
  /** The signed-in user id (labels the rider chip as "You"). */
  meUserId?: string
  /** Planned trip destination — when present, this is the ONLY navigable target. */
  tripDestination?: GroupDestination | null
  /** Trip navigation active? (hides the separate Navigate screen entry). */
  tripNavigating?: boolean
  onStartTripNavigation?: () => void
  onStopTripNavigation?: () => void
  /** Open the navigation overlay (rider flow). */
  onOpenNavigation: () => void
  /** Start navigating to the trip's shared destination right away. */
  onNavigateToShared: (destination: GroupDestination) => void
}

const STATUS_META: Record<GroupNavigationStatus, { label: string; color: string }> = {
  navigating: { label: 'riding', color: '#3ddc84' },
  off_route: { label: 'off route', color: '#ffb14d' },
  rerouting: { label: 'rerouting', color: '#4dc4ff' },
  arrived: { label: 'arrived', color: '#c084fc' },
  gps_lost: { label: 'signal lost', color: '#ff6b2c' },
  offline: { label: 'offline', color: '#94949e' },
  idle: { label: 'idle', color: '#94949e' },
}

/**
 * Shared trip destination + group navigation strip. The Host can set, change
 * or clear the destination; every rider sees the target, the group ETA (latest
 * reached ETA among actively-navigating riders) and a compact per-rider status
 * summary. Data comes from the realtime mirror — never from a refetch.
 */
export default function GroupNavPanel({
  tripId,
  isHost,
  meUserId,
  tripDestination,
  tripNavigating,
  onStartTripNavigation,
  onStopTripNavigation,
  onOpenNavigation,
  onNavigateToShared,
}: GroupNavPanelProps) {
  const group = useGroupNavigation(tripId)
  const [setting, setSetting] = useState(false)

  // Trip-bound mode: the planned route is the only destination.
  const isTripMode = tripDestination !== undefined
  const destination = isTripMode ? (tripDestination ?? null) : group.destination

  return (
    <div className="pointer-events-auto min-w-0 rounded-2xl border border-white/12 bg-night/85 p-3.5 backdrop-blur-2xl">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-mist/50">
          <Flag size={11} aria-hidden="true" />
          Ride destination
        </p>
        {group.groupEta !== null ? (
          <span className="flex items-center gap-1 rounded-full border border-live/25 bg-live/10 px-2 py-0.5 text-[10px] font-semibold text-live">
            <Users size={10} aria-hidden="true" />
            group ETA {formatEta(group.groupEta)}
          </span>
        ) : null}
      </div>

      {destination ? (
        <div className="mt-2">
          <p className="truncate font-display text-sm font-bold text-bone">
            {destination.name ?? `${destination.latitude.toFixed(5)}, ${destination.longitude.toFixed(5)}`}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {group.riders.length === 0 ? (
              <span className="text-[11px] text-mist/60">No one is navigating yet.</span>
            ) : (
              group.riders.map((r) => {
                const meta = STATUS_META[r.status] ?? STATUS_META.idle
                return (
                  <span
                    key={r.userId}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2 py-0.5"
                    title={meta.label}
                  >
<span
                    className="size-1.5 rounded-full"
                    style={{ background: meta.color }}
                    aria-hidden="true"
                  />
                  <span className="max-w-20 truncate text-[10px] text-mist/80">
                    {meUserId && r.userId === meUserId ? 'You' : r.userId.slice(0, 4)}
                  </span>
                  </span>
                )
              })
            )}
          </div>
        </div>
      ) : (
        <p className="mt-2 text-[12px] leading-snug text-mist/70">
          {isHost
            ? 'Set a shared destination so the whole group navigates together.'
            : 'The Host has not set a shared destination yet.'}
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        {isTripMode ? (
          destination ? (
            tripNavigating && onStopTripNavigation ? (
              <Button size="sm" block variant="danger" onClick={onStopTripNavigation}>
                Stop Navigation
              </Button>
            ) : (
              <Button size="sm" block onClick={() => onStartTripNavigation?.()}>
                <Navigation size={13} aria-hidden="true" /> Start Trip Navigation
              </Button>
            )
          ) : (
            <p className="text-[11px] text-mist/60">Trip route has no destination yet.</p>
          )
        ) : destination ? (
          <Button size="sm" block onClick={() => onNavigateToShared(destination)}>
            <Navigation size={13} aria-hidden="true" /> Navigate
          </Button>
        ) : (
          <Button size="sm" block onClick={onOpenNavigation}>
            <Navigation size={13} aria-hidden="true" /> Navigate
          </Button>
        )}
        {!isTripMode && isHost ? (
          <button
            type="button"
            onClick={() => setting ? setSetting(false) : destination ? void group.clearDestination() : setSetting(true)}
            aria-label={destination ? 'Clear shared destination' : 'Set shared destination'}
            title={destination ? 'Clear shared destination' : 'Set shared destination'}
            className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/12 bg-white/5 text-mist transition hover:bg-white/10 hover:text-bone focus-visible:outline-2 focus-visible:outline-ember"
          >
            {destination ? <Trash2 size={14} aria-hidden="true" /> : <Flag size={14} aria-hidden="true" />}
          </button>
        ) : null}
      </div>

      {!isTripMode && isHost && setting && !destination ? (
        <div className="mt-2.5">
          <DestinationSearch
            onSelect={(d) => {
              setSetting(false)
              void group.setDestination({ latitude: d.latitude, longitude: d.longitude, name: d.name })
            }}
          />
        </div>
      ) : null}
    </div>
  )
}