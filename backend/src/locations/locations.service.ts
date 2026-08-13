import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TripAccessService } from '../common/services/trip-access.service';
import { AppConfig } from '../config/app.config';
import { computeRiderStatus, RiderStatus } from '../realtime/rider-status';

/**
 * Public rider location payload — never includes emails/passwords.
 */
export interface RiderLocationPayload {
  userId: string;
  name: string;
  avatarUrl: string | null;
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  lastUpdatedAt: string;
  status: RiderStatus;
}

@Injectable()
export class TripLocationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TripAccessService,
    private readonly config: AppConfig,
  ) {}

  /** All current locations for a trip (no viewer check — call after authz). */
  async getRiderLocations(tripId: string): Promise<RiderLocationPayload[]> {
    const rows = await this.prisma.currentLocation.findMany({
      where: { tripId },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { lastUpdatedAt: 'desc' },
    });
    return rows.map((r) => this.toPayload(r));
  }

  /** A single rider's current location for a trip. */
  async getRiderLocation(
    tripId: string,
    userId: string,
  ): Promise<RiderLocationPayload | null> {
    const row = await this.prisma.currentLocation.findUnique({
      where: { tripId_userId: { tripId, userId } },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    });
    return row ? this.toPayload(row) : null;
  }

  /** REST view: current locations, but only for authenticated trip members. */
  async getLocationsForTrip(
    tripId: string,
    viewerUserId: string,
  ): Promise<RiderLocationPayload[]> {
    await this.access.requireMember(tripId, viewerUserId);
    return this.getRiderLocations(tripId);
  }

  private toPayload(row: {
    latitude: number;
    longitude: number;
    accuracy: number;
    speed: number | null;
    heading: number | null;
    lastUpdatedAt: Date;
    user: { id: string; name: string; avatarUrl: string | null };
  }): RiderLocationPayload {
    const now = Date.now();
    return {
      userId: row.user.id,
      name: row.user.name,
      avatarUrl: row.user.avatarUrl,
      latitude: row.latitude,
      longitude: row.longitude,
      accuracy: row.accuracy,
      speed: row.speed,
      heading: row.heading,
      lastUpdatedAt: row.lastUpdatedAt.toISOString(),
      status: computeRiderStatus(
        now - row.lastUpdatedAt.getTime(),
        this.config.riderLiveThresholdMs,
        this.config.riderDelayedThresholdMs,
      ),
    };
  }
}
