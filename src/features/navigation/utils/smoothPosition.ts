import { interpolatePosition } from '../../live-map/utils/geo'

/**
 * Lightweight visual-position smoother. Raw GPS feeds jittery fixes
 * (17.3850 → 17.3857 → 17.3848 …); this slides a *visual* marker toward each
 * new fix with time-based easing while the raw value (used for backend/group
 * tracking) passes through untouched.
 */

export interface SmoothSample {
  latitude: number
  longitude: number
  heading?: number | null
}

export interface SmoothResult {
  latitude: number
  longitude: number
  /** Eased heading, when known. */
  heading: number | null
  /** Easing progress in [0,1) for this frame (0 = snap, near 1 = settled). */
  progress: number
}

export interface SmoothConfig {
  /** Visual marker covers this fraction of the gap toward the target per frame. */
  factor: number
}

const DEFAULT_CONFIG: SmoothConfig = { factor: 0.25 }

/**
 * Returns the eased position after advancing one frame toward `target`, plus
 * the easing progress. Feed the previous smoothed value back as `current`.
 * Heading eases toward the new heading with the same factor.
 */
export function advanceVisualPosition(
  current: SmoothSample | null,
  target: SmoothSample,
  config: SmoothConfig = DEFAULT_CONFIG,
): SmoothResult {
  if (current === null) {
    return {
      latitude: target.latitude,
      longitude: target.longitude,
      heading: typeof target.heading === 'number' ? target.heading : null,
      progress: 1,
    }
  }

  const eased = interpolatePosition(
    current.latitude,
    current.longitude,
    target.latitude,
    target.longitude,
    config.factor,
  )

  let heading: number | null = null
  if (typeof target.heading === 'number' && typeof current.heading === 'number') {
    heading = current.heading + shortestAngleDelta(current.heading, target.heading) * config.factor
    heading = ((heading % 360) + 360) % 360
  } else if (typeof target.heading === 'number') {
    heading = target.heading
  } else {
    heading = current.heading ?? null
  }

  const dLat = target.latitude - eased.lat
  const dLng = target.longitude - eased.lng
  const settled = Math.abs(dLat) < 1e-7 && Math.abs(dLng) < 1e-7
  return {
    latitude: eased.lat,
    longitude: eased.lng,
    heading,
    progress: settled ? 1 : 0,
  }
}

function shortestAngleDelta(from: number, to: number): number {
  let d = (to - from) % 360
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return d
}

/**
 * Convenience for the marker: a per-mount tracker holding the smoothed value so
 * the marker component can re-render at animation-frame rate without touching
 * the navigation store.
 */
export class VisualPositionSmoother {
  private current: SmoothSample | null = null
  private readonly config: SmoothConfig

  constructor(config: SmoothConfig = DEFAULT_CONFIG) {
    this.config = config
  }

  /** Snap to a fresh fix when a new route/session starts. */
  snapTo(sample: SmoothSample): void {
    this.current = { ...sample }
  }

  /** Advance one frame toward `target` (time-based from requestAnimationFrame). */
  next(target: SmoothSample): SmoothResult {
    const result = advanceVisualPosition(this.current, target, this.config)
    this.current = { latitude: result.latitude, longitude: result.longitude, heading: result.heading }
    return result
  }

  /** Current smoothed value (null before the first target). */
  value(): SmoothSample | null {
    return this.current
  }
}