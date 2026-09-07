import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, SatelliteDish } from 'lucide-react'

interface NavigationBannerProps {
  offRoute: boolean
  rerouting: boolean
  routeUpdated: boolean
  gpsLost: boolean
  /** Transient navigation notice (e.g. reroute failure). */
  notice: string | null
  onReroute: () => void
}

/**
 * Single status pill shown while navigating: off-route warning (+ manual
 * reroute), active reroute spinner, "route updated" confirmation, GPS-loss
 * warning, and transient notices. One banner at a time, ordered by priority.
 */
export default function NavigationBanner({
  offRoute,
  rerouting,
  routeUpdated,
  gpsLost,
  notice,
  onReroute,
}: NavigationBannerProps) {
  let content = null

  if (rerouting) {
    content = (
      <>
        <Loader2 size={14} className="shrink-0 animate-spin text-live" aria-hidden="true" />
        <span className="text-[11px] font-semibold text-bone">Recalculating route…</span>
      </>
    )
  } else if (routeUpdated) {
    content = (
      <>
        <CheckCircle2 size={14} className="shrink-0 text-live" aria-hidden="true" />
        <span className="text-[11px] font-semibold text-live">Route updated</span>
      </>
    )
  } else if (gpsLost) {
    content = (
      <>
        <SatelliteDish size={14} className="shrink-0 animate-pulse text-sunset" aria-hidden="true" />
        <span className="text-[11px] font-semibold text-sunset">GPS signal lost</span>
      </>
    )
  } else if (notice) {
    content = (
      <>
        <AlertTriangle size={14} className="shrink-0 text-road" aria-hidden="true" />
        <span className="text-[11px] font-semibold text-road">{notice}</span>
        <button
          type="button"
          onClick={onReroute}
          className="inline-flex items-center gap-1 rounded-full bg-road/20 px-2.5 py-1 text-[11px] font-semibold text-road transition hover:bg-road/30 focus-visible:outline-2 focus-visible:outline-road"
        >
          <RefreshCw size={11} aria-hidden="true" /> Retry
        </button>
      </>
    )
  } else if (offRoute) {
    content = (
      <>
        <AlertTriangle size={14} className="shrink-0 animate-pulse text-road" aria-hidden="true" />
        <span className="text-[11px] font-semibold text-road">You're off route — rerouting automatically</span>
        <button
          type="button"
          onClick={onReroute}
          aria-label="Reroute now"
          className="inline-flex items-center gap-1 rounded-full bg-road/20 px-2.5 py-1 text-[11px] font-semibold text-road transition hover:bg-road/30 focus-visible:outline-2 focus-visible:outline-road"
        >
          <RefreshCw size={11} aria-hidden="true" /> Reroute
        </button>
      </>
    )
  }

  if (content === null) return null

  const tone =
    rerouting || routeUpdated || gpsLost
      ? 'border-white/12 bg-night/85'
      : 'border-road/40 bg-night/85'

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-x-0 top-[calc(max(env(safe-area-inset-top,0px),0.75rem)+3.5rem)] z-[6] flex justify-center px-4"
    >
      <div
        className={`pointer-events-auto flex items-center gap-2 rounded-full border py-1.5 pl-3.5 pr-1.5 shadow-lg backdrop-blur-xl ${tone}`}
      >
        {content}
      </div>
    </div>
  )
}