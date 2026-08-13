/**
 * Rider presence, derived entirely from the age of lastUpdatedAt — never
 * stored (the spec: do not persist status if it can be derived).
 */
export const RiderStatus = {
  LIVE: 'LIVE',
  DELAYED: 'DELAYED',
  OFFLINE: 'OFFLINE',
} as const;

export type RiderStatus = (typeof RiderStatus)[keyof typeof RiderStatus];

/**
 * @param ageMs age of the last location fix in milliseconds
 * @param liveThresholdMs younger than this -> LIVE
 * @param delayedThresholdMs between live and this -> DELAYED
 * @returns OFFLINE when older than delayedThresholdMs
 */
export function computeRiderStatus(
  ageMs: number,
  liveThresholdMs: number,
  delayedThresholdMs: number,
): RiderStatus {
  if (ageMs < 0) return RiderStatus.LIVE; // small clock skew — treat as fresh
  if (ageMs < liveThresholdMs) return RiderStatus.LIVE;
  if (ageMs < delayedThresholdMs) return RiderStatus.DELAYED;
  return RiderStatus.OFFLINE;
}
