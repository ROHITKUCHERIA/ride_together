import { ordinal, maneuverIconFor } from '../utils/maneuver'
import type { ManeuverModifier, ManeuverType } from '../types'

interface ManeuverIconProps {
  type: ManeuverType
  modifier?: ManeuverModifier
  exitNumber?: number
  size?: number
  className?: string
}

/**
 * Maneuver glyph. Roundabouts with a known exit render an exit badge
 * (e.g. "2nd") so users never have to guess the count.
 */
export default function ManeuverIcon({
  type,
  modifier,
  exitNumber,
  size = 28,
  className = '',
}: ManeuverIconProps) {
  const Icon = maneuverIconFor(type, modifier)
  const isRoundabout = type === 'roundabout' && typeof exitNumber === 'number' && exitNumber > 0

  if (isRoundabout) {
    return (
      <span className={`relative inline-grid place-items-center ${className}`} aria-hidden="true">
        <Icon size={size} strokeWidth={2} />
        <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/15 bg-night px-1.5 py-px text-[9px] font-bold leading-tight text-ember">
          {ordinal(exitNumber as number)}
        </span>
      </span>
    )
  }

  return <Icon className={className} size={size} strokeWidth={2} aria-hidden="true" />
}