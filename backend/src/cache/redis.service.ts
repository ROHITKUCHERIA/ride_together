import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfig } from '../config/app.config';

/**
 * Minimal Redis client backed byNode access to `ioredis`. Kept deliberately
 * narrow so the rest of the app depends on this abstraction, never on a
 * specific Redis library.
 *
 * When REDIS_URL is unset, every operation degrades gracefully (returns null /
 * false / no-op) so the app works identically in single-instance local dev —
 * the in-memory RouteCache and in-memory cooldown simply take over.
 */
export interface RedisAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  setNx(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  delete(key: string): Promise<void>;
  readonly enabled: boolean;
}

@Injectable()
export class RedisService implements RedisAdapter, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;

  constructor(private readonly config: AppConfig) {
    const url = config.redisUrl;
    if (!url) {
      this.logger.warn(
        'REDIS_URL not set — using in-memory fallbacks for cache/cooldown.',
      );
      return;
    }
    try {
      this.client = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 2,
        retryStrategy: (times) => Math.min(times * 200, 2000),
      });
      void this.client.connect().catch((err: unknown) => {
        this.logger.warn(
          `Redis connect failed (falling back to memory): ${String(err)}`,
        );
      });
    } catch (err) {
      this.logger.warn(
        `Redis unavailable (falling back to memory): ${String(err)}`,
      );
      this.client = null;
    }
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    try {
      return await this.client.get(key);
    } catch (err) {
      this.logger.warn(`Redis get failed: ${String(err)}`);
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } catch (err) {
      this.logger.warn(`Redis set failed: ${String(err)}`);
    }
  }

  async setNx(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    if (!this.client) return true; // no Redis → caller uses in-memory fallback
    try {
      const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch (err) {
      this.logger.warn(`Redis setNx failed: ${String(err)}`);
      return true;
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.del(key);
    } catch (err) {
      this.logger.warn(`Redis delete failed: ${String(err)}`);
    }
  }

  onModuleDestroy(): Promise<void> {
    if (this.client) {
      try {
        this.client.disconnect();
      } catch {
        /* noop */
      }
      this.client = null;
    }
    return Promise.resolve();
  }
}
