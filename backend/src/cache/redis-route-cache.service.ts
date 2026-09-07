import { Injectable, Logger } from '@nestjs/common';
import type { NormalizedRoute } from '../navigation/interfaces/routing-response.interface';
import { RedisService } from './redis.service';
import type { RouteCache } from './route-cache.interface';

const CACHE_PREFIX = 'rt:route:';

interface MemoryEntry {
  route: NormalizedRoute;
  expiresAtMs: number;
}

/**
 * Redis-backed route cache with an in-memory fallback. When Redis is
 * unavailable (or unconfigured) it transparently degrades to a process-local
 * Map so the routing service keeps working in single-instance dev/CI.
 */
@Injectable()
export class RedisRouteCache implements RouteCache {
  private readonly logger = new Logger(RedisRouteCache.name);
  private readonly memory = new Map<string, MemoryEntry>();

  constructor(private readonly redis: RedisService) {}

  async get(key: string): Promise<NormalizedRoute | null> {
    const mem = this.memory.get(key);
    if (mem) {
      if (Date.now() < mem.expiresAtMs) return mem.route;
      this.memory.delete(key);
    }
    if (!this.redis.enabled) return null;
    try {
      const raw = await this.redis.get(CACHE_PREFIX + key);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as NormalizedRoute;
      } catch {
        this.logger.warn('Route cache contains invalid JSON.');
        return null;
      }
    } catch {
      return null;
    }
  }

  async set(
    key: string,
    route: NormalizedRoute,
    ttlSeconds: number,
  ): Promise<void> {
    this.memory.set(key, {
      route,
      expiresAtMs: Date.now() + ttlSeconds * 1000,
    });
    if (!this.redis.enabled) return;
    try {
      await this.redis.set(
        CACHE_PREFIX + key,
        JSON.stringify(route),
        ttlSeconds,
      );
    } catch {
      /* memory entry still serves this request */
    }
  }

  async delete(key: string): Promise<void> {
    this.memory.delete(key);
    if (!this.redis.enabled) return;
    try {
      await this.redis.delete(CACHE_PREFIX + key);
    } catch {
      /* noop */
    }
  }

  clear(): Promise<void> {
    this.memory.clear();
    // Redis keys expire on their own TTL; the memory map is the only thing we
    // can clear synchronously without a SCAN/DEL pass.
    return Promise.resolve();
  }
}
