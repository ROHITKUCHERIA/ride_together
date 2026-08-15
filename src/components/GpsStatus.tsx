import { motion } from 'framer-motion'
import { LocateFixed } from 'lucide-react'
import type { GpsState } from '../types'
import { useIsMobile } from '../hooks/useMediaQuery'

interface GpsStatusProps {
  state: GpsState
  onEnable: () => void
}

export default function GpsStatus({ state, onEnable }: GpsStatusProps) {
  const isMobile = useIsMobile()
  if (state === 'tracking') return null

  if (isMobile) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed left-1/2 top-[10.5rem] z-[55] flex w-max max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-ember/40 bg-charcoal/90 px-4 py-2.5 shadow-lg backdrop-blur-xl"
      >
        <LocateFixed size={15} className="shrink-0 text-ember" aria-hidden="true" />
        <p className="truncate text-xs font-medium text-bone">Location unavailable</p>
        <button
          type="button"
          onClick={onEnable}
          className="shrink-0 rounded-lg bg-ember px-2.5 py-1 text-[11px] font-semibold text-night transition hover:bg-sunset focus-visible:outline-2 focus-visible:outline-ember"
        >
          Enable Location
        </button>
      </motion.div>
    )
  }

  return (
    <div className="pointer-events-none fixed right-5 top-[8.5rem] z-40">
      <div className="inline-flex items-center gap-2 rounded-full border border-ember/40 bg-night/60 px-3.5 py-2 backdrop-blur-md">
        <LocateFixed size={13} className="text-ember" aria-hidden="true" />
        <span className="text-[11px] font-medium text-bone/80">Location unavailable</span>
        <button
          type="button"
          onClick={onEnable}
          className="pointer-events-auto ml-1 rounded-full bg-ember px-2.5 py-0.5 text-[10px] font-semibold text-night transition hover:bg-sunset focus-visible:outline-2 focus-visible:outline-ember"
        >
          Enable
        </button>
      </div>
    </div>
  )
}
