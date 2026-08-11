import { motion } from 'framer-motion'
import { Bike, ExternalLink, Music2 } from 'lucide-react'
import Avatar from './Avatar'
import OnlineIndicator from './OnlineIndicator'
import type { TripInfo } from '../types'

interface TripNavigationProps {
  trip: TripInfo
  onlineCount: number
}

function ProviderLink({ label, href, compact }: { label: string; href: string; compact: boolean }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="group inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-night/40 px-3 py-1.5 text-[11px] font-medium text-bone/80 backdrop-blur-md transition hover:scale-[1.04] hover:border-white/25 hover:text-bone focus-visible:outline-2 focus-visible:outline-ember"
    >
      <Music2 size={12} className="text-ember" aria-hidden="true" />
      <span className={compact ? 'hidden sm:inline' : ''}>{label}</span>
      <ExternalLink size={10} className="text-mist/60 transition group-hover:text-bone" aria-hidden="true" />
    </a>
  )
}

export default function TripNavigation({ trip, onlineCount }: TripNavigationProps) {
  const me = trip.riders.find((r) => r.isMe)

  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.5, ease: 'easeOut' }}
      className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-center justify-between gap-3 px-4 py-4 sm:px-7 sm:py-5"
    >
      <a
        href="#"
        onClick={(e) => e.preventDefault()}
        className="pointer-events-auto flex items-center gap-2.5 rounded-full px-2 py-1 focus-visible:outline-2 focus-visible:outline-ember"
        aria-label="RIDETOGETHER home"
      >
        <span className="grid size-8 place-items-center rounded-full border border-white/15 bg-night/50 backdrop-blur-md">
          <Bike size={16} className="text-ember" strokeWidth={2} />
        </span>
        <span className="font-display text-sm font-bold tracking-[0.22em] text-bone">
          RIDE<span className="text-ember">TOGETHER</span>
        </span>
      </a>

      <span className="hidden font-display text-[11px] font-medium uppercase tracking-[0.42em] text-bone/50 xl:block">
        {trip.destination} {trip.startDate.slice(-4)}
      </span>

      <div className="pointer-events-auto flex items-center gap-2">
        <ProviderLink label="Spotify" href="https://open.spotify.com" compact />
        <ProviderLink label="YouTube Music" href="https://music.youtube.com" compact />
        <OnlineIndicator count={onlineCount} className="hidden lg:inline-flex" />
        {me ? (
          <button
            type="button"
            aria-label={`${me.name} — your profile`}
            className="rounded-full transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-ember"
          >
            <Avatar name={me.name} accent={me.accent} size={36} status={me.status} />
          </button>
        ) : null}
      </div>
    </motion.header>
  )
}
