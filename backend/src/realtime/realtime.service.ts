import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../config/app.config';
import { TripAccessService } from '../common/services/trip-access.service';
import { ApiException } from '../common/filters/all-exceptions.filter';
import { ErrorCodes } from '../common/constants/error-codes';
import { LocationThrottle } from './throttle';
import { ValidLocationUpdate } from './location-update';
import { TripStatus } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../auth/types/auth.types';

@Injectable()
export class RealtimeService {
  /** Per (trip,user) in-memory throttle. Single instance (no Redis in Phase 2). */
  private readonly throttle: LocationThrottle;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
    private readonly access: TripAccessService,
  ) {
    this.throttle = new LocationThrottle(config.locationUpdateMinIntervalMs);
  }

  /** Verifies an access-token JWT and returns the user, or null. */
  async verifyToken(token: string): Promise<AuthenticatedUser | null> {
    try {
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        type?: string;
      }>(token, { secret: this.config.jwtAccessSecret });
      if (payload.type !== 'access') return null;
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, name: true, email: true },
      });
      return user;
    } catch {
      return null;
    }
  }

  /**
   * Validates that the user may operate on the trip (exists + is a member +
   * trip not ended). Reuses the existing TripAccessService authz.
   */
  async requireTripAccess(tripId: string, userId: string): Promise<void> {
    const membership = await this.access.requireMember(tripId, userId);
    if (
      membership.trip.status === TripStatus.CANCELLED ||
      membership.trip.status === TripStatus.COMPLETED
    ) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'This trip is no longer active.',
        ErrorCodes.TRIP_ENDED,
      );
    }
  }

  /** Whether a location update from this rider is within the throttle window. */
  isThrottled(tripId: string, userId: string, now = Date.now()): boolean {
    return !this.throttle.allow(`${tripId}:${userId}`, now);
  }

  /** UPSERT the rider's current location (never appends a history row). */
  async upsertLocation(
    tripId: string,
    userId: string,
    value: ValidLocationUpdate,
  ): Promise<void> {
    const lastUpdatedAt = new Date(value.timestamp);
    await this.prisma.$transaction(async (tx) => {
      await tx.currentLocation.upsert({
        where: { tripId_userId: { tripId, userId } },
        update: {
          latitude: value.latitude,
          longitude: value.longitude,
          accuracy: value.accuracy,
          speed: value.speed,
          heading: value.heading,
          lastUpdatedAt,
        },
        create: {
          tripId,
          userId,
          latitude: value.latitude,
          longitude: value.longitude,
          accuracy: value.accuracy,
          speed: value.speed,
          heading: value.heading,
          lastUpdatedAt,
        },
      });
      // Keep the PostGIS point in sync for future spatial queries.
      await tx.$executeRaw`
        UPDATE "current_locations"
        SET "location_geo" = ST_SetSRID(ST_MakePoint(${value.longitude}, ${value.latitude}), 4326)
        WHERE "trip_id" = ${tripId}::uuid AND "user_id" = ${userId}::uuid
      `;
    });
  }
}
