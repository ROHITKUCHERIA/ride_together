import { createHmac, randomBytes } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../config/app.config';
import { RegisterDto } from './dto/register.dto';
import { AuthTokens, PublicUser } from './types/auth.types';
import { ApiException } from '../common/filters/all-exceptions.filter';
import { ErrorCodes } from '../common/constants/error-codes';

const BCRYPT_ROUNDS = 12;
const TOKEN_BYTES = 48;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
  ) {}

  async register(dto: RegisterDto): Promise<{ user: PublicUser } & AuthTokens> {
    const email = dto.email.trim().toLowerCase();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'An account with this email already exists.',
        ErrorCodes.EMAIL_ALREADY_EXISTS,
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    // The refresh token is generated up front and stored (hashed) in the same
    // transaction as the user, so user + initial session are atomic.
    const refreshToken = this.generateToken();

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: dto.name.trim(),
          email,
          passwordHash,
        },
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
          createdAt: true,
        },
      });

      await tx.refreshToken.create({
        data: {
          userId: created.id,
          tokenHash: this.hashToken(refreshToken),
          expiresAt: this.refreshExpiry(),
        },
      });

      return created;
    });

    await this.pruneExpiredSessions(user.id);

    const accessToken = await this.signAccessToken(user.id);
    return { user, accessToken, refreshToken };
  }

  async login(emailRaw: string, password: string): Promise<AuthTokens> {
    const email = emailRaw.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true },
    });

    const valid = user && (await bcrypt.compare(password, user.passwordHash));

    // Generic error — never reveal whether the email or password was wrong.
    if (!valid) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'Invalid email or password.',
        ErrorCodes.INVALID_CREDENTIALS,
      );
    }

    return this.issueTokens(user.id);
  }

  async getMe(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        createdAt: true,
      },
    });
    if (!user) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'User not found.',
        ErrorCodes.USER_NOT_FOUND,
      );
    }
    return user;
  }

  /**
   * Refreshes an access token. The submitted refresh token is validated
   * purely against the stored hash (opaque token, never a JWT) and its
   * expiry/revocation state. On success the old session is atomically
   * revoked (rotation) and a new session + token pair is issued.
   *
   * Reuse of a revoked token is rejected (token family detection). The
   * conditional revoke makes the rotation race-safe: two concurrent
   * refreshes with the same token can never both succeed.
   */
  async refresh(rawToken: string): Promise<AuthTokens> {
    const tokenHash = this.hashToken(rawToken);

    const session = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!session) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'Invalid or expired refresh token.',
        ErrorCodes.INVALID_REFRESH_TOKEN,
      );
    }

    // A revoked token that is reused is always rejected.
    if (session.revokedAt) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'Invalid or expired refresh token.',
        ErrorCodes.REFRESH_TOKEN_REUSED,
      );
    }

    if (session.expiresAt.getTime() < Date.now()) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'Invalid or expired refresh token.',
        ErrorCodes.INVALID_REFRESH_TOKEN,
      );
    }

    const newToken = this.generateToken();
    const newHash = this.hashToken(newToken);
    const newExpiresAt = this.refreshExpiry();

    await this.prisma.$transaction(async (tx) => {
      // Claim the session atomically. If a concurrent request already
      // revoked it, count === 0 and the reuse is rejected.
      const claimed = await tx.refreshToken.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new ApiException(
          HttpStatus.UNAUTHORIZED,
          'Invalid or expired refresh token.',
          ErrorCodes.REFRESH_TOKEN_REUSED,
        );
      }

      const replacement = await tx.refreshToken.create({
        data: {
          userId: session.userId,
          tokenHash: newHash,
          expiresAt: newExpiresAt,
        },
      });

      // Link the revoked session to its replacement (token family chain).
      await tx.refreshToken.update({
        where: { id: session.id },
        data: { replacedById: replacement.id },
      });
    });

    await this.pruneExpiredSessions(session.userId);

    const accessToken = await this.signAccessToken(session.userId);
    return { accessToken, refreshToken: newToken };
  }

  /** Revokes the given refresh token (logout). */
  async logout(rawToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Revokes every active session for a user (future "logout everywhere"). */
  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // ---------- internals ----------

  private async issueTokens(userId: string): Promise<AuthTokens> {
    const accessToken = await this.signAccessToken(userId);
    const refreshToken = this.generateToken();
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: this.refreshExpiry(),
      },
    });
    await this.pruneExpiredSessions(userId);
    return { accessToken, refreshToken };
  }

  /** Removes expired sessions so the table does not grow unbounded. */
  private async pruneExpiredSessions(userId: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({
      where: { userId, expiresAt: { lt: new Date() } },
    });
  }

  private signAccessToken(userId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, type: 'access' },
      {
        secret: this.config.jwtAccessSecret,
        expiresIn: this.config
          .jwtAccessExpiresIn as unknown as JwtSignOptions['expiresIn'],
      },
    );
  }

  private refreshExpiry(): Date {
    const ms = msFromDuration(this.config.jwtRefreshExpiresIn);
    return new Date(Date.now() + ms);
  }

  private generateToken(): string {
    return randomBytes(TOKEN_BYTES).toString('base64url');
  }

  /** HMAC-SHA256 of the raw token; the raw token is never stored. */
  private hashToken(rawToken: string): string {
    const key = this.config.refreshHashPepper || this.config.jwtRefreshSecret;
    return createHmac('sha256', key).update(rawToken).digest('hex');
  }
}

function msFromDuration(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const value = Number(match[1]);
  const unit = match[2];
  const factors: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return value * factors[unit];
}
