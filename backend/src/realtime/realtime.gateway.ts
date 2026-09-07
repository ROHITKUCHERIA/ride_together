import { Logger, OnModuleDestroy } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RealtimeService } from './realtime.service';
import { TripLocationService } from '../locations/locations.service';
import { AppConfig } from '../config/app.config';
import { ApiException } from '../common/filters/all-exceptions.filter';
import { validateLocationUpdate } from './location-update';
import type { LocationUpdateInput } from './location-update';
import { computeRiderStatus, RiderStatus } from './rider-status';
import { JamService } from '../jam/jam.service';
import { JamRealtimeService } from './jam-realtime.service';
import { GroupNavRealtimeService } from './group-nav-realtime.service';
import { NavigationSessionsService } from './navigation-sessions.service';
import { tripRoomName } from './rooms';
import type { AuthenticatedUser } from '../auth/types/auth.types';

interface SessionUser {
  user: AuthenticatedUser;
}

interface TripSession {
  userId: string;
  lastUpdatedAt: number;
  lastStatus: RiderStatus;
}

const STATUS_SWEEP_INTERVAL_MS = 10_000;

@WebSocketGateway({ namespace: '/' })
export class RealtimeGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleDestroy
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  private server!: Server;

  /** socketId -> tripId -> session (for status sweeps + offline broadcasts). */
  private readonly sessions = new Map<string, Map<string, TripSession>>();
  private statusTicker: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly realtime: RealtimeService,
    private readonly locations: TripLocationService,
    private readonly config: AppConfig,
    private readonly jam: JamService,
    private readonly jamRealtime: JamRealtimeService,
    private readonly groupNavRealtime: GroupNavRealtimeService,
    private readonly navigationSessions: NavigationSessionsService,
  ) {}

  afterInit(): void {
    // REST-originated Jam mutations broadcast through the shared server.
    this.jamRealtime.attach(this.server);
    // REST-originated destination/session mutations broadcast to the room.
    this.groupNavRealtime.attach(this.server);
    this.statusTicker = setInterval(
      () => this.sweepStatuses(),
      STATUS_SWEEP_INTERVAL_MS,
    );
    this.statusTicker.unref?.();
  }

  async handleConnection(client: Socket): Promise<void> {
    const token = extractToken(client);
    const user = token ? await this.realtime.verifyToken(token) : null;
    if (!user) {
      client.emit('trip:error', {
        code: 'UNAUTHENTICATED',
        message: 'Authentication failed. Provide a valid access token.',
      });
      // Give the error a tick to flush before closing the transport.
      setTimeout(() => client.disconnect(true), 50);
      return;
    }
    (client.data as SessionUser).user = user;
    // Authentication handshake: the client must wait for this event before
    // emitting trip/event messages (handleConnection is async).
    client.emit('authenticated', { userId: user.id, name: user.name });
  }

  handleDisconnect(client: Socket): void {
    const joined = this.sessions.get(client.id);
    if (joined) {
      const userId = (client.data as SessionUser).user?.id;
      for (const tripId of joined.keys()) {
        client.to(tripRoomName(tripId)).emit('rider:offline', { userId });
        if (userId) {
          // A disconnected Host makes its Jam unavailable/paused for everyone;
          // a disconnected participant leaves the Jam so counts stay accurate.
          void this.jam.markHostDisconnected(tripId, userId);
          void this.jam.removeParticipantOnDisconnect(tripId, userId);
          // A navigating rider that vanishes is immediately marked OFFLINE so
          // the group status/ETA stay accurate across the disconnect.
          void this.navigationSessions.markOffline(tripId, userId);
        }
      }
    }
    this.sessions.delete(client.id);
  }

  onModuleDestroy(): void {
    if (this.statusTicker) clearInterval(this.statusTicker);
    this.statusTicker = null;
  }

  // ------------------------------------------------------------- events

  @SubscribeMessage('trip:join')
  async onTripJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { tripId?: unknown },
  ): Promise<void> {
    const user = this.requireUser(client);
    if (!user) return;
    const tripId = this.normalizeTripId(payload?.tripId, client);
    if (!tripId) return;

    if (!(await this.authorize(client, tripId, user.id))) return;

    await client.join(tripRoomName(tripId));
    this.trackSession(client, tripId, user.id, null);

    const riders = await this.locations.getRiderLocations(tripId);
    client.emit('trip:joined', { tripId, riders });
    client.to(tripRoomName(tripId)).emit('rider:online', { userId: user.id });
  }

  @SubscribeMessage('location:start')
  async onLocationStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { tripId?: unknown },
  ): Promise<void> {
    const user = this.requireUser(client);
    if (!user) return;
    const tripId = this.normalizeTripId(payload?.tripId, client);
    if (!tripId) return;

    if (!(await this.authorize(client, tripId, user.id))) return;

    await client.join(tripRoomName(tripId));
    this.trackSession(client, tripId, user.id, null);
    client.to(tripRoomName(tripId)).emit('rider:online', { userId: user.id });
  }

  @SubscribeMessage('location:update')
  async onLocationUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: LocationUpdateInput,
  ): Promise<void> {
    const user = this.requireUser(client);
    if (!user) return;

    const result = validateLocationUpdate(payload, {
      maxAgeMs: this.config.locationMaxAgeMs,
      maxFutureMs: this.config.locationMaxFutureMs,
    });
    if (!result.ok) {
      this.emitError(client, result.code, result.message);
      return;
    }
    const value = result.value;

    // The trip/user identity always comes from the verified JWT — never from
    // the client payload (impersonation is impossible).
    if (!(await this.authorize(client, value.tripId, user.id))) return;

    if (this.realtime.isThrottled(value.tripId, user.id)) {
      this.emitError(
        client,
        'RATE_LIMITED',
        'Location updates are too frequent. Slow down.',
      );
      return;
    }

    try {
      await this.realtime.upsertLocation(value.tripId, user.id, value);
    } catch (err) {
      this.logger.warn(
        `Location upsert failed for user ${user.id} trip ${value.tripId}: ${String(err)}`,
      );
      this.emitError(client, 'INTERNAL_ERROR', 'Could not store location.');
      return;
    }

    await client.join(tripRoomName(value.tripId));
    this.trackSession(client, value.tripId, user.id, value.timestamp);

    const rider = await this.locations.getRiderLocation(value.tripId, user.id);
    if (rider) {
      // Broadcast to every trip member (including the sender) — this is how
      // each rider learns everyone's live position.
      client.to(tripRoomName(value.tripId)).emit('location:updated', rider);
      client.emit('location:updated', rider);
    }
  }

  @SubscribeMessage('location:stop')
  onLocationStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { tripId?: unknown },
  ): void {
    const user = this.requireUser(client);
    if (!user) return;
    const tripId = this.normalizeTripId(payload?.tripId, client);
    if (!tripId) return;
    this.forgetSession(client.id, tripId);
    client.to(tripRoomName(tripId)).emit('rider:offline', { userId: user.id });
  }

  @SubscribeMessage('trip:leave')
  async onTripLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { tripId?: unknown },
  ): Promise<void> {
    const user = this.requireUser(client);
    if (!user) return;
    const tripId = this.normalizeTripId(payload?.tripId, client);
    if (!tripId) return;
    this.forgetSession(client.id, tripId);
    await client.leave(tripRoomName(tripId));
    client.to(tripRoomName(tripId)).emit('rider:offline', { userId: user.id });
  }

  /**
   * Host presence heartbeat. Only the Jam Host's beats are tracked; a host that
   * comes back online after a disconnect triggers a fresh `jam:state` so every
   * participant sees the Host as available again without a manual refresh.
   */
  @SubscribeMessage('jam:heartbeat')
  async onJamHeartbeat(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { tripId?: unknown },
  ): Promise<void> {
    const user = this.requireUser(client);
    if (!user) return;
    const tripId = this.normalizeTripId(payload?.tripId, client);
    if (!tripId) return;
    if (!(await this.authorize(client, tripId, user.id))) return;

    const result = await this.jam.heartbeat(tripId, user.id);
    if (result.changed && result.state) {
      this.server.to(tripRoomName(tripId)).emit('jam:state', result.state);
    }
  }

  // ------------------------------------------------------------- internals

  private requireUser(client: Socket): AuthenticatedUser | null {
    const user = (client.data as SessionUser)?.user;
    if (!user) {
      this.emitError(client, 'UNAUTHENTICATED', 'Not authenticated.');
    }
    return user ?? null;
  }

  private async authorize(
    client: Socket,
    tripId: string,
    userId: string,
  ): Promise<boolean> {
    try {
      await this.realtime.requireTripAccess(tripId, userId);
      return true;
    } catch (err) {
      if (err instanceof ApiException) {
        this.emitError(client, err.errorCode, err.message);
      } else {
        this.emitError(client, 'FORBIDDEN', 'Access denied.');
      }
      return false;
    }
  }

  private normalizeTripId(tripId: unknown, client: Socket): string | null {
    if (typeof tripId === 'string' && tripId.trim() !== '') {
      return tripId.trim();
    }
    this.emitError(client, 'INVALID_TRIP', 'tripId is required.');
    return null;
  }

  private trackSession(
    client: Socket,
    tripId: string,
    userId: string,
    lastUpdatedAt: number | null,
  ): void {
    let trips = this.sessions.get(client.id);
    if (!trips) {
      trips = new Map();
      this.sessions.set(client.id, trips);
    }
    const existing = trips.get(tripId);
    trips.set(tripId, {
      userId,
      lastUpdatedAt: lastUpdatedAt ?? existing?.lastUpdatedAt ?? Date.now(),
      lastStatus: existing?.lastStatus ?? RiderStatus.LIVE,
    });
  }

  private forgetSession(socketId: string, tripId: string): void {
    const trips = this.sessions.get(socketId);
    if (!trips) return;
    trips.delete(tripId);
    if (trips.size === 0) this.sessions.delete(socketId);
  }

  /** Re-derive rider status from lastUpdatedAt and broadcast transitions. */
  private sweepStatuses(): void {
    const now = Date.now();
    for (const [socketId, trips] of this.sessions) {
      for (const [tripId, session] of trips) {
        const status = computeRiderStatus(
          now - session.lastUpdatedAt,
          this.config.riderLiveThresholdMs,
          this.config.riderDelayedThresholdMs,
        );
        if (status === session.lastStatus) continue;
        session.lastStatus = status;
        this.server
          .to(tripRoomName(tripId))
          .emit('rider:status', { userId: session.userId, status });
        // Stop sweeping riders that are now fully offline — they will
        // re-announce on their next location update.
        if (status === RiderStatus.OFFLINE) {
          trips.delete(tripId);
        }
      }
      if (trips.size === 0) this.sessions.delete(socketId);
    }
  }

  private emitError(client: Socket, code: string, message: string): void {
    client.emit('trip:error', { code, message });
  }
}

function extractToken(client: Socket): string | null {
  const auth = client.handshake.auth as Record<string, unknown> | undefined;
  if (typeof auth?.token === 'string' && auth.token) return auth.token;
  const header = client.handshake.headers?.authorization;
  if (typeof header === 'string') {
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (match) return match[1];
  }
  const query = client.handshake.query;
  if (typeof query?.token === 'string' && query.token) return query.token;
  return null;
}
