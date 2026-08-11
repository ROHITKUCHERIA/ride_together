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

export default function RiderBottomSheet({ rider, presence, distanceFromMeMeters, isMe, onClose }: RiderBottomSheetProps) {
  return (
    <motion.div
      initial={{ y: 320, opacity: 0.6 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 320, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      className="absolute inset-x-0 bottom-0 z-[6] rounded-t-2xl border-t border-white/12 bg-[rgba(16,16,19,0.92)] px-4 pb-[max(env(safe-area-inset-bottom,0px),16px)] pt-2.5 backdrop-blur-2xl"
      role="dialog"
      aria-modal="false"
      aria-label={`${rider.name} details`}
    >
      <button type="button" onClick={onClose} aria-label="Collapse rider details" className="mx-auto mb-2.5 block rounded-full bg-white/10 p-1">
        <ChevronDown size={16} className="text-bone/70" aria-hidden="true" />
      </button>

      <div className="flex items-center gap-3">
        <Avatar name={rider.name} accent={rider.accent} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
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
        <p className="mt-2.5 flex items-center justify-center gap-1.5 text-[11px] text-mist/70">
          <MapPin size={11} className="text-ember" aria-hidden="true" />
          {(distanceFromMeMeters / 1000).toFixed(1)} km from you
        </p>
      ) : null}
    </motion.div>
  )
}
