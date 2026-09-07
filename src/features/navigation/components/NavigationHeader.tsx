import { ArrowLeft, Users } from 'lucide-react'
import ManeuverIcon from './ManeuverIcon'
import VoiceControl from './VoiceControl'
import { maneuverRoadLine, maneuverTitle } from '../utils/maneuver'
import { formatDistancePrefix } from '../utils/format'
import type { NavigationInstruction, NavigationStatus } from '../types'

interface NavigationHeaderProps {
  onBack: () => void
  online: number
  total: number
  status: NavigationStatus
  /** Current maneuver (only for the navigating state). */
  instruction: NavigationInstruction | null
  distanceToInstructionMeters: number | null
  voiceEnabled: boolean
  voiceSupported: boolean
  onToggleVoice: () => void
}

/**
 * Turn-by-turn navigation header. Left: back to map. Center: the primary
 * maneuver (icon + action + countdown + road name). Right: voice toggle + the
 * group's riding count so presence stays visible while driving.
 */
export default function NavigationHeader({
  onBack,
  online,
  total,
  status,
  instruction,
  distanceToInstructionMeters,
  voiceEnabled,
  voiceSupported,
  onToggleVoice,
}: NavigationHeaderProps) {
  const showManeuver = status === 'navigating' && instruction !== null

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-[6] flex flex-col gap-2 px-3 sm:px-4"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
    >
      {/* row 1 — back · voice · riding count */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to map"
          className="rt-tap pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/12 bg-night/70 px-3.5 py-2 text-xs font-medium text-bone backdrop-blur-xl transition hover:scale-[1.03] hover:bg-night/85 focus-visible:outline-2 focus-visible:outline-ember"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          <span className="hidden sm:inline">Map</span>
        </button>

        <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-night/70 px-3.5 py-2 text-[11px] font-medium text-bone/85 backdrop-blur-xl">
          <Users size={12} className="text-ember" aria-hidden="true" />
          {online}/{total} riding
        </span>

        <VoiceControl
          enabled={voiceEnabled}
          supported={voiceSupported}
          onToggle={onToggleVoice}
          compact
        />
      </div>

      {/* row 2 — maneuver card */}
      {showManeuver && instruction ? (
        <div
          className="pointer-events-auto mx-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-white/12 bg-night/80 px-4 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.45)] backdrop-blur-2xl sm:mx-0"
          aria-live="polite"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-live/15 text-live">
            <ManeuverIcon
              type={instruction.type}
              modifier={instruction.modifier}
              exitNumber={instruction.exitNumber}
              size={26}
            />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-bold leading-tight text-bone">
              {maneuverTitle(instruction.type, instruction.modifier, instruction.exitNumber)}
              {distanceToInstructionMeters !== null ? (
                <span className="ml-2 align-middle text-sm font-semibold text-live">
                  {formatDistancePrefix(distanceToInstructionMeters)}
                </span>
              ) : null}
            </p>
            <p className="truncate text-[11px] font-medium uppercase tracking-[0.14em] text-mist/70">
              {maneuverRoadLine(instruction) || 'Unknown road'}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}