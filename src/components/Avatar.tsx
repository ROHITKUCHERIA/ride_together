import type { RiderStatus } from '../types'

const STATUS_DOT: Record<RiderStatus, string> = {
  online: 'bg-live',
  weak: 'bg-sunset',
  offline: 'bg-ash',
}

interface AvatarProps {
  name: string
  accent: string
  size?: number
  status?: RiderStatus
  className?: string
}

export default function Avatar({ name, accent, size = 40, status, className }: AvatarProps) {
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full font-display font-semibold text-bone ${className ?? ''}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `radial-gradient(120% 120% at 25% 20%, ${accent} 0%, rgba(20,16,14,0.9) 120%)`,
        boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.18), 0 4px 14px -6px ${accent}66`,
      }}
      aria-hidden="true"
    >
      {initials}
      {status ? (
        <span
          className={`absolute -bottom-0.5 -right-0.5 rounded-full ${STATUS_DOT[status]} ${status === 'online' ? 'rt-live-dot' : ''}`}
          style={{
            width: size * 0.28,
            height: size * 0.28,
            border: `2px solid rgba(10,10,12,0.9)`,
          }}
        />
      ) : null}
    </span>
  )
}
