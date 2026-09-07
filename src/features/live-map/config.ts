function str(env: string | undefined, fallback: string): string {
  if (env === undefined || env === '') return fallback
  return env
}

function num(env: string | undefined, fallback: number): number {
  if (env === undefined || env === '') return fallback
  const n = Number(env)
  return Number.isFinite(n) ? n : fallback
}

/* ---------- backend realtime integration ---------- */

/** Base URL of the NestJS backend (REST + Socket.IO share this origin). */
export const API_URL = str(import.meta.env.VITE_API_URL, 'http://localhost:3000')
/**
 * When 'true' the live map talks to the backend over Socket.IO instead of the
 * in-browser mock. Requires the backend to be running and the demo user to be
 * a trip member (see prisma/seed.ts).
 */
export const USE_REALTIME_BACKEND = import.meta.env.VITE_USE_REALTIME_BACKEND === 'true'
/** Optional explicit trip id; when empty the first joined trip is used. */
export const BACKEND_TRIP_ID = str(import.meta.env.VITE_BACKEND_TRIP_ID, '')
/** Optional pre-issued access token; when empty a demo user is logged in. */
export const ACCESS_TOKEN_OVERRIDE = str(import.meta.env.VITE_ACCESS_TOKEN, '')
export const DEV_EMAIL = str(import.meta.env.VITE_DEV_EMAIL, 'demo@ridetogether.app')
export const DEV_PASSWORD = str(import.meta.env.VITE_DEV_PASSWORD, 'Demo1234!')

/**
 * Client-side GPS throttle. NOTE: this is NOT a security mechanism —
 * the future backend must enforce its own rate limiting on location events.
 */
export const LOCATION_UPDATE_INTERVAL_MS = num(import.meta.env.VITE_LOCATION_UPDATE_INTERVAL_MS, 5000)
export const MIN_DISTANCE_METERS = num(import.meta.env.VITE_MIN_DISTANCE_METERS, 10)
export const MIN_ACCURACY_METERS = num(import.meta.env.VITE_MIN_ACCURACY_METERS, 100)

export const GPS_TIMEOUT_MS = num(import.meta.env.VITE_GPS_TIMEOUT_MS, 15000)
export const GPS_MAXIMUM_AGE_MS = num(import.meta.env.VITE_GPS_MAXIMUM_AGE_MS, 0)

/** 0–15s LIVE · 15–60s DELAYED · 60–90s STALE · >90s OFFLINE
 *  (aligns with the backend rider-status thresholds: <15 LIVE, 15–60 DELAYED,
 *   >60 OFFLINE; STALE is the client-side transitional band before OFFLINE). */
export const PRESENCE_THRESHOLDS_MS = {
  live: num(import.meta.env.VITE_PRESENCE_LIVE_MS, 15_000),
  delayed: num(import.meta.env.VITE_PRESENCE_DELAYED_MS, 60_000),
  stale: num(import.meta.env.VITE_PRESENCE_STALE_MS, 90_000),
}

export const GROUP_SPREADING_THRESHOLD_METERS = num(import.meta.env.VITE_GROUP_SPREADING_THRESHOLD_METERS, 2000)
export const GROUP_SPLIT_THRESHOLD_METERS = num(import.meta.env.VITE_GROUP_SPLIT_THRESHOLD_METERS, 3000)

export const MOCK_RIDER_TICK_MS = num(import.meta.env.VITE_MOCK_RIDER_TICK_MS, 2000)
export const MOCK_REALTIME_CONNECT_DELAY_MS = 400
export const MOCK_RECONNECT_AT_MS = 12_000
export const MOCK_RECONNECT_DURATION_MS = 3000

export const FOLLOW_ANIMATION_MS = 800
export const DEFAULT_MAP_CENTER: [number, number] = [15.9, 73.97]
export const DEFAULT_MAP_ZOOM = 11
/** Zoom rails: 19 = closest street-level detail (tile limit), 3 = continent view. */
export const MAP_MIN_ZOOM = 3
export const MAP_MAX_ZOOM = 19
export const SINGLE_RIDER_ZOOM = 14
export const FIT_GROUP_MAX_ZOOM = 22

/**
 * Google Maps-style navigation camera. The rider is anchored at a fraction of
 * the map container (default lower-middle ~70% down) so the route ahead stays
 * visible above the ride marker. The camera follows per GPS update with a small
 * movement threshold — jitter is skipped, real movement is continuous.
 */
export const FOLLOW_CAMERA_OFFSET_X = num(import.meta.env.VITE_FOLLOW_CAMERA_OFFSET_X, 0.5)
export const FOLLOW_CAMERA_OFFSET_Y = num(import.meta.env.VITE_NAV_FOLLOW_Y, 0.7)
/** Skip a follow camera move when the rider moved less than this (m). */
export const FOLLOW_MIN_MOVE_METERS = num(import.meta.env.VITE_FOLLOW_MIN_MOVE_METERS, 4)
/** Skip a rotation-only follow update when the bearing changed less than this (deg). */
export const FOLLOW_BEARING_MIN_STEP_DEG = num(import.meta.env.VITE_FOLLOW_BEARING_MIN_STEP_DEG, 2)

/**
 * Navigation camera tilt (Google Maps-style perspective). Leaflet has no native
 * pitch, so the tilt is rendered by the isolated camera wrapper
 * (`perspective(...) rotateX(pitch) rotate(bearing)`); Leaflet's own camera
 * still owns center/zoom. Only applied in heading-up navigation mode.
 */
export const NAV_CAMERA_PITCH_DEG = num(import.meta.env.VITE_NAV_CAMERA_PITCH_DEG, 45)
/** Camera distance for the perspective projection (px). Lower = more extreme. */
export const NAV_CAMERA_PERSPECTIVE_PX = num(import.meta.env.VITE_NAV_CAMERA_PERSPECTIVE_PX, 2000)
/** Zoom used when entering navigation (heading-up) mode. */
export const NAVIGATION_ZOOM = num(import.meta.env.VITE_NAVIGATION_ZOOM, 17)
