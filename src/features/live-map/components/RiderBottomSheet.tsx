import { motion } from 'framer-motion'
import { Bike, ChevronDown, MapPin } from 'lucide-react'
import type { RiderLocation, RiderPresence } from '../types'
import Avatar from '../../../components/Avatar'
import { PresenceChip, RiderDetails } from './RiderDetails'

interface RiderBottomSheetProps {
  rider: RiderLocation
  presence: RiderPresence
  distanceFromMeMeters: number | null
  isMe: boolean
  onClose: () => void
}

/** Height reserved for the mobile bottom navigation (so the sheet never covers it). */
const NAV_RESERVED_PX = 84

export default function RiderBottomSheet({ rider, presence, distanceFromMeMeters, isMe, onClose }: RiderBottomSheetProps) {
  return (
    <motion.div
      initial={{ y: 300, opacity: 0.5 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 300, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 340, damping: 34 }}
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 0.45 }}
      onDragEnd={(_, info) => {
        if (info.offset.y > 110 || info.velocity.y > 500) onClose()
      }}
      className="rt-dark-surface pointer-events-auto fixed inset-x-3 z-[6] origin-bottom rounded-t-3xl rounded-b-2xl border border-white/12 bg-charcoal/95 shadow-[0_-24px_60px_-24px_rgba(0,0,0,0.7)] backdrop-blur-2xl"
      style={{ bottom: `calc(env(safe-area-inset-bottom, 0px) + ${NAV_RESERVED_PX}px)` }}
      role="dialog"
      aria-modal="false"
      aria-label={`${rider.name} details`}
    >
      {/* drag handle + close */}
      <div className="flex touch-none select-none items-center justify-between px-6 pt-2.5">
        <span className="mx-auto h-1.5 w-10 rounded-full bg-white/25" aria-hidden="true" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close rider details"
          className="relative -mr-2 grid size-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-bone/70 transition hover:bg-white/10 hover:text-bone focus-visible:outline-2 focus-visible:outline-ember"
        >
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-2.5 px-4 pb-[max(env(safe-area-inset-bottom,0px),1rem)]">
        <div className="flex items-center gap-3">
          <Avatar name={rider.name} accent={rider.accent} size={46} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-display text-base font-bold text-bone">{rider.name}</p>
              {isMe ? <span className="rounded-full bg-live/15 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-live">You</span> : null}
              <PresenceChip presence={presence} />
            </div>
            <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-mist/70">
              <Bike size={11} className="shrink-0" aria-hidden="true" />
              {rider.bike}
            </p>
          </div>
        </div>

        <div className="mt-3">
          <RiderDetails rider={rider} />
        </div>

        {!isMe && distanceFromMeMeters !== null ? (
          <p className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] py-2 text-[11px] text-mist/70">
            <MapPin size={11} className="text-ember" aria-hidden="true" />
            {(distanceFromMeMeters / 1000).toFixed(1)} km from you
          </p>
        ) : null}
      </div>
    </motion.div>
  )
}