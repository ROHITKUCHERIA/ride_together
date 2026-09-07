import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TripAccessService } from '../common/services/trip-access.service';
import { AppConfig } from '../config/app.config';
import { ApiException } from '../common/filters/all-exceptions.filter';
import { ErrorCodes } from '../common/constants/error-codes';
import { GroupNavRealtimeService } from './group-nav-realtime.service';
import { NavigationEvents } from '../socket/events/navigation.events';
import { toDestinationWire } from '../trips/interfaces/trip-destination.interface';
import {
  computeGroupEta,
  NavigationSessionPayload,
  toWireMode,
  toWireStatus,
} from '../navigation/interfaces/navigation-session.interface';
import { StartNavigationSessionDto } from '../navigation/dto/start-navigation-session.dto';
import { UpdateNavigationStatusDto } from '../navigation/dto/update-navigation-status.dto';
import { NavigationMode, NavigationStatus } from '../../generated/prisma/enums';
import type { NavigationSessionModel } from '../../generated/prisma/models';

/**
 * Lightweight per-rider navigation sessions. Only status transitions are
 * persisted — never GPS history or per-maneuver telemetry. Group sessions are
 * broadcast to the trip room in realtime; personal sessions are kept only for
 * the rider's own reconnect recovery.
 */
@Injectable()
export class NavigationSessionsService {
  private readonly logger = new Logger(NavigationSessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly access: TripAccessService,
    private readonly realtime: GroupNavRealtimeService,
  ) {}

  // ------------------------------------------------------------- snapshot

