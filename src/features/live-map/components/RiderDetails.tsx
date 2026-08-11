import { Crosshair, Gauge, Navigation } from 'lucide-react'
import type { RiderLocation, RiderPresence } from '../types'
import { PRESENCE_META } from './presenceMeta'

export interface RiderDetailsProps {
  rider: RiderLocation
}

export function PresenceChip({ presence }: { presence: RiderPresence }) {
  const meta = PRESENCE_META[presence]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border border-white/10 bg-charcoal/80 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] ${meta.text}`}>
      <span className={`size-1.5 rounded-full ${meta.dot} ${presence === 'live' ? 'animate-pulse' : ''}`} aria-hidden="true" />
      {meta.label}
    </span>
  )
}

export function RiderDetails({ rider }: RiderDetailsProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="rounded-xl border border-white/8 bg-charcoal/70 px-2.5 py-2">
        <p className="flex items-center gap-1 text-[9px] uppercase tracking-[0.12em] text-mist/55">
          <Gauge size={10} aria-hidden="true" /> Speed
        </p>
        <p className="mt-0.5 font-display text-base font-bold text-bone">
          {rider.speed != null ? rider.speed : '—'}
          <span className="ml-1 text-[9px] font-medium text-mist/50">km/h</span>
        </p>
      </div>
      <div className="rounded-xl border border-white/8 bg-charcoal/70 px-2.5 py-2">
        <p className="flex items-center gap-1 text-[9px] uppercase tracking-[0.12em] text-mist/55">
          <Navigation size={10} aria-hidden="true" /> Heading
        </p>
        <p className="mt-0.5 font-display text-base font-bold text-bone">
          {rider.heading != null ? `${Math.round(rider.heading)}°` : '—'}
        </p>
      </div>
      <div className="rounded-xl border border-white/8 bg-charcoal/70 px-2.5 py-2">
        <p className="flex items-center gap-1 text-[9px] uppercase tracking-[0.12em] text-mist/55">
          <Crosshair size={10} aria-hidden="true" /> Accuracy
        </p>
        <p className="mt-0.5 font-display text-base font-bold text-bone">
          {rider.accuracy != null ? `±${rider.accuracy}m` : '—'}
        </p>
      </div>
    </div>
  )
}
