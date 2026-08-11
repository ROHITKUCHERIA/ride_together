import { motion } from 'framer-motion'
import type { TripInfo } from '../types'

interface TripStatsProps {
  trip: TripInfo
}

export default function TripStats({ trip }: TripStatsProps) {
  const stats = [
    { label: 'KM', value: trip.distanceKm.toLocaleString('en-IN') },
    { label: 'RIDERS', value: String(trip.riders.length) },
    { label: 'DAYS', value: String(trip.days) },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 1.0, ease: 'easeOut' }}
      className="flex flex-col items-center gap-4"
    >
      <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.34em] text-bone/70">
        <span className="text-mist/80">{trip.origin}</span>
        <span className="relative flex w-10 items-center" aria-hidden="true">
          <span className="h-px flex-1 bg-white/25" />
          <span className="text-ember">→</span>
        </span>
        <span className="text-bone">{trip.destination}</span>
      </div>

      <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.28em] text-mist/75">
        {stats.map((s, i) => (
          <span key={s.label} className="flex items-center gap-3">
            {i > 0 ? <span className="size-0.5 rounded-full bg-white/25" aria-hidden="true" /> : null}
            <span>
              <span className="text-bone/90">{s.value}</span> {s.label}
            </span>
          </span>
        ))}
      </div>
    </motion.div>
  )
}
