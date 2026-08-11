import { motion } from 'framer-motion'
import { ListMusic, MapPin, Route, Users } from 'lucide-react'

interface FloatingActionsProps {
  onOpenMap: () => void
  onOpenPlaylists: () => void
  onOpenRiders: () => void
  onOpenTripInfo: () => void
}

const ITEMS = [
  { id: 'map', label: 'Live Map', icon: MapPin, action: 'onOpenMap' },
  { id: 'music', label: 'Playlists', icon: ListMusic, action: 'onOpenPlaylists' },
  { id: 'riders', label: 'Riders', icon: Users, action: 'onOpenRiders' },
  { id: 'trip', label: 'Trip Info', icon: Route, action: 'onOpenTripInfo' },
] as const

export default function FloatingActions({ onOpenMap, onOpenPlaylists, onOpenRiders, onOpenTripInfo }: FloatingActionsProps) {
  const handlers: Record<(typeof ITEMS)[number]['action'], () => void> = {
    onOpenMap,
    onOpenPlaylists,
    onOpenRiders,
    onOpenTripInfo,
  }

  return (
    <motion.nav
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.7, delay: 1.1, ease: 'easeOut' }}
      className="fixed bottom-6 left-6 z-40 hidden flex-col items-start gap-2 md:flex"
      aria-label="Trip actions"
    >
      {ITEMS.map((item, i) => {
        const Icon = item.icon
        return (
          <motion.button
            key={item.id}
            type="button"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.15 + i * 0.06, duration: 0.4 }}
            onClick={handlers[item.action]}
            className="group inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-night/45 py-2 pl-3 pr-4 backdrop-blur-md transition hover:scale-[1.04] hover:border-white/25 hover:bg-night/65 focus-visible:outline-2 focus-visible:outline-ember"
            aria-label={`Open ${item.label}`}
          >
            <span className="grid size-6 place-items-center rounded-full bg-white/[0.07] text-bone/80 transition group-hover:bg-ember/20 group-hover:text-ember">
              <Icon size={13} aria-hidden="true" />
            </span>
            <span className="text-xs font-medium tracking-wide text-bone/85">{item.label}</span>
          </motion.button>
        )
      })}
    </motion.nav>
  )
}
