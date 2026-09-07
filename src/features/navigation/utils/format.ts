/** Distance formatting for the navigation HUD (meters → "12.4 km" / "820 m"). */
export function formatDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined || !Number.isFinite(meters)) return '–'
  if (meters < 1000) return `${Math.round(meters)} m`
  const km = meters / 1000
  return `${km >= 100 ? km.toFixed(0) : km.toFixed(1)} km`
}

/** Duration formatting for the navigation HUD (seconds → "18 min" / "1 hr 20 min"). */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '–'
  const totalMinutes = Math.max(0, Math.round(seconds / 60))
  if (totalMinutes < 1) return '<1 min'
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} hr`
  return `${h} hr ${m} min`
}

/** Clock-time ETA ("10:42 AM") from an epoch timestamp; "–" when unknown. */
export function formatEta(epochMs: number | null | undefined): string {
  if (epochMs === null || epochMs === undefined || !Number.isFinite(epochMs)) return '–'
  return new Date(epochMs).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Distance phrasing for the maneuver header ("in 250 m" / "in 1.2 km"). */
export function formatDistancePrefix(meters: number | null | undefined): string | null {
  if (meters === null || meters === undefined || !Number.isFinite(meters) || meters < 0) {
    return null
  }
  if (meters <= 5) return 'now'
  return `in ${formatDistance(meters)}`
}