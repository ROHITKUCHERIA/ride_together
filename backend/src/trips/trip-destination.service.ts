import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TripAccessService } from '../common/services/trip-access.service';
import { GroupNavRealtimeService } from '../realtime/group-nav-realtime.service';
import {
  toDestinationWire,
  TripDestinationResult,
  TripDestinationWire,
} from './interfaces/trip-destination.interface';
import type { SetTripDestinationDto } from './dto/set-trip-destination.dto';
import type { Prisma } from '../../generated/prisma/client';

const DESTINATION_SELECT = {
  destination: true,
  destinationLatitude: true,
  destinationLongitude: true,
  destinationSetBy: true,
  destinationSetAt: true,
} as const;

/**
 * Shared trip destination — the navigation target every rider can drive to.
 * Permissions follow the existing role model: the Host (OWNER) sets, updates
 * and clears the destination; every member can read it. Mutations are pushed
 * to the trip room in realtime so riders never refresh.
 */
@Injectable()
export class TripDestinationService {
  private readonly logger = new Logger(TripDestinationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TripAccessService,
    private readonly realtime: GroupNavRealtimeService,
  ) {}

  /** Host only. Set/update the shared destination. */
  async setDestination(
    tripId: string,
    userId: string,
    dto: SetTripDestinationDto,
  ): Promise<TripDestinationResult> {
    await this.access.requireOwner(tripId, userId);
    const name = dto.name?.trim() || undefined;
    const now = new Date();

    const trip = await this.prisma.$transaction(async (tx) => {
      await tx.trip.update({
        where: { id: tripId },
        data: {
          destinationLatitude: dto.latitude,
          destinationLongitude: dto.longitude,
          destinationSetBy: userId,
          destinationSetAt: now,
          ...(name ? { destination: name } : {}),
        },
        select: DESTINATION_SELECT,
      });
      await this.syncDestinationGeo(tx, tripId, dto.latitude, dto.longitude);
      return tx.trip.findUniqueOrThrow({
        where: { id: tripId },
        select: DESTINATION_SELECT,
      });
    });

    const destination = toDestinationWire(trip);
    this.logger.log(`destination_updated tripId=${tripId} setBy=${userId}`);
    this.realtime.broadcastDestinationUpdated({
      tripId,
      destination: destination!,
    });
    return { destination };
  }

  /** Members only. Read the current shared destination. */
  async getDestination(
    tripId: string,
    userId: string,
  ): Promise<TripDestinationResult> {
    await this.access.requireMember(tripId, userId);
    const trip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      select: DESTINATION_SELECT,
    });
    return { destination: toDestinationWire(trip) };
  }

  /** Host only. Clear the shared destination (trip/group tracking stays on). */
  async clearDestination(
    tripId: string,
    userId: string,
  ): Promise<TripDestinationResult> {
    await this.access.requireOwner(tripId, userId);

    await this.prisma.$transaction(async (tx) => {
      await tx.trip.update({
        where: { id: tripId },
        data: {
          destinationLatitude: null,
          destinationLongitude: null,
          destinationSetBy: null,
          destinationSetAt: null,
        },
        select: DESTINATION_SELECT,
      });
      await this.syncDestinationGeo(tx, tripId, null, null);
    });

    this.logger.log(`destination_cleared tripId=${tripId} clearedBy=${userId}`);
    this.realtime.broadcastDestinationCleared({ tripId, destination: null });
    return { destination: null };
  }

  private async syncDestinationGeo(
    tx: Prisma.TransactionClient,
    tripId: string,
    latitude: number | null,
    longitude: number | null,
  ): Promise<void> {
    if (latitude == null || longitude == null) {
      await tx.$executeRaw`
        UPDATE "trips" SET "destination_geo" = NULL WHERE "id" = ${tripId}::uuid
      `;
      return;
    }
    await tx.$executeRaw`
      UPDATE "trips"
      SET "destination_geo" = ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)
      WHERE "id" = ${tripId}::uuid
    `;
  }
}

export type { TripDestinationWire };
