import { motion } from 'framer-motion'

interface OnlineIndicatorProps {
  count: number
  className?: string
}

export default function OnlineIndicator({ count, className }: OnlineIndicatorProps) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border border-white/10 bg-night/40 px-3 py-1.5 backdrop-blur-md ${className ?? ''}`}
    >
      <span className="rt-live-dot size-2 rounded-full bg-live" aria-hidden="true" />
      <motion.span
        key={count}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-[11px] font-semibold tracking-wide text-bone/85"
      >
        {count} {count === 1 ? 'rider' : 'riders'} online
      </motion.span>
    </div>
  )
}
