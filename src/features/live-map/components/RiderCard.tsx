import { motion } from 'framer-motion'
import { Bike, MapPin, X } from 'lucide-react'
import type { RiderLocation, RiderPresence } from '../types'
import Avatar from '../../../components/Avatar'
import { PresenceChip, RiderDetails } from './RiderDetails'

interface RiderCardProps {
  rider: RiderLocation
  presence: RiderPresence
  distanceFromMeMeters: number | null
  isMe: boolean
  onClose: () => void
}

export default function RiderCard({ rider, presence, distanceFromMeMeters, isMe, onClose }: RiderCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      className="pointer-events-auto w-[min(92vw,320px)] rounded-2xl border border-white/12 bg-[rgba(18,18,21,0.88)] p-4 backdrop-blur-2xl"
    >
      <div className="flex items-start gap-3">
        <Avatar name={rider.name} accent={rider.accent} size={46} />
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
        <button
          type="button"
          onClick={onClose}
          aria-label="Close rider details"
          className="rounded-full border border-white/10 p-1.5 text-mist/70 transition hover:bg-white/5 hover:text-bone"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>

      <RiderDetails rider={rider} />

      {!isMe && distanceFromMeMeters !== null && (
        <p className="mt-3 flex items-center gap-1.5 border-t border-white/8 pt-2.5 text-[11px] text-mist/70">
          <MapPin size={11} className="text-ember" aria-hidden="true" />
          {(distanceFromMeMeters / 1000).toFixed(1)} km from you
        </p>
      )}
    </motion.div>
  )
}
