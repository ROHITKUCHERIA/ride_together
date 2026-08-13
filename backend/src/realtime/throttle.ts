/**
 * Minimal in-memory per-rider update throttle. Single-instance only (no Redis
 * in Phase 2); swap for a shared store when scaling horizontally.
 */
export class LocationThrottle {
  private readonly lastAccepted = new Map<string, number>();

  constructor(private readonly minIntervalMs: number) {}

  /**
   * Returns true when the update for `key` is allowed. Rejected updates do
   * not advance the window, so spamming stays rejected until the interval
   * has elapsed.
   */
  allow(key: string, now = Date.now()): boolean {
    const prev = this.lastAccepted.get(key);
    if (prev !== undefined && now - prev < this.minIntervalMs) {
      return false;
    }
    this.lastAccepted.set(key, now);
    return true;
  }

  reset(key: string): void {
    this.lastAccepted.delete(key);
  }
}
