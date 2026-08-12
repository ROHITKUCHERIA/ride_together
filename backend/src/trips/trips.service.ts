import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TripAccessService } from '../common/services/trip-access.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { paginate } from '../common/utils/pagination';
import { ApiException } from '../common/filters/all-exceptions.filter';
import { ErrorCodes } from '../common/constants/error-codes';
import { MemberRole, TripStatus } from '../../generated/prisma/enums';
import type { Prisma } from '../../generated/prisma/client';
import { randomBytes } from 'node:crypto';

const TRIP_SELECT = {
  id: true,
  name: true,
  description: true,
  startLocation: true,
  destination: true,
  startLatitude: true,
  startLongitude: true,
  destinationLatitude: true,
  destinationLongitude: true,
  startDate: true,
  endDate: true,
  status: true,
  inviteCode: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { members: true } },
} as const;

/** Allowed status transitions — enforced server-side. */
const STATUS_TRANSITIONS: Record<TripStatus, TripStatus[]> = {
  [TripStatus.PLANNED]: [TripStatus.ACTIVE, TripStatus.CANCELLED],
  [TripStatus.ACTIVE]: [TripStatus.COMPLETED, TripStatus.CANCELLED],
  [TripStatus.COMPLETED]: [],
  [TripStatus.CANCELLED]: [],
};

