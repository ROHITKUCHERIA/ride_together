import { motion } from 'framer-motion'
import { ArrowLeft, Bike, ExternalLink, Music2 } from 'lucide-react'
import Avatar from './Avatar'
import OnlineIndicator from './OnlineIndicator'
import ThemeToggle from './ThemeToggle'
import type { TripInfo } from '../types'

interface TripNavigationProps {
  trip: TripInfo
  onlineCount: number
  onBack?: () => void
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

export default function TripNavigation({ trip, onlineCount, onBack }: TripNavigationProps) {
  const me = trip.riders.find((r) => r.isMe)

  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.5, ease: 'easeOut' }}
      className="rt-dark-surface pointer-events-none absolute inset-x-0 top-0 z-[var(--z-nav)] flex items-center justify-between gap-3 px-4 sm:px-7"
      style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 1rem)', paddingBottom: '1.25rem' }}
    >
      <div className="pointer-events-auto flex min-w-0 items-center gap-1.5">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to trips"
            className="rt-tap grid shrink-0 place-items-center rounded-full border border-white/12 bg-night/50 text-bone/85 backdrop-blur-md transition hover:scale-105 hover:bg-night/75 hover:text-bone focus-visible:outline-2 focus-visible:outline-ember"
          >
            <ArrowLeft size={16} aria-hidden="true" />
          </button>
        ) : null}
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          className="flex items-center gap-2.5 rounded-full px-2 py-1 focus-visible:outline-2 focus-visible:outline-ember"
          aria-label="RIDETOGETHER home"
        >
          <span className="grid size-8 place-items-center rounded-full border border-white/15 bg-night/50 backdrop-blur-md">
            <Bike size={16} className="text-ember" strokeWidth={2} />
          </span>
          <span className="hidden font-display text-sm font-bold tracking-[0.22em] text-bone sm:inline">
            RIDE<span className="text-ember">TOGETHER</span>
          </span>
        </a>
      </div>

      <span className="hidden font-display text-[11px] font-medium uppercase tracking-[0.42em] text-bone/50 xl:block">
        {trip.destination} {trip.startDate.slice(-4)}
      </span>

      <div className="pointer-events-auto flex min-w-0 items-center justify-end gap-2">
        <ThemeToggle compact />
        <span className="hidden md:block">
          <ProviderLink label="Spotify" href="https://open.spotify.com" compact />
        </span>
        <span className="hidden md:block">
          <ProviderLink label="YouTube Music" href="https://music.youtube.com" compact />
        </span>
        <OnlineIndicator count={onlineCount} compact />
        {me ? (
          <button
            type="button"
            aria-label={`${me.name} — your profile`}
            className="shrink-0 rounded-full transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-ember"
          >
            <Avatar name={me.name} accent={me.accent} size={36} status={me.status} />
          </button>
        ) : null}
      </div>
    </motion.header>
  )
}
