import { motion } from 'framer-motion'

interface OnlineIndicatorProps {
  count: number
  className?: string
  /** Icon-and-count-only pill for cramped mobile headers. */
  compact?: boolean
}

export default function OnlineIndicator({ count, className, compact = false }: OnlineIndicatorProps) {
  return (
    <div
      className={`inline-flex h-8 items-center gap-2 rounded-full border border-white/10 bg-night/40 px-2.5 backdrop-blur-md ${className ?? ''}`}
    >
      <span className="rt-live-dot size-2 rounded-full bg-live" aria-hidden="true" />
      <motion.span
        key={count}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-[11px] font-semibold tabular-nums tracking-wide text-bone/85"
        aria-label={`${count} ${count === 1 ? 'rider' : 'riders'} online`}
      >
        {count}
        {compact ? null : <span className="ml-1 hidden sm:inline">{count === 1 ? 'rider' : 'riders'} online</span>}
      </motion.span>
    </div>
  )
}
