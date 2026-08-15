import { Moon, Sun, SunMoon } from 'lucide-react'
import { useTheme } from '../theme/ThemeContext'
import type { ThemePreference } from '../theme/ThemeContext'

const OPTIONS: { value: ThemePreference; icon: typeof Sun; label: string }[] = [
  { value: 'day', icon: Sun, label: 'Day theme' },
  { value: 'auto', icon: SunMoon, label: 'Auto theme (follows time of day)' },
  { value: 'night', icon: Moon, label: 'Night theme' },
]

interface ThemeToggleProps {
  /** Compact icon-only sizing for dense headers. */
  compact?: boolean
}

/**
 * Day / Auto / Night switcher. Auto follows the clock (06:00–18:00 = day);
 * choosing Day or Night locks the theme override until Auto is picked again.
 */
export default function ThemeToggle({ compact = false }: ThemeToggleProps) {
  const { preference, theme, setPreference } = useTheme()

  return (
    <div
      role="group"
      aria-label="Theme"
      className="flex items-center gap-0.5 rounded-full border border-white/10 bg-night/40 p-0.5 backdrop-blur-md"
    >
      {OPTIONS.map(({ value, icon: Icon, label }) => {
        const active = preference === value
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            aria-label={label}
            title={label}
            onClick={() => setPreference(value)}
            className={`grid place-items-center rounded-full transition focus-visible:outline-2 focus-visible:outline-accent active:scale-95 ${
              compact ? 'size-6' : 'size-7'
            } ${active ? 'bg-ember/20 text-bone' : 'text-mist hover:text-bone'}`}
          >
            <Icon size={compact ? 11 : 13} aria-hidden="true" />
          </button>
        )
      })}
      <span className="sr-only">
        {preference === 'auto' ? `Auto — currently ${theme}` : `${preference} theme`}
      </span>
    </div>
  )
}