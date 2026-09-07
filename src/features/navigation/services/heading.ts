import { bearingBetween } from '../../live-map/services/routing'

/**
 * Heading resolution for the navigation marker, kept isolated so the map never
 * rotates aggressively on a poor GPS fix.
 *
 * Priority:
 *  1. Device heading, when the browser reports one.
 *  2. Movement bearing, once the fix moved far enough to be trustworthy.
 *  3. Previous heading (hold) otherwise.
 *
 * Output is smoothed toward the target by at most `maxStepDeg` per update, and
 * rotation is suppressed entirely while GPS accuracy is poor.
 */

export interface HeadingSample {
  /** Device heading (deg) or null when unavailable. */
  heading?: number | null
  latitude?: number
  longitude?: number
  /** GPS horizontal accuracy (m); null/undefined when unknown. */
  accuracy?: number | null
}

export interface HeadingConfig {
  /** Minimum movement (m) before bearing is trusted. */
  minMovementMeters: number
  /** Max smoothing step per update (deg). */
  maxStepDeg: number
  /** Above this accuracy (m) the map refuses to rotate. */
  poorAccuracyMeters: number
}

export interface HeadingResolution {
  /** Best heading right now (deg) or null when nothing is known yet. */
  heading: number | null
  /** Whether the device reported a real heading in this update. */
  fromDevice: boolean
}

const DEFAULT_CONFIG: HeadingConfig = {
  minMovementMeters: 8,
  maxStepDeg: 18,
  poorAccuracyMeters: 250,
}

export interface HeadingState {
  heading: number | null
  lastPosition: { latitude: number; longitude: number } | null
}

/**
 * Pure bearing between two fixes — exported for tests. Uses the existing
 * haversine-capable helper from the live-map routing module.
 */
export function movementBearing(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  return bearingBetween([a.latitude, a.longitude], [b.latitude, b.longitude])
}

function distanceBetween(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const R = 6_371_000
  const dLat = toRad(b.latitude - a.latitude)
  const dLng = toRad(b.longitude - a.longitude)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

function wrap(deg: number): number {
  return ((deg % 360) + 360) % 360
}

function approach(from: number | null, to: number, maxStepDeg: number): number {
  if (from === null) return wrap(to)
  let delta = (to - from) % 360
  if (delta > 180) delta -= 360
  if (delta < -180) delta += 360
  return wrap(from + Math.max(-maxStepDeg, Math.min(maxStepDeg, delta)))
}

/**
 * One-shot heading resolution. Feed the previous resolver output back via
 * `state` to hold/smooth heading between updates.
 */
export function resolveHeading(
  state: HeadingState,
  sample: HeadingSample,
  config: HeadingConfig = DEFAULT_CONFIG,
): { state: HeadingState; result: HeadingResolution } {
  const accuracy = sample.accuracy
  const poorAccuracy =
    accuracy !== null && accuracy !== undefined && Number.isFinite(accuracy) &&
    accuracy > config.poorAccuracyMeters

  let target: number | null = null
  let fromDevice = false

  if (typeof sample.heading === 'number' && Number.isFinite(sample.heading)) {
    target = sample.heading
    fromDevice = true
  } else if (
    state.lastPosition &&
    sample.latitude !== undefined &&
    sample.longitude !== undefined &&
    !poorAccuracy
  ) {
    const moved = distanceBetween(state.lastPosition, {
      latitude: sample.latitude,
      longitude: sample.longitude,
    })
    if (moved >= config.minMovementMeters) {
      target = movementBearing(state.lastPosition, {
        latitude: sample.latitude,
        longitude: sample.longitude,
      })
    }
  }

  // A poor fix never rotates the marker — hold the last known heading.
  const next = poorAccuracy ? state.heading : target !== null ? approach(state.heading, target, config.maxStepDeg) : state.heading

  return {
    state: {
      heading: next,
      lastPosition:
        sample.latitude !== undefined && sample.longitude !== undefined
          ? { latitude: sample.latitude, longitude: sample.longitude }
          : state.lastPosition,
    },
    result: { heading: next, fromDevice },
  }
}