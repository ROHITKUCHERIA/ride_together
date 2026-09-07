import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { RedisRouteCache } from './redis-route-cache.service';
import { RerouteCooldownService } from './reroute-cooldown.service';
import { ROUTE_CACHE } from './tokens';

/**
 * Global infrastructure module: Redis connectivity plus the cache/cooldown
 * abstractions the routing and navigation services depend on. Everything
 * degrades gracefully to in-memory when Redis is not configured.
 */
@Global()
@Module({
  providers: [
    RedisService,
    { provide: ROUTE_CACHE, useClass: RedisRouteCache },
    RerouteCooldownService,
  ],
  exports: [RedisService, ROUTE_CACHE, RerouteCooldownService],
})
export class CacheModule {}

export type { RouteCache } from './tokens';
export { ROUTE_CACHE } from './tokens';
