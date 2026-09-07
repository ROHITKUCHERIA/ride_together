import { Volume2, VolumeX } from 'lucide-react'

interface VoiceControlProps {
  enabled: boolean
  /** Hidden (disabled) when the browser cannot synthesize speech. */
  supported: boolean
  onToggle: () => void
  /** Compact icon-only mode for the header. */
  compact?: boolean
}

/** Voice-guidance toggle. Disabled gracefully when speech is unsupported. */
export default function VoiceControl({
  enabled,
  supported,
  onToggle,
  compact = false,
}: VoiceControlProps) {
  if (!supported) {
    return (
      <span
        title="Voice guidance is not supported in this browser"
        aria-label="Voice guidance not supported"
        className="pointer-events-none inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-night/70 px-3 py-2 text-[11px] font-medium text-mist/40 opacity-60"
      >
        <VolumeX size={14} aria-hidden="true" />
        {compact ? null : <span>Voice unavailable</span>}
      </span>
    )
  }

  const label = enabled ? 'Turn voice guidance off' : 'Turn voice guidance on'

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-pressed={enabled}
      title={label}
      className={`rt-tap inline-flex items-center gap-1.5 rounded-full border backdrop-blur-xl transition hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-ember ${
        compact ? 'px-3 py-2' : 'px-3.5 py-2'
      } ${
        enabled
          ? 'border-live/40 bg-live/15 text-live hover:bg-live/25'
          : 'border-white/12 bg-night/70 text-mist/70 hover:bg-night/85 hover:text-bone'
      }`}
    >
      {enabled ? <Volume2 size={14} aria-hidden="true" /> : <VolumeX size={14} aria-hidden="true" />}
      {compact ? null : <span className="text-[11px] font-semibold">{enabled ? 'Voice On' : 'Voice Off'}</span>}
    </button>
  )
}