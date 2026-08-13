/**
 * Pure, reusable spatial helpers. Phase 2 uses haversine distance in JS;
 * the same functions can be backed by PostGIS (ST_DWithin / ST_Distance) for
 * group-split, nearest-rider and geofencing later without changing callers.
 */

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_METERS = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two points in meters. */
export function distanceBetweenMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) *
      Math.cos(toRad(b.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

export interface NearestResult<T> {
  rider: T;
  distanceMeters: number;
}

/** The closest rider to `anchor`, or null when none provided. */
export function nearestRider<T extends GeoPoint>(
  anchor: GeoPoint,
  riders: T[],
): NearestResult<T> | null {
  let best: NearestResult<T> | null = null;
  for (const rider of riders) {
    const d = distanceBetweenMeters(anchor, rider);
    if (!best || d < best.distanceMeters) best = { rider, distanceMeters: d };
  }
  return best;
}

/** Riders whose distance from `center` is <= radiusMeters. */
export function ridersWithinRadius<T extends GeoPoint>(
  center: GeoPoint,
  riders: T[],
  radiusMeters: number,
): T[] {
  return riders.filter((r) => distanceBetweenMeters(center, r) <= radiusMeters);
}

export type GroupHealth = 'together' | 'spreading' | 'split';

export interface GroupSplitResult<T> {
  health: GroupHealth;
  /** Riders considered "split away" (beyond the split threshold). */
  splitRiders: T[];
  /** Furthest rider from the anchor. */
  farthest: NearestResult<T> | null;
}

/**
 * Group-split detection against an anchor rider:
 * - spread <= spreadingThreshold -> together
 * - spread <= splitThreshold     -> spreading
 * - spread >  splitThreshold     -> split (farthest riders reported)
 */
export function detectGroupSplit<T extends GeoPoint>(
  anchor: GeoPoint,
  riders: T[],
  opts: { spreadingThresholdMeters: number; splitThresholdMeters: number },
): GroupSplitResult<T> {
  const distances = riders
    .map((rider) => ({
      rider,
      distanceMeters: distanceBetweenMeters(anchor, rider),
    }))
    .sort((x, y) => y.distanceMeters - x.distanceMeters);

  const farthest = distances[0] ?? null;
  const spread = farthest?.distanceMeters ?? 0;

  let health: GroupHealth = 'together';
  if (spread > opts.splitThresholdMeters) {
    health = 'split';
  } else if (spread > opts.spreadingThresholdMeters) {
    health = 'spreading';
  }

  const splitRiders =
    health === 'split'
      ? distances
          .filter((d) => d.distanceMeters > opts.splitThresholdMeters)
          .map((d) => d.rider)
      : [];

  return { health, splitRiders, farthest };
}