  /** Group navigation snapshot — the reconnect recovery source of truth. */
  async getGroupSnapshot(
    tripId: string,
    userId: string,
  ): Promise<{
    destination: ReturnType<typeof toDestinationWire>;
    riders: NavigationSessionPayload[];
    groupEta: number | null;
  }> {
    await this.access.requireMember(tripId, userId);

    const trip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      select: {
        destination: true,
        destinationLatitude: true,
        destinationLongitude: true,
        destinationSetBy: true,
        destinationSetAt: true,
      },
    });

    const [sessions, locations] = await this.prisma.$transaction([
      this.prisma.navigationSession.findMany({
        where: { tripId },
        orderBy: { startedAt: 'asc' },
      }),
      this.prisma.currentLocation.findMany({
        where: { tripId },
        select: { userId: true, lastUpdatedAt: true },
      }),
    ]);

    const locAgeByUser = new Map<string, number>();
    const now = Date.now();
    for (const loc of locations) {
      locAgeByUser.set(loc.userId, now - loc.lastUpdatedAt.getTime());
    }

    const riders = sessions.map((s) =>
      this.toPayload(s, locAgeByUser.get(s.userId) ?? null),
    );
    return {
      destination: toDestinationWire(trip),
      riders,
      groupEta: computeGroupEta(riders),
    };
  }

  // ------------------------------------------------------------- start

  /** Start (or restart) a navigation session. Group sessions default to the
   *  trip's shared destination. */
  async startSession(
    tripId: string,
    userId: string,
    dto: StartNavigationSessionDto,
  ): Promise<NavigationSessionPayload> {
    const membership = await this.access.requireMember(tripId, userId);
    const group = dto.mode !== 'personal';

    let destLat: number | null = null;
    let destLng: number | null = null;
    let destName: string | null = null;
    if (group) {
      const trip = membership.trip;
      if (
        trip.destinationLatitude == null ||
        trip.destinationLongitude == null
      ) {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          'This trip has no shared destination yet. Ask the host to set one.',
          ErrorCodes.NO_TRIP_DESTINATION,
        );
      }
      destLat = trip.destinationLatitude;
      destLng = trip.destinationLongitude;
      destName = trip.destination;
    } else {
      if (dto.destinationLatitude == null || dto.destinationLongitude == null) {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          'Personal navigation needs destination coordinates.',
          ErrorCodes.VALIDATION_ERROR,
        );
      }
      destLat = dto.destinationLatitude;
      destLng = dto.destinationLongitude;
      destName = dto.destinationName ?? null;
    }

    const now = new Date();
    const session = await this.prisma.navigationSession.upsert({
      where: { tripId_userId: { tripId, userId } },
      update: {
        mode: group ? NavigationMode.GROUP : NavigationMode.PERSONAL,
        status: NavigationStatus.NAVIGATING,
        destinationLatitude: destLat,
        destinationLongitude: destLng,
        destinationName: destName,
        startedAt: now,
        lastUpdatedAt: now,
      },
      create: {
        tripId,
        userId,
        mode: group ? NavigationMode.GROUP : NavigationMode.PERSONAL,
        status: NavigationStatus.NAVIGATING,
        destinationLatitude: destLat,
        destinationLongitude: destLng,
        destinationName: destName,
        startedAt: now,
        lastUpdatedAt: now,
      },
    });

    this.logger.log(
      `navigation_started tripId=${tripId} userId=${userId} mode=${group ? 'group' : 'personal'}`,
    );
    const payload = this.toPayload(session, null);
    if (group) {
      this.realtime.broadcastSession(
        NavigationEvents.NAVIGATION_STARTED,
        payload,
      );
    }
    return payload;
  }

  // ------------------------------------------------------------- update

  /** Relay a rider's navigation status/ETA transition. Throttled to meaningful
   *  changes only — the same GPS rate limit never applies to navigation. */
  async updateSession(
    tripId: string,
    userId: string,
    dto: UpdateNavigationStatusDto,
  ): Promise<NavigationSessionPayload> {
    await this.access.requireMember(tripId, userId);
    const existing = await this.prisma.navigationSession.findUnique({
      where: { tripId_userId: { tripId, userId } },
    });
    if (!existing) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'No active navigation session. Start navigating first.',
        ErrorCodes.NAV_SESSION_NOT_FOUND,
      );
    }

    const nowMs = Date.now();
    const lastUpdatedMs = existing.lastUpdatedAt.getTime();
    const nextDbStatus = toWireStatusToDb(dto.status);

    // Safety valve: ignore spam within the status throttle window unless the
    // state actually transitions or the ETA moved meaningfully. A transition
    // from a null ETA to a real ETA (the rider's first report) is meaningful,
    // so it is never treated as trivial.
    const etaTouched =
      dto.eta !== undefined &&
      (existing.etaEpochMs === null ||
        Math.abs(existing.etaEpochMs - dto.eta) >= 60_000);
    const trivial =
      nowMs - lastUpdatedMs < this.config.navigationStatusMinIntervalMs &&
      existing.status === nextDbStatus &&
      !etaTouched;
    if (trivial) {
      return this.toPayload(existing, null);
    }

    const session = await this.prisma.navigationSession.update({
      where: { id: existing.id },
      data: {
        status: nextDbStatus,
        distanceRemainingMeters:
          dto.distanceRemainingMeters ?? existing.distanceRemainingMeters,
        etaEpochMs: dto.eta ?? existing.etaEpochMs,
        lastUpdatedAt: new Date(nowMs),
      },
    });

    // Only GROUP sessions are broadcast — personal navigation stays private.
    if (session.mode === NavigationMode.GROUP) {
      const event = this.eventForTransition(existing.status, session.status);
      this.logNavigationEvent(event, tripId, userId);
      this.realtime.broadcastSession(event, this.toPayload(session, null));
    }
    return this.toPayload(session, null);
  }

  // ------------------------------------------------------------- stop

  async stopSession(tripId: string, userId: string): Promise<void> {
    await this.access.requireMember(tripId, userId);
    const existing = await this.prisma.navigationSession.findUnique({
      where: { tripId_userId: { tripId, userId } },
    });
    if (!existing) return;

    await this.prisma.navigationSession.delete({ where: { id: existing.id } });
    this.logger.log(`navigation_stopped tripId=${tripId} userId=${userId}`);
    if (existing.mode === NavigationMode.GROUP) {
      this.realtime.broadcastSession(NavigationEvents.NAVIGATION_STOPPED, {
        tripId,
        userId,
        mode: 'group',
        status: 'idle',
        updatedAt: new Date().toISOString(),
      });
    }
  }

  // ------------------------------------------------------------- offline

  /** Socket disconnect hook: a rider that vanished is marked OFFLINE so the
   *  group instantly sees the change (no waiting for the 60s offline sweep). */
  async markOffline(tripId: string, userId: string): Promise<void> {
    const existing = await this.prisma.navigationSession.findUnique({
      where: { tripId_userId: { tripId, userId } },
    });
    if (!existing || existing.status === NavigationStatus.OFFLINE) return;
    if (existing.mode !== NavigationMode.GROUP) return;

    await this.prisma.navigationSession.update({
      where: { id: existing.id },
      data: { status: NavigationStatus.OFFLINE, lastUpdatedAt: new Date() },
    });
    this.realtime.broadcastSession(NavigationEvents.NAVIGATION_STATUS, {
      tripId,
      userId,
      mode: 'group',
      status: 'offline',
      updatedAt: new Date().toISOString(),
    });
  }

  // ------------------------------------------------------------- helpers

  private eventForTransition(
    from: NavigationStatus,
    to: NavigationStatus,
  ): string {
    if (to === NavigationStatus.ARRIVED)
      return NavigationEvents.NAVIGATION_ARRIVED;
    if (to === NavigationStatus.GPS_LOST)
      return NavigationEvents.NAVIGATION_GPS_LOST;
    if (to === NavigationStatus.REROUTING)
      return NavigationEvents.NAVIGATION_REROUTING;
    if (
      from === NavigationStatus.REROUTING &&
      to === NavigationStatus.NAVIGATING
    ) {
      return NavigationEvents.NAVIGATION_REROUTED;
    }
    return NavigationEvents.NAVIGATION_STATUS;
  }

  private logNavigationEvent(
    event: string,
    tripId: string,
    userId: string,
  ): void {
    const name = event.startsWith('navigation:')
      ? event.slice('navigation:'.length)
      : event;
    this.logger.log(`navigation_${name} tripId=${tripId} userId=${userId}`);
  }

  private toPayload(
    session: NavigationSessionModel,
    locAgeMs: number | null,
  ): NavigationSessionPayload {
    const status = toWireStatus(session.status);
    const effectiveStatus =
      status !== 'offline' &&
      locAgeMs !== null &&
      locAgeMs > this.config.riderDelayedThresholdMs
        ? ('offline' as const)
        : status;
    return {
      tripId: session.tripId,
      userId: session.userId,
      mode: toWireMode(session.mode),
      status: effectiveStatus,
      distanceRemainingMeters: session.distanceRemainingMeters,
      eta: session.etaEpochMs,
      destination:
        session.destinationLatitude != null &&
        session.destinationLongitude != null
          ? {
              latitude: session.destinationLatitude,
              longitude: session.destinationLongitude,
              name: session.destinationName ?? undefined,
            }
          : null,
      updatedAt: session.lastUpdatedAt.toISOString(),
    };
  }
}

function toWireStatusToDb(status: string): NavigationStatus {
  switch (status) {
    case 'idle':
      return NavigationStatus.IDLE;
    case 'navigating':
      return NavigationStatus.NAVIGATING;
    case 'off_route':
      return NavigationStatus.OFF_ROUTE;
    case 'rerouting':
      return NavigationStatus.REROUTING;
    case 'arrived':
      return NavigationStatus.ARRIVED;
    case 'gps_lost':
      return NavigationStatus.GPS_LOST;
    case 'offline':
      return NavigationStatus.OFFLINE;
    default:
      return NavigationStatus.NAVIGATING;
  }
}
