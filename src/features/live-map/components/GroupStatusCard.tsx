import { motion } from 'framer-motion'
import { Radio, UsersRound } from 'lucide-react'
import type { GroupHealth } from '../types'

const HEALTH_META: Record<GroupHealth, { label: string; dot: string; border: string; hint: string }> = {
  together: { label: 'GROUP TOGETHER', dot: 'bg-live', border: 'border-live/35', hint: 'Riders holding formation' },
  spreading: { label: 'GROUP SPREADING', dot: 'bg-sunset', border: 'border-sunset/35', hint: 'Gap is growing ahead' },
  split: { label: 'GROUP SPLIT', dot: 'bg-road', border: 'border-road/45', hint: 'A rider has dropped off' },
}

interface GroupStatusCardProps {
  health: GroupHealth
  activeCount: number
  totalCount: number
  nearestMeters: number | null
}

export default function GroupStatusCard({ health, activeCount, totalCount, nearestMeters }: GroupStatusCardProps) {
  const meta = HEALTH_META[health]
  const km = nearestMeters !== null ? (nearestMeters / 1000).toFixed(1) : null

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="pointer-events-auto w-[min(92vw,300px)] rounded-2xl border border-white/12 bg-night/80 p-3.5 backdrop-blur-xl"
    >
      <div className="flex items-center gap-2.5">
        <span className={`flex size-8 shrink-0 items-center justify-center rounded-full border ${meta.border} bg-charcoal/80`}>
          <UsersRound size={15} className={meta.dot.replace('bg-', 'text-')} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-bone">
            <span className={`size-1.5 rounded-full ${meta.dot} animate-pulse`} aria-hidden="true" />
            {meta.label}
          </p>
          <p className="truncate text-[11px] text-mist/70">{meta.hint}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-white/8 pt-2.5 text-[11px]">
        <span className="inline-flex items-center gap-1.5 text-bone/85">
          <Radio size={11} className="text-live" aria-hidden="true" />
          <span className="font-semibold">{activeCount}</span>
          <span className="text-mist/60">of {totalCount} riding</span>
        </span>
        <span className="text-mist/70">
          {km !== null ? (
            <>
              Nearest · <span className="font-semibold text-bone">{km} km</span>
            </>
          ) : (
            <span className="text-mist/50">Waiting for riders</span>
          )}
        </span>
      </div>
    </motion.div>
  )
}
