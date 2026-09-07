import type { NormalizedRoute } from '../navigation/interfaces/routing-response.interface';
import type { RouteCache } from './route-cache.interface';

interface MemoryEntry {
  route: NormalizedRoute;
  expiresAtMs: number;
}

/**
 * Process-local route cache with TTL. Used as the fallback/test double for the
 * `RouteCache` abstraction (RedisRouteCache keeps its own internal memory map
 * for the degraded mode, but services never depend on the implementation).
 */
export class InMemoryRouteCache implements RouteCache {
  private readonly map = new Map<string, MemoryEntry>();

  get(key: string): Promise<NormalizedRoute | null> {
    const entry = this.map.get(key);
    if (!entry) return Promise.resolve(null);
    if (Date.now() >= entry.expiresAtMs) {
      this.map.delete(key);
      return Promise.resolve(null);
    }
    return Promise.resolve(entry.route);
  }

  set(key: string, route: NormalizedRoute, ttlSeconds: number): Promise<void> {
    this.map.set(key, {
      route,
      expiresAtMs: Date.now() + ttlSeconds * 1000,
    });
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.map.delete(key);
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.map.clear();
    return Promise.resolve();
  }
}
