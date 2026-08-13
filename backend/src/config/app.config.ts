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
}
