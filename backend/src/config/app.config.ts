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
}