@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TripAccessService,
  ) {}

  async create(userId: string, dto: CreateTripDto) {
    if (new Date(dto.endDate).getTime() < new Date(dto.startDate).getTime()) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'endDate cannot be before startDate.',
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    const inviteCode = await this.generateUniqueInviteCode();

    // Transaction keeps trip + OWNER membership atomic.
    const trip = await this.prisma.$transaction(async (tx) => {
      const created = await tx.trip.create({
        data: {
          name: dto.name.trim(),
          description: dto.description?.trim() ?? null,
          startLocation: dto.startLocation?.trim() ?? null,
          destination: dto.destination.trim(),
          startLatitude: dto.startLatitude ?? null,
          startLongitude: dto.startLongitude ?? null,
          destinationLatitude: dto.destinationLatitude ?? null,
          destinationLongitude: dto.destinationLongitude ?? null,
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          inviteCode,
          createdBy: userId,
        },
        select: TRIP_SELECT,
      });

      await tx.tripMember.create({
        data: { tripId: created.id, userId, role: MemberRole.OWNER },
      });

      // Populate the PostGIS geography point (used by Phase-2 spatial queries).
      await this.syncDestinationGeo(
        tx,
        created.id,
        dto.destinationLatitude ?? null,
        dto.destinationLongitude ?? null,
      );

      return created;
    });

    return trip;
  }

  /** Trips where the authenticated user is a member (privacy). */
  async findAll(userId: string, page: number, limit: number) {
    const where = { members: { some: { userId } } };
    const [total, trips] = await this.prisma.$transaction([
      this.prisma.trip.count({ where }),
      this.prisma.trip.findMany({
        where,
        select: TRIP_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return paginate(trips, total, page, limit);
  }

  async findOne(tripId: string, userId: string) {
    await this.access.requireMember(tripId, userId);
    return this.prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      select: TRIP_SELECT,
    });
  }

  async update(tripId: string, userId: string, dto: UpdateTripDto) {
    await this.access.requireRole(tripId, userId, [
      MemberRole.OWNER,
      MemberRole.ADMIN,
    ]);

    const existing = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });
    if (!existing) throw this.notFound();

    const startDate = dto.startDate
      ? new Date(dto.startDate)
      : existing.startDate;
    const endDate = dto.endDate ? new Date(dto.endDate) : existing.endDate;
    if (endDate.getTime() < startDate.getTime()) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'endDate cannot be before startDate.',
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    // A pair of lat/lng must be kept consistent with the geography point.
    const destinationLat =
      dto.destinationLatitude !== undefined
        ? dto.destinationLatitude
        : existing.destinationLatitude;
    const destinationLng =
      dto.destinationLongitude !== undefined
        ? dto.destinationLongitude
        : existing.destinationLongitude;
    const bothSet = destinationLat != null && destinationLng != null;
    const bothNull = destinationLat == null && destinationLng == null;
    if (!bothSet && !bothNull) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'destinationLatitude and destinationLongitude must be provided together.',
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const trip = await tx.trip.update({
        where: { id: tripId },
        data: {
          name: dto.name?.trim(),
          description:
            dto.description === undefined
              ? undefined
              : (dto.description?.trim() ?? null),
          startLocation:
            dto.startLocation === undefined
              ? undefined
              : (dto.startLocation?.trim() ?? null),
          destination: dto.destination?.trim(),
          startLatitude: dto.startLatitude,
          startLongitude: dto.startLongitude,
          destinationLatitude: dto.destinationLatitude,
          destinationLongitude: dto.destinationLongitude,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        },
        select: TRIP_SELECT,
      });

      await this.syncDestinationGeo(
        tx,
        tripId,
        bothNull ? null : destinationLat,
        bothNull ? null : destinationLng,
      );

      return trip;
    });
  }

  async remove(tripId: string, userId: string): Promise<void> {
    await this.access.requireOwner(tripId, userId);
    await this.prisma.$transaction(async (tx) => {
      await tx.tripMember.deleteMany({ where: { tripId } });
      await tx.trip.delete({ where: { id: tripId } });
    });
  }

  // ---------- status ----------

  async changeStatus(
    tripId: string,
    userId: string,
    target: TripStatus,
  ): Promise<void> {
    const membership = await this.access.requireRole(tripId, userId, [
      MemberRole.OWNER,
      MemberRole.ADMIN,
    ]);
    const current = membership.trip.status;

    if (current === target) return;

    if (!STATUS_TRANSITIONS[current].includes(target)) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        `Invalid status transition from ${current} to ${target}.`,
        ErrorCodes.INVALID_ROLE_TRANSITION,
      );
    }

    // Conditional update guards against concurrent status changes (e.g. a
    // simultaneous cancel + complete) so the transition map stays invariant.
    const result = await this.prisma.trip.updateMany({
      where: { id: tripId, status: current },
      data: { status: target },
    });
    if (result.count !== 1) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'Trip status changed concurrently, please retry.',
        ErrorCodes.INVALID_ROLE_TRANSITION,
      );
    }
  }

  // ---------- join / leave ----------

  async join(userId: string, inviteCodeRaw: string) {
    const inviteCode = inviteCodeRaw.trim().toUpperCase();
    const trip = await this.prisma.trip.findUnique({ where: { inviteCode } });
    if (!trip) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'Invalid invite code.',
        ErrorCodes.INVALID_INVITE_CODE,
      );
    }

    if (
      trip.status === TripStatus.CANCELLED ||
      trip.status === TripStatus.COMPLETED
    ) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'This trip is no longer accepting new riders.',
        ErrorCodes.TRIP_ENDED,
      );
    }

    const existing = await this.prisma.tripMember.findFirst({
      where: { tripId: trip.id, userId },
    });
    if (existing) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'You are already a member of this trip.',
        ErrorCodes.ALREADY_MEMBER,
      );
    }

    await this.prisma.tripMember.create({
      data: { tripId: trip.id, userId, role: MemberRole.MEMBER },
    });

    return this.prisma.trip.findUniqueOrThrow({
      where: { id: trip.id },
      select: TRIP_SELECT,
    });
  }

  async leave(tripId: string, userId: string): Promise<void> {
    const membership = await this.access.requireMember(tripId, userId);
    if (membership.role === MemberRole.OWNER) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'The trip owner cannot leave directly. Transfer ownership first.',
        ErrorCodes.OWNER_CANNOT_LEAVE,
      );
    }
    await this.prisma.tripMember.delete({
      where: { id: membership.id },
    });
  }

  // ---------- helpers ----------

  /**
   * Keeps the PostGIS geography point in sync with the plain lat/lng doubles.
   * When both coordinates are null the geography is cleared; otherwise it is
   * set to the given (longitude, latitude) point in SRID 4326.
   */
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

  private async generateUniqueInviteCode(): Promise<string> {
    // 8-char base32-ish alphabet (no ambiguous chars), retry on collision.
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 10; attempt++) {
      const bytes = randomBytes(8);
      let code = '';
      for (const b of bytes) code += alphabet[b % alphabet.length];
      const exists = await this.prisma.trip.findUnique({
        where: { inviteCode: code },
      });
      if (!exists) return code;
    }
    throw new ApiException(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'Could not generate a unique invite code.',
      ErrorCodes.INTERNAL_ERROR,
    );
  }

  private notFound(): ApiException {
    return new ApiException(
      HttpStatus.NOT_FOUND,
      'Trip not found.',
      ErrorCodes.TRIP_NOT_FOUND,
    );
  }
}
