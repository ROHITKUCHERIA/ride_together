import {
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  CircleDot,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  Merge,
  Navigation,
  RotateCcw,
  RotateCw,
  Split,
  Undo2,
  type LucideProps,
} from 'lucide-react'
import type { ForwardRefExoticComponent, RefAttributes } from 'react'
import type { ManeuverModifier, ManeuverType, NavigationInstruction } from '../types'

/** Ordinal suffix ("2nd exit") — only used when the engine provides an exit. */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

type IconComponent = ForwardRefExoticComponent<Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>>

/**
 * Icon glyph for a maneuver type+modifier. Lives here (not in a component) so
 * the icon map stays a plain util and components stay fast-refresh friendly.
 */
export function maneuverIconFor(type: ManeuverType, modifier?: ManeuverModifier): IconComponent {
  switch (type) {
    case 'depart':
      return Navigation
    case 'arrive':
      return Flag
    case 'uturn':
      return Undo2
    case 'merge':
      return Merge
    case 'fork':
      return Split
    case 'roundabout':
      return CircleDot
    case 'turn':
      switch (modifier) {
        case 'left':
          return CornerUpLeft
        case 'right':
          return CornerUpRight
        case 'slight-left':
          return ArrowUpLeft
        case 'slight-right':
          return ArrowUpRight
        case 'sharp-left':
          return RotateCcw
        case 'sharp-right':
          return RotateCw
        default:
          return ArrowUp
      }
    case 'continue':
    default:
      return ArrowUp
  }
}

/** Short, screen-readable maneuver title ("Turn Right", "Take the 2nd exit"). */
export function maneuverTitle(
  type: ManeuverType,
  modifier?: ManeuverModifier,
  exitNumber?: number,
): string {
  switch (type) {
    case 'depart':
      return 'Go'
    case 'arrive':
      return 'Arrive'
    case 'turn':
      switch (modifier) {
        case 'left':
          return 'Turn Left'
        case 'right':
          return 'Turn Right'
        case 'slight-left':
          return 'Turn Slight Left'
        case 'slight-right':
          return 'Turn Slight Right'
        case 'sharp-left':
          return 'Turn Sharp Left'
        case 'sharp-right':
          return 'Turn Sharp Right'
        default:
          return 'Turn'
      }
    case 'continue':
      return modifier === 'straight' || !modifier ? 'Continue Straight' : 'Continue'
    case 'merge':
      return modifier ? `Merge ${sideLabel(modifier)}` : 'Merge'
    case 'fork':
      return modifier ? `Keep ${sideLabel(modifier)}` : 'Keep'
    case 'roundabout':
      if (exitNumber && exitNumber > 0) return `Take the ${ordinal(exitNumber)} exit`
      return 'Roundabout'
    case 'uturn':
      return 'U-turn'
    default:
      return 'Navigation'
  }
}

function sideLabel(modifier: ManeuverModifier): string {
  const side = modifier.replace('slight-', '').replace('sharp-', '')
  return side.charAt(0).toUpperCase() + side.slice(1)
}

/** Readable road line shown beneath the maneuver ("NH 44"). */
export function maneuverRoadLine(instruction: NavigationInstruction | null | undefined): string {
  return instruction?.roadName?.trim() ?? ''
}

export type VoiceStage = 'far' | 'near'

/**
 * Voice phrase for a maneuver. Far = "Turn right in 250 meters" (distance
 * rounded to a human-friendly figure); near = the bare maneuver. Roundabouts
 * keep their exit wording.
 */
export function maneuverVoicePhrase(
  instruction: NavigationInstruction,
  stage: VoiceStage,
  meters?: number,
): string {
  const title = maneuverTitle(instruction.type, instruction.modifier, instruction.exitNumber)
  const road = maneuverRoadLine(instruction)

  if (stage === 'far') {
    const rounded = meters !== undefined ? roundToFriendly(meters) : undefined
    const dist =
      rounded !== undefined
        ? rounded >= 1000
          ? ` in ${rounded / 1000} kilometer${rounded === 1000 ? '' : 's'}`
          : ` in ${rounded} meter${rounded === 1 ? '' : 's'}`
        : ''
    return road ? `${title}${dist} onto ${road}` : `${title}${dist}.`
  }

  if (instruction.type === 'roundabout' && !instruction.exitNumber) {
    return road ? `${title}. Take the next exit onto ${road}` : `${title}. Take the next exit.`
  }
  if (instruction.type === 'arrive') return 'You have arrived at your destination.'
  return road ? `${title} onto ${road}.` : `${title}.`
}

/** "250" → "250", "247" → "250", "12300" → "12 kilometers". */
function roundToFriendly(meters: number): number {
  if (!Number.isFinite(meters) || meters <= 0) return 0
  if (meters >= 1000) return Math.round(meters / 1000) * 1000
  if (meters >= 100) return Math.round(meters / 10) * 10
  return meters
}

/** True while the maneuver still lies ahead (not yet completed). */
export function isUpcomingManeuver(
  instruction: NavigationInstruction | null | undefined,
): instruction is NavigationInstruction {
  return instruction !== null && instruction !== undefined && instruction.type !== 'arrive'
}