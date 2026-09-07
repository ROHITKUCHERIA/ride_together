import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ErrorCodes } from '../common/constants/error-codes';
import { ApiException } from '../common/filters/all-exceptions.filter';
import { AppConfig } from '../config/app.config';
import {
  NormalizedRoute,
  RouteCoordinate,
} from './interfaces/routing-response.interface';
import { parseOsrmSteps, OsmStep } from './maneuver.utils';
import { ROUTE_CACHE } from '../cache/tokens';
import type { RouteCache } from '../cache/tokens';
import { buildRouteCacheKey } from '../cache/route-cache.interface';

const CACHE_PROVIDER = 'osrm';

interface OsmRouteResponse {
  code: string;
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: { coordinates?: Array<[number, number]> };
    legs?: Array<{ steps?: OsmStep[] }>;
  }>;
}

/**
 * Calculates driving routes through a configured, provider-agnostic routing
 * engine. Phase 1 ships the `osrm` provider; swapping the engine (GraphHopper,
 * self-hosted OSRM, …) only means pointing ROUTING_API_URL at it (or adding a
 * new provider branch here) — the API surface never changes.
 *
 * API keys stay server-side: the frontend only ever talks to this service.
 *
 * Phase 3: normalized routes are cached behind the `RouteCache` abstraction
 * (Redis-backed in production, in-memory fallback in single-instance dev). The
 * cache key is deterministic and coordinate-normalized (see
 * `buildRouteCacheKey`) so GPS jitter does not fragment the cache.
 */
@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  constructor(
    private readonly config: AppConfig,
    @Inject(ROUTE_CACHE) private readonly cache: RouteCache,
  ) {}

  async calculateRoute(
    origin: RouteCoordinate,
    destination: RouteCoordinate,
  ): Promise<NormalizedRoute> {
    switch (this.config.routingProvider.toLowerCase()) {
      case 'osrm':
        return this.calculateOsrm(origin, destination);
      default:
        throw new ApiException(
          HttpStatus.SERVICE_UNAVAILABLE,
          `Routing provider "${this.config.routingProvider}" is not supported.`,
          ErrorCodes.ROUTING_PROVIDER_UNSUPPORTED,
        );
    }
  }

  /** No sensitive data here — coords are normalized, provider is fixed. */
  private cacheKey(
    origin: RouteCoordinate,
    destination: RouteCoordinate,
  ): string {
    return `${CACHE_PROVIDER}:${buildRouteCacheKey(
      origin.longitude,
      origin.latitude,
      destination.longitude,
      destination.latitude,
    )}`;
  }

  private async calculateOsrm(
    origin: RouteCoordinate,
    destination: RouteCoordinate,
  ): Promise<NormalizedRoute> {
    const key = this.cacheKey(origin, destination);
    const ttlSeconds = this.config.navigationRouteCacheTtlSeconds;
    const cached = await this.cache.get(key);
    if (cached) {
      this.logger.log(`route_cache_hit key=${key}`);
      return cached;
    }
    this.logger.log(`route_cache_miss key=${key}`);

    const coords = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
    const url = `${this.config.routingApiUrl}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`;

    this.logger.log(`route_requested provider=${CACHE_PROVIDER} key=${key}`);

    let json: OsmRouteResponse;
    try {
      const res = await this.fetchWithTimeout(
        url,
        this.config.routingTimeoutMs,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      json = (await res.json()) as OsmRouteResponse;
    } catch (err) {
      this.logger.warn(
        `route_failed reason=${String(err)} provider=${CACHE_PROVIDER}`,
      );
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'The routing service is unavailable. Try again in a moment.',
        ErrorCodes.ROUTING_UNAVAILABLE,
      );
    }

    const route = json.routes?.[0];
    const geometry = route?.geometry?.coordinates;
    const distanceMeters = route?.distance;
    const durationSeconds = route?.duration;
    if (
      json.code !== 'Ok' ||
      !geometry ||
      geometry.length < 2 ||
      typeof distanceMeters !== 'number' ||
      typeof durationSeconds !== 'number'
    ) {
      throw new ApiException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'No route could be found between these points. Try another destination.',
        ErrorCodes.ROUTE_NOT_FOUND,
      );
    }

    const steps = route?.legs?.flatMap((leg) => leg.steps ?? []) ?? [];

    const normalized: NormalizedRoute = {
      coordinates: geometry.map(([lng, lat]) => ({
        latitude: lat,
        longitude: lng,
      })),
      distanceMeters,
      durationSeconds,
      geometry,
      instructions: parseOsrmSteps(steps),
    };

    await this.cache.set(key, normalized, ttlSeconds);
    return normalized;
  }

  /** Test/debug helper — clears cached routes so a retry re-fetches. */
  async clearCache(): Promise<void> {
    await this.cache.clear();
  }

  private async fetchWithTimeout(
    url: string,
    timeoutMs: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
