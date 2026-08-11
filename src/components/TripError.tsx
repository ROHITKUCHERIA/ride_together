import { motion } from 'framer-motion'
import { Bike, RefreshCw } from 'lucide-react'

interface TripErrorProps {
  onRetry: () => void
}

export default function TripError({ onRetry }: TripErrorProps) {
  return (
    <div className="relative flex min-h-dvh w-full flex-col items-center justify-center overflow-hidden bg-night px-6 text-center text-bone">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(70% 50% at 50% 100%, rgba(224,36,47,0.12), transparent 70%), radial-gradient(60% 45% at 50% 0%, rgba(59,35,70,0.22), transparent 70%)',
        }}
        aria-hidden="true"
      />
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative flex flex-col items-center"
      >
        <div className="mb-6 grid size-16 place-items-center rounded-2xl border border-white/10 bg-gradient-to-br from-road/25 to-transparent">
          <Bike size={30} className="text-road" strokeWidth={1.8} />
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Unable to load this ride.</h1>
        <p className="mt-3 max-w-xs text-sm text-mist/70">
          This trip doesn't exist or has already rolled out of the garage.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-7 inline-flex items-center gap-2 rounded-full bg-bone px-5 py-2.5 text-sm font-semibold text-night transition hover:scale-[1.04] hover:bg-white focus-visible:outline-2 focus-visible:outline-ember"
        >
          <RefreshCw size={15} aria-hidden="true" />
          Try Again
        </button>
      </motion.div>
    </div>
  )
}
