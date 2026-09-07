import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { TripAccessService } from '../common/services/trip-access.service';
import { AppConfig } from '../config/app.config';
import { ApiException } from '../common/filters/all-exceptions.filter';
import { ErrorCodes } from '../common/constants/error-codes';
import { RoutingService } from './routing.service';
import { RerouteCooldownService } from '../cache/reroute-cooldown.service';
import { NavigationSessionsService } from '../realtime/navigation-sessions.service';
import type { NavigationSessionPayload } from './interfaces/navigation-session.interface';
import type { StartNavigationSessionDto } from './dto/start-navigation-session.dto';
import type { UpdateNavigationStatusDto } from './dto/update-navigation-status.dto';
import type { RequestRerouteDto } from './dto/request-reroute.dto';
import type { NormalizedRoute } from './interfaces/routing-response.interface';

export interface RerouteResult {
  requestId: string;
  route: NormalizedRoute;
}

/**
 * Trip-scoped navigation orchestration: session lifecycle (delegated to the
 * realtime NavigationSessionsService) plus group rerouting with a distributed
 * Redis cooldown and requestId idempotency.
 */
@Injectable()
export class TripNavigationService {
  private readonly logger = new Logger(TripNavigationService.name);

  constructor(
    private readonly sessions: NavigationSessionsService,
    private readonly routing: RoutingService,
    private readonly cooldown: RerouteCooldownService,
    private readonly config: AppConfig,
    private readonly access: TripAccessService,
  ) {}

  /** Group navigation snapshot (reconnect recovery). */
  getGroupSnapshot(tripId: string, userId: string) {
    return this.sessions.getGroupSnapshot(tripId, userId);
  }

  /** Start/update my navigation session. */
  startSession(
    tripId: string,
    userId: string,
    dto: StartNavigationSessionDto,
  ): Promise<NavigationSessionPayload> {
    return this.sessions.startSession(tripId, userId, dto);
  }

  updateSession(
    tripId: string,
    userId: string,
    dto: UpdateNavigationStatusDto,
  ): Promise<NavigationSessionPayload> {
    return this.sessions.updateSession(tripId, userId, dto);
  }

  stopSession(tripId: string, userId: string): Promise<void> {
    return this.sessions.stopSession(tripId, userId);
  }

  /**
   * Group reroute with a distributed cooldown: acquiring a short-lived Redis
   * key guarantees that concurrent devices/instances cannot fire duplicate
   * reroutes for the same rider on the same trip. Idempotency is further
   * guaranteed by echoing the requestId back — the client applies only the
   * newest result.
   */
  async tryReroute(
    tripId: string,
    userId: string,
    dto: RequestRerouteDto,
  ): Promise<RerouteResult> {
    await this.access.requireMember(tripId, userId);

    const acquired = await this.cooldown.tryAcquire(
      tripId,
      userId,
      dto.requestId,
      this.config.navigationRerouteCooldownSeconds,
    );
    if (!acquired) {
      this.logger.warn(
        `reroute_rejected tripId=${tripId} userId=${userId} requestId=${dto.requestId}`,
      );
      throw new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        'Hang tight — your route is already being recalculated.',
        ErrorCodes.REROUTE_COOLDOWN,
      );
    }

    this.logger.log(
      `reroute_started tripId=${tripId} userId=${userId} requestId=${dto.requestId}`,
    );
    try {
      const route = await this.routing.calculateRoute(
        dto.origin,
        dto.destination,
      );
      this.logger.log(
        `reroute_completed tripId=${tripId} userId=${userId} requestId=${dto.requestId}`,
      );
      return { requestId: dto.requestId, route };
    } catch (err) {
      this.logger.warn(
        `route_failed reason=${String(err)} tripId=${tripId} userId=${userId}`,
      );
      // Release the cooldown on failure so the rider can retry immediately.
      await this.cooldown.release(tripId, userId, dto.requestId);
      throw err;
    }
  }
}
