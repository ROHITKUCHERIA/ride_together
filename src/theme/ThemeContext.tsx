import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

export type ThemePreference = 'auto' | 'day' | 'night'
export type ResolvedTheme = 'day' | 'night'

const STORAGE_KEY = 'rt.theme'
const DAY_START_HOUR = 6
const NIGHT_START_HOUR = 18
const AUTO_CHECK_MS = 30_000

/** 06:00–18:00 is "day", everything else is "night". */
export function hourIsDaytime(now = new Date()): boolean {
  const h = now.getHours()
  return h >= DAY_START_HOUR && h < NIGHT_START_HOUR
}

function readPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'day' || stored === 'night' || stored === 'auto') return stored
  } catch {
    // storage unavailable — default to auto
  }
  return 'auto'
}

interface ThemeContextValue {
  /** User preference: 'auto' follows the clock. */
  preference: ThemePreference
  /** The theme actually applied right now. */
  theme: ResolvedTheme
  setPreference: (preference: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function resolvePreference(preference: ThemePreference): ResolvedTheme {
  if (preference !== 'auto') return preference
  return hourIsDaytime() ? 'day' : 'night'
}

/**
 * App-wide light/dark theming. Night is the existing "default" look; day mode
 * flips the CSS palette via the `rt-theme-day` class on <html>. Preference is
 * persisted and can follow the clock (auto) or be locked by the user.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readPreference())
  const [theme, setTheme] = useState<ResolvedTheme>(() => resolvePreference(readPreference()))

  // Persist the preference.
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, preference)
    } catch {
      // ignore storage failures
    }
  }, [preference])

  // Apply the resolved theme to the document.
  useEffect(() => {
    const root = document.documentElement
    const isDay = theme === 'day'
    root.classList.toggle('rt-theme-day', isDay)
    root.style.colorScheme = theme
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', isDay ? '#f3f1ea' : '#0a0a0c')
  }, [theme])

  // Auto mode: re-resolve on an interval and whenever the tab regains focus,
  // so switching from night into day is picked up without a reload.
  useEffect(() => {
    if (preference !== 'auto') return
    const resolve = () => setTheme(hourIsDaytime() ? 'day' : 'night')
    resolve()
    const timer = window.setInterval(resolve, AUTO_CHECK_MS)
    const onVisible = () => {
      if (!document.hidden) resolve()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [preference])

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next)
    if (next !== 'auto') setTheme(next)
  }, [])

  return <ThemeContext.Provider value={{ preference, theme, setPreference }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}