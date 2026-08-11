interface EqualizerProps {
  playing: boolean
  bars?: number
  className?: string
}

const DELAYS = [0, 0.18, 0.36, 0.54, 0.27]

export default function Equalizer({ playing, bars = 4, className }: EqualizerProps) {
  return (
    <span className={`inline-flex h-3.5 items-end gap-[2px] ${className ?? ''}`} aria-hidden="true">
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className="w-[2px] rounded-full bg-bone/80"
          style={{
            height: '100%',
            transformOrigin: 'bottom',
            animation: playing ? `rt-eq 1.1s ease-in-out ${DELAYS[i % DELAYS.length]}s infinite` : 'none',
            transform: playing ? undefined : 'scaleY(0.35)',
          }}
        />
      ))}
    </span>
  )
}
