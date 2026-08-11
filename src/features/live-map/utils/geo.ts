const EARTH_RADIUS_M = 6_371_000

/** Haversine great-circle distance in meters between two lat/lng points. */
export function calculateDistanceInMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(s))
}

/** Clamp a value into an inclusive range. */
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/**
 * Smooth linear interpolation between two geo points with easing.
 * `t` is a progress in [0, 1].
 */
export function interpolatePosition(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  t: number,
): { lat: number; lng: number } {
  const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
  return {
    lat: fromLat + (toLat - fromLat) * eased,
    lng: fromLng + (toLng - fromLng) * eased,
  }
}

/** Shortest closed-window angular delta between two headings, degrees. */
export function headingDeltaDeg(from: number, to: number): number {
  let d = (to - from) % 360
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return d
}

/** Rotate `from` heading toward `to` by at most `maxStepDeg`, normalized to [0, 360). */
export function interpolateHeading(from: number, to: number, maxStepDeg: number): number {
  const delta = headingDeltaDeg(from, to)
  const next = from + clamp(delta, -maxStepDeg, maxStepDeg)
  return ((next % 360) + 360) % 360
}
