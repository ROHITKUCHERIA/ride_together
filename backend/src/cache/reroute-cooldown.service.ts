import { Injectable } from '@nestjs/common';
import { RedisService } from './redis.service';

const COOLDOWN_PREFIX = 'rt:reroute-cooldown:';

interface MemoryEntry {
  untilMs: number;
  requestId: string;
}

/**
 * Distributed reroute cooldown. Uses a short-lived Redis key to prevent multiple
 * processes/devices from triggering duplicate reroutes for the same rider+trip
 * within the cooldown window. When Redis is unavailable it degrades to an
 * in-memory map (single-instance) so behaviour is preserved in dev.
 */
@Injectable()
export class RerouteCooldownService {
  private readonly memory = new Map<string, MemoryEntry>();
  // A local GC sweep so the in-memory map never leaks entries for departed
  // riders/trips.
  private lastSweepMs = 0;

  constructor(private readonly redis: RedisService) {}

  /**
   * Try to acquire the reroute lock for a rider on a trip.
   * @returns the requestId on success, null when a reroute is already in
   *          progress / cooled down.
   */
  async tryAcquire(
    tripId: string,
    userId: string,
    requestId: string,
    cooldownSeconds: number,
  ): Promise<boolean> {
    this.sweepMemory();
    const key = COOLDOWN_PREFIX + `${tripId}:${userId}`;

    if (this.redis.enabled) {
      const acquired = await this.redis.setNx(key, requestId, cooldownSeconds);
      if (acquired) return true;
      // Lock exists — check whether it is the same request (idempotent retry)
      // so concurrent calls carrying the same requestId can proceed.
      const existing = await this.redis.get(key);
      return existing === requestId;
    }

    // In-memory fallback.
    const now = Date.now();
    const mem = this.memory.get(key);
    if (mem && mem.untilMs > now) {
      return mem.requestId === requestId;
    }
    this.memory.set(key, { untilMs: now + cooldownSeconds * 1000, requestId });
    return true;
  }

  /** Release the lock early (e.g. explicit navigation stop). */
  async release(
    tripId: string,
    userId: string,
    requestId: string,
  ): Promise<void> {
    const key = COOLDOWN_PREFIX + `${tripId}:${userId}`;
    if (this.redis.enabled) {
      const existing = await this.redis.get(key);
      if (existing === requestId) await this.redis.delete(key);
      return;
    }
    const mem = this.memory.get(key);
    if (mem && mem.requestId === requestId) this.memory.delete(key);
  }

  private sweepMemory(now = Date.now()): void {
    if (now - this.lastSweepMs < 30_000) return;
    this.lastSweepMs = now;
    for (const [key, entry] of this.memory) {
      if (entry.untilMs <= now) this.memory.delete(key);
    }
  }
}
