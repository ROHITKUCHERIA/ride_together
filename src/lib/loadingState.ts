/**
 * Global API loading state tracker.
 *
 * Tracks the number of in-flight API requests. The GlobalLoader component
 * subscribes to this and shows a liquid-glass overlay after a short delay
 * (300 ms) so fast requests never flash the loader.
 */

type Listener = (loading: boolean) => void

let activeCount = 0
let showTimer: ReturnType<typeof setTimeout> | null = null
let visible = false
const listeners = new Set<Listener>()

/** Delay (ms) before the loader becomes visible. Prevents flicker on fast requests. */
const SHOW_DELAY_MS = 300

function emit() {
  const next = activeCount > 0
  if (next === visible) return
  visible = next
  for (const fn of listeners) fn(visible)
}

function scheduleShow() {
  if (showTimer !== null) return
  showTimer = setTimeout(() => {
    showTimer = null
    emit()
  }, SHOW_DELAY_MS)
}

function clearShowTimer() {
  if (showTimer !== null) {
    clearTimeout(showTimer)
    showTimer = null
  }
}

/** Call when an API request starts. */
export function startRequest(): void {
  activeCount++
  if (activeCount === 1) {
    scheduleShow()
  }
}

/** Call when an API request finishes (success or error). */
export function endRequest(): void {
  activeCount = Math.max(0, activeCount - 1)
  if (activeCount === 0) {
    clearShowTimer()
    emit()
  }
}

/** Subscribe to loading state changes. Returns an unsubscribe function. */
export function subscribeLoading(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Current loading state (for non-React callers). */
export function isLoading(): boolean {
  return visible
}
