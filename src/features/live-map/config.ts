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

/** 0–10s LIVE · 10–30s DELAYED · 30–60s STALE · >60s OFFLINE */
export const PRESENCE_THRESHOLDS_MS = {
  live: num(import.meta.env.VITE_PRESENCE_LIVE_MS, 10_000),
  delayed: num(import.meta.env.VITE_PRESENCE_DELAYED_MS, 30_000),
  stale: num(import.meta.env.VITE_PRESENCE_STALE_MS, 60_000),
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
export const SINGLE_RIDER_ZOOM = 14
export const FIT_GROUP_MAX_ZOOM = 22
