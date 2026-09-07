import { Crosshair } from 'lucide-react'

interface RecenterButtonProps {
  onRecenter: () => void
  /** Tracks whether the map is currently following the rider. */
  following: boolean
}

/** ◎ Recenter — resumes navigation-follow mode after a manual pan/zoom. */
export default function RecenterButton({ onRecenter, following }: RecenterButtonProps) {
  return (
    <button
      type="button"
      onClick={onRecenter}
      title={following ? 'Recenter on my location' : 'Recenter map on my location'}
      aria-label="Recenter navigation map"
      className={`rt-tap flex size-11 items-center justify-center rounded-full border shadow-lg backdrop-blur-xl transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-ember ${
        following
          ? 'border-live/50 bg-live/20 text-live'
          : 'border-white/12 bg-night/80 text-bone/85 hover:bg-night/90 hover:text-bone'
      }`}
    >
      <Crosshair size={18} strokeWidth={1.9} aria-hidden="true" />
    </button>
  )
}