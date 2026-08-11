import { motion } from 'framer-motion'
import { MapPin, Route } from 'lucide-react'
import { useIsMobile } from '../../../hooks/useMediaQuery'

interface GroupSummaryCardProps {
  tripName: string
  origin: string
  destination: string
  routeKm: number
  live: number
  delayed: number
  offline: number
}

export default function GroupSummaryCard({ tripName, origin, destination, routeKm, live, delayed, offline }: GroupSummaryCardProps) {
  const isMobile = useIsMobile()

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="pointer-events-auto w-[min(92vw,320px)] rounded-2xl border border-white/12 bg-night/80 px-3.5 py-3 backdrop-blur-xl"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-bold text-bone">{tripName}</p>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-mist/70">
            <MapPin size={11} className="shrink-0 text-ember" aria-hidden="true" />
            <span className="truncate">{origin} → {destination}</span>
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/12 bg-charcoal/80 px-2.5 py-1 text-[10px] font-semibold text-bone/85">
          <Route size={11} className="text-sunset" aria-hidden="true" />
          {routeKm} km
        </span>
      </div>
      <div className="mt-2.5 flex items-center gap-3 border-t border-white/8 pt-2.5 text-[10px] font-medium">
        <span className="inline-flex items-center gap-1 text-live">
          <span className="size-1.5 rounded-full bg-live" aria-hidden="true" />
          {live} live
        </span>
        {delayed > 0 ? (
          <span className="inline-flex items-center gap-1 text-sunset">
            <span className="size-1.5 rounded-full bg-sunset" aria-hidden="true" />
            {delayed} delayed
          </span>
        ) : null}
        {offline > 0 ? (
          <span className="inline-flex items-center gap-1 text-mist/50">
            <span className="size-1.5 rounded-full bg-mist/50" aria-hidden="true" />
            {offline} offline
          </span>
        ) : null}
        {isMobile ? null : (
          <span className="ml-auto text-[9px] uppercase tracking-[0.16em] text-mist/40">Live Map</span>
        )}
      </div>
    </motion.div>
  )
}
