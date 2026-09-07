import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Typed access to environment configuration. Secrets are read from
 * process.env via ConfigService — never hardcoded, never logged.
 */
@Injectable()
export class AppConfig {
  constructor(private readonly config: ConfigService) {}

  get nodeEnv(): string {
    return this.config.get<string>('NODE_ENV') ?? 'development';
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get port(): number {
    return Number(this.config.get<string>('PORT') ?? 3000);
  }

  get frontendUrl(): string {
    return this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
  }

  get databaseUrl(): string {
    return this.config.get<string>('DATABASE_URL') ?? '';
  }

  get jwtAccessSecret(): string {
    return this.config.get<string>('JWT_ACCESS_SECRET') ?? '';
  }

  get jwtRefreshSecret(): string {
    return this.config.get<string>('JWT_REFRESH_SECRET') ?? '';
  }

  get jwtAccessExpiresIn(): string {
    return this.config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m';
  }

  get jwtRefreshExpiresIn(): string {
    return this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';
  }

  get refreshHashPepper(): string {
    return this.config.get<string>('REFRESH_HASH_PEPPER') ?? '';
  }

  // ---------- realtime / GPS ----------

  /** Redis connection string. Empty disables Redis (in-memory fallbacks are
   *  used for the route cache and the distributed reroute cooldown). */
  get redisUrl(): string {
    return this.config.get<string>('REDIS_URL') ?? '';
  }

  /** Minimum interval between accepted GPS updates per rider (ms). */
  get locationUpdateMinIntervalMs(): number {
    return Number(
      this.config.get<string>('LOCATION_UPDATE_MIN_INTERVAL_MS') ?? 3000,
    );
  }

  /** Rider is LIVE when lastUpdatedAt is newer than this (ms). */
  get riderLiveThresholdMs(): number {
    return Number(this.config.get<string>('RIDER_LIVE_THRESHOLD_MS') ?? 15000);
  }

  /** Rider is DELAYED when lastUpdatedAt is between live and this (ms). */
  get riderDelayedThresholdMs(): number {
    return Number(
      this.config.get<string>('RIDER_DELAYED_THRESHOLD_MS') ?? 60000,
    );
  }

  /** Reject timestamps older than this many ms (stale GPS). */
  get locationMaxAgeMs(): number {
    return Number(this.config.get<string>('LOCATION_MAX_AGE_MS') ?? 300000);
  }

  /** Reject timestamps more than this many ms in the future. */
  get locationMaxFutureMs(): number {
    return Number(this.config.get<string>('LOCATION_MAX_FUTURE_MS') ?? 30000);
  }

  // ---------- navigation / routing ----------

  /** Routing provider id. Only `osrm` is implemented in Phase 1. */
  get routingProvider(): string {
    return this.config.get<string>('ROUTING_PROVIDER') ?? 'osrm';
  }

  /** Base URL of the routing engine. Point at a self-hosted server to replace
   *  the public OSRM endpoint — the frontend never sees this URL. */
  get routingApiUrl(): string {
    return (
      this.config.get<string>('ROUTING_API_URL') ??
      'https://router.project-osrm.org'
    );
  }

  /** Per-request timeout for the routing engine (ms). */
  get routingTimeoutMs(): number {
    return Number(this.config.get<string>('ROUTING_TIMEOUT_MS') ?? 10_000);
  }

  /** How long a normalized route stays usable in the backend cache (s). */
  get navigationRouteCacheTtlSeconds(): number {
    return Number(
      this.config.get<string>('NAVIGATION_ROUTE_CACHE_TTL_SECONDS') ?? 300,
    );
  }

  /** Window in which `route` requests are counted for rate limiting (ms). */
  get navigationRouteThrottleTtlMs(): number {
    return Number(
      this.config.get<string>('NAVIGATION_ROUTE_THROTTLE_TTL_MS') ?? 60_000,
    );
  }

  /** Max `route` requests allowed per throttle window per user/IP. */
  get navigationRouteThrottleLimit(): number {
    return Number(
      this.config.get<string>('NAVIGATION_ROUTE_THROTTLE_LIMIT') ?? 20,
    );
  }

  /** Window in which `geocode` requests are counted for rate limiting (ms). */
  get navigationGeocodeThrottleTtlMs(): number {
    return Number(
      this.config.get<string>('NAVIGATION_GEOCODE_THROTTLE_TTL_MS') ?? 60_000,
    );
  }

  /** Max `geocode` requests allowed per throttle window per user/IP. */
  get navigationGeocodeThrottleLimit(): number {
    return Number(
      this.config.get<string>('NAVIGATION_GEOCODE_THROTTLE_LIMIT') ?? 30,
    );
  }

  /** Geocoding provider id. Only `nominatim` is implemented in Phase 1. */
  get geocodingProvider(): string {
    return this.config.get<string>('GEOCODING_PROVIDER') ?? 'nominatim';
  }

  /** Base URL of the OSM Nominatim-compatible geocoder. */
  get geocodingApiUrl(): string {
    return (
      this.config.get<string>('GEOCODING_API_URL') ??
      'https://nominatim.openstreetmap.org'
    );
  }

  /** Per-request timeout for the geocoder (ms). */
  get geocodingTimeoutMs(): number {
    return Number(this.config.get<string>('GEOCODING_TIMEOUT_MS') ?? 10_000);
  }

  // ---------- group navigation / sessions ----------

  /** Distributed reroute cooldown: the minimal gap (s) between two reroutes for
   *  the same rider+trip, enforced with a short-lived Redis key when available
   *  (in-memory fallback otherwise). */
  get navigationRerouteCooldownSeconds(): number {
    return Number(
      this.config.get<string>('NAVIGATION_REROUTE_COOLDOWN_SECONDS') ?? 15,
    );
  }

  /** Minimum gap (ms) between two accepted navigation-status updates per rider
   *  — protects the room from a navigation recalculating on every GPS tick. */
  get navigationStatusMinIntervalMs(): number {
    return Number(
      this.config.get<string>('NAVIGATION_STATUS_MIN_INTERVAL_MS') ?? 5000,
    );
  }

  /** Window in which navigation-status updates are counted for rate limiting. */
  get navigationStatusThrottleTtlMs(): number {
    return Number(
      this.config.get<string>('NAVIGATION_STATUS_THROTTLE_TTL_MS') ?? 60_000,
    );
  }

  /** Max navigation-status updates allowed per throttle window per user. */
  get navigationStatusThrottleLimit(): number {
    return Number(
      this.config.get<string>('NAVIGATION_STATUS_THROTTLE_LIMIT') ?? 60,
    );
  }

  /** Window in which destination mutations are counted for rate limiting. */
  get navigationDestinationThrottleTtlMs(): number {
    return Number(
      this.config.get<string>('NAVIGATION_DESTINATION_THROTTLE_TTL_MS') ??
        60_000,
    );
  }

  /** Max destination mutations allowed per throttle window per user. */
  get navigationDestinationThrottleLimit(): number {
    return Number(
      this.config.get<string>('NAVIGATION_DESTINATION_THROTTLE_LIMIT') ?? 30,
    );
  }

  /** How far in the past a navigation session may sit before it is treated as
   *  stale in the group snapshot (ms). */
  get navigationSessionStaleAfterMs(): number {
    return Number(
      this.config.get<string>('NAVIGATION_SESSION_STALE_AFTER_MS') ??
        30 * 60_000,
    );
  }

  // ---------- YouTube Music ----------

  /** Official YouTube Data API v3 key. NEVER exposed to the frontend. */
  get youtubeApiKey(): string {
    return this.config.get<string>('YOUTUBE_API_KEY') ?? '';
  }

  /** How long search results stay in the in-memory cache (ms). */
  get youtubeSearchCacheTtlMs(): number {
    return Number(
      this.config.get<string>('YOUTUBE_SEARCH_CACHE_TTL_MS') ?? 15 * 60_000,
    );
  }

  /** Default number of results per YouTube search page. */
  get youtubeSearchMaxResults(): number {
    return Number(this.config.get<string>('YOUTUBE_SEARCH_MAX_RESULTS') ?? 10);
  }

  /** Soft cap on search query length (chars) after trimming. */
  get youtubeSearchMaxQueryLength(): number {
    return Number(
      this.config.get<string>('YOUTUBE_SEARCH_MAX_QUERY_LENGTH') ?? 200,
    );
  }
}
