import type { NormalizedRoute } from '../navigation/interfaces/routing-response.interface';

/**
 * Cache abstraction for normalized routes. The routing service depends on this
 * interface — never on Redis directly — so the storage engine can be swapped
 * (Redis in production, in-memory in single-instance dev) without touching the
 * caller.
 */
export interface RouteCache {
  get(key: string): Promise<NormalizedRoute | null>;
  set(key: string, route: NormalizedRoute, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  /** Drop every cached route (test/debug + destination-change invalidation). */
  clear(): Promise<void>;
}

/**
 * Deterministic route cache key. Coordinates are normalized with a fixed
 * precision (toFixed(5), ~1.1 m) so that nearly-identical origins/destinations
 * share a cache entry instead of fragmenting it — a rider's GPS jitters a few
 * metres between ticks, which would otherwise defeat the cache.
 *
 * Key layout: `route:originLng,originLat:destLng,destLat`
 */
export function buildRouteCacheKey(
  originLng: number,
  originLat: number,
  destLng: number,
  destLat: number,
): string {
  return `route:${originLng.toFixed(5)},${originLat.toFixed(5)}:${destLng.toFixed(5)},${destLat.toFixed(5)}`;
}
