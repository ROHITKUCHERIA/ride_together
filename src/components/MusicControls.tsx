import { Pause, Play, SkipBack, SkipForward } from 'lucide-react'

interface MusicControlsProps {
  isPlaying: boolean
  onToggle: () => void
  onPrev: () => void
  onNext: () => void
  size?: 'sm' | 'md'
}

export default function MusicControls({ isPlaying, onToggle, onPrev, onNext, size = 'md' }: MusicControlsProps) {
  const icon = size === 'sm' ? 14 : 16
  const side = size === 'sm' ? 34 : 40

  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Music controls">
      <button
        type="button"
        onClick={onPrev}
        aria-label="Previous song"
        className="grid place-items-center rounded-full text-bone/70 transition hover:scale-110 hover:text-bone focus-visible:outline-2 focus-visible:outline-ember"
        style={{ width: side, height: side }}
      >
        <SkipBack size={icon} />
      </button>
      <button
        type="button"
        onClick={onToggle}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        className="grid place-items-center rounded-full bg-bone text-night shadow-[0_8px_28px_-8px_rgba(244,239,231,0.5)] transition hover:scale-105 hover:bg-white focus-visible:outline-2 focus-visible:outline-ember"
        style={{ width: side + 14, height: side + 14 }}
      >
        {isPlaying ? <Pause size={size === 'sm' ? 18 : 22} fill="currentColor" /> : <Play size={size === 'sm' ? 18 : 22} fill="currentColor" className="ml-0.5" />}
      </button>
      <button
        type="button"
        onClick={onNext}
        aria-label="Next song"
        className="grid place-items-center rounded-full text-bone/70 transition hover:scale-110 hover:text-bone focus-visible:outline-2 focus-visible:outline-ember"
        style={{ width: side, height: side }}
      >
        <SkipForward size={icon} />
      </button>
    </div>
  )
}
