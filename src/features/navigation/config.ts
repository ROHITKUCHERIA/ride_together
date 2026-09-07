function str(env: string | undefined, fallback: string): string {
  if (env === undefined || env === '') return fallback
  return env
}

function num(env: string | undefined, fallback: number): number {
  if (env === undefined || env === '') return fallback
  const n = Number(env)
  return Number.isFinite(n) ? n : fallback
}

/** Arrival is reached when the rider is within this distance of the destination (m). */
export const NAV_ARRIVAL_THRESHOLD_METERS = num(import.meta.env.VITE_NAV_ARRIVAL_THRESHOLD_METERS, 50)

/** The rider is considered off-route when farther than this from the route line (m). */
export const NAV_OFF_ROUTE_THRESHOLD_METERS = num(import.meta.env.VITE_NAV_OFF_ROUTE_THRESHOLD_METERS, 150)

/** Zoom level used by the Recenter button while navigating. */
export const NAV_RECENTER_ZOOM = num(import.meta.env.VITE_NAV_RECENTER_ZOOM, 15)

/** `NAV_RECENTER_ZOOM` fallback for day-light tiles (same as map control zoom). */
export const NAV_SINGLE_RIDER_ZOOM = num(import.meta.env.VITE_NAV_SINGLE_RIDER_ZOOM, 14)

/** Debounce for the destination search input (ms). */
export const NAV_SEARCH_DEBOUNCE_MS = num(import.meta.env.VITE_NAV_SEARCH_DEBOUNCE_MS, 400)

/** Straight-line fallback only — used when the user has no backend session. */
export const NOMINATIM_URL = str(import.meta.env.VITE_NOMINATIM_URL, 'https://nominatim.openstreetmap.org')

/* ---------- Phase 2: turn-by-turn navigation ---------- */

/** Voice phrase is spoken when the maneuver is within this distance (m). */
export const NAV_MANEUVER_FAR_THRESHOLD_METERS = num(import.meta.env.VITE_NAV_MANEUVER_FAR_THRESHOLD_METERS, 500)

/** The short "Turn right." phrase is spoken within this distance (m). */
export const NAV_MANEUVER_NEAR_THRESHOLD_METERS = num(import.meta.env.VITE_NAV_MANEUVER_NEAR_THRESHOLD_METERS, 100)

/** A maneuver is treated as completed once the rider is within this distance of
 *  its location along the route (m). */
export const NAV_MANEUVER_COMPLETION_THRESHOLD_METERS = num(import.meta.env.VITE_NAV_MANEUVER_COMPLETION_THRESHOLD_METERS, 40)

/** Automatic rerouting: master switch. */
export const NAV_AUTO_REROUTE_ENABLED = import.meta.env.VITE_NAV_AUTO_REROUTE_ENABLED !== 'false'

/** Minimum time spent off-route before a reroute may fire (ms). */
export const NAV_AUTO_REROUTE_DELAY_MS = num(import.meta.env.VITE_NAV_AUTO_REROUTE_DELAY_MS, 3000)

/** Minimum interval between two reroutes (ms) — prevents reroute storms. */
export const NAV_AUTO_REROUTE_MIN_INTERVAL_MS = num(import.meta.env.VITE_NAV_AUTO_REROUTE_MIN_INTERVAL_MS, 15000)

/** Consecutive off-route GPS samples required to confirm the deviation. */
export const NAV_OFF_ROUTE_CONFIRMATION_SAMPLES = num(import.meta.env.VITE_NAV_OFF_ROUTE_CONFIRMATION_SAMPLES, 3)

/**
 * Accuracy-aware off-route detection: the effective threshold is
 * `NAV_OFF_ROUTE_THRESHOLD_METERS + accuracy` (capped at
 * NAV_OFF_ROUTE_MAX_ACCURACY_METERS). A single high-error GPS fix therefore
 * cannot trigger a reroute unless the drift is real. Documented in .env.example.
 */
export const NAV_OFF_ROUTE_MAX_ACCURACY_METERS = num(import.meta.env.VITE_NAV_OFF_ROUTE_MAX_ACCURACY_METERS, 200)

/** GPS is reported as "low accuracy" above this value (m). */
export const NAV_GPS_POOR_ACCURACY_METERS = num(import.meta.env.VITE_NAV_GPS_POOR_ACCURACY_METERS, 250)

/** The rider marker is treated as lost when no live fix falls within this age (ms). */
export const NAV_GPS_SIGNAL_LOST_AFTER_MS = num(import.meta.env.VITE_NAV_GPS_SIGNAL_LOST_AFTER_MS, 20000)

/** Voice guidance default on/off (Web Speech API). */
export const NAV_VOICE_ENABLED = import.meta.env.VITE_NAV_VOICE_ENABLED !== 'false'

/** How long a fetched route stays in the client-side cache (ms). */
export const NAV_ROUTE_CACHE_TTL_MS = num(import.meta.env.VITE_NAV_ROUTE_CACHE_TTL_MS, 300_000)

/** Maximum heading rotation applied per update when smoothing (deg). */
export const NAV_HEADING_MAX_STEP_DEG = num(import.meta.env.VITE_NAV_HEADING_MAX_STEP_DEG, 18)