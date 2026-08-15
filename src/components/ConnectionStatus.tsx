import { motion } from 'framer-motion'
import type { ConnectionState } from '../types'
import { useIsMobile } from '../hooks/useMediaQuery'

interface ConnectionStatusProps {
  state: ConnectionState
}

const STATE_META = {
  connecting: { dot: 'animate-pulse bg-sunset', text: 'Connecting…', border: 'border-sunset/40 bg-night/60' },
  connected: { dot: 'bg-live', text: 'Live', border: 'border-white/10 bg-night/40' },
  reconnecting: { dot: 'animate-pulse bg-sunset', text: 'Reconnecting…', border: 'border-sunset/40 bg-night/60' },
  offline: { dot: 'animate-pulse bg-road', text: 'Offline', border: 'border-road/40 bg-night/60' },
} as const

export default function ConnectionStatus({ state }: ConnectionStatusProps) {
  const isMobile = useIsMobile()
  const meta = STATE_META[state]
  const active = state !== 'connected'

  if (isMobile) {
    if (!active) return null
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed inset-x-3 z-[var(--z-sheet)] flex items-center gap-2 rounded-xl border border-sunset/40 bg-charcoal/90 px-4 py-2.5 backdrop-blur-xl"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 4rem)' }}
        role="status"
      >
        <span className="size-2 shrink-0 animate-pulse rounded-full bg-sunset" aria-hidden="true" />
        <p className="text-xs font-medium text-bone">
          {state === 'connecting' ? 'Connecting to the ride…' : state === 'offline' ? 'Connection lost' : 'Reconnecting…'}
        </p>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-mist/60">
          {state === 'connecting' ? 'Connecting...' : state === 'offline' ? 'Offline' : 'Reconnecting...'}
        </span>
      </motion.div>
    )
  }

  return (
    <div className="pointer-events-none fixed right-5 top-24 z-40">
      <div className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 backdrop-blur-md ${meta.border}`} role="status">
        <span className={`size-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
        <span className="text-[11px] font-medium tracking-wide text-bone/75">{meta.text}</span>
      </div>
    </div>
  )
}
