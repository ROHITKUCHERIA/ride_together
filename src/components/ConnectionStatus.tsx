import { motion } from 'framer-motion'
import type { ConnectionState } from '../types'
import { useIsMobile } from '../hooks/useMediaQuery'

interface ConnectionStatusProps {
  state: ConnectionState
}

export default function ConnectionStatus({ state }: ConnectionStatusProps) {
  const isMobile = useIsMobile()
  const reconnecting = state === 'reconnecting'

  if (isMobile) {
    if (!reconnecting) return null
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed inset-x-3 top-14 z-50 flex items-center gap-2 rounded-xl border border-sunset/40 bg-charcoal/90 px-4 py-2.5 backdrop-blur-xl"
        role="status"
      >
        <span className="size-2 shrink-0 animate-pulse rounded-full bg-sunset" aria-hidden="true" />
        <p className="text-xs font-medium text-bone">Connection lost</p>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-mist/60">Reconnecting...</span>
      </motion.div>
    )
  }

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-40">
      <div
        className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 backdrop-blur-md ${
          reconnecting ? 'border-sunset/40 bg-night/60' : 'border-white/10 bg-night/40'
        }`}
        role="status"
      >
        <span className={`size-1.5 rounded-full ${reconnecting ? 'animate-pulse bg-sunset' : 'bg-live'}`} aria-hidden="true" />
        <span className="text-[11px] font-medium tracking-wide text-bone/75">
          {reconnecting ? 'Reconnecting…' : 'Live'}
        </span>
      </div>
    </div>
  )
}
