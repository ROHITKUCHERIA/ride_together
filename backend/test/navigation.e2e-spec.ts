import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getOptionsToken } from '@nestjs/throttler';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { RoutingService } from './../src/navigation/routing.service';
import { NavigationEvents } from './../src/socket/events/navigation.events';
import type { NormalizedRoute } from './../src/navigation/interfaces/routing-response.interface';

const EVENT_TIMEOUT = 5_000;

jest.setTimeout(120_000);

const ROUTE_FIXTURE: NormalizedRoute = {
  coordinates: [
    { latitude: 17.385, longitude: 78.4867 },
    { latitude: 17.4065, longitude: 78.4772 },
  ],
  distanceMeters: 4200,
  durationSeconds: 900,
};

const DESTINATION = {
  latitude: 17.4065,
  longitude: 78.4772,
  name: 'Goa HQ',
};

function connect(url: string, token?: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(url, {
      auth: token ? { token } : {},
      forceNew: true,
      transports: ['websocket'],
    });
    const cleanup = () => {
      socket.off('trip:error', onError);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      clearTimeout(timer);
    };
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error('socket auth timeout'));
    }, EVENT_TIMEOUT);
    const onError = (e: { code?: string }) => {
      cleanup();
      socket.disconnect();
      reject(new Error(`auth rejected: ${e?.code}`));
    };
    const onDisconnect = () => {
      cleanup();
      reject(new Error('disconnected before auth completed'));
    };
    const onConnectError = (err: Error) => {
      cleanup();
      reject(err);
    };
    socket.once('authenticated', () => {
      cleanup();
      resolve(socket);
    });
    socket.once('trip:error', onError);
    socket.once('disconnect', onDisconnect);
    socket.once('connect_error', onConnectError);
  });
}

function once<T = any>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout waiting for "${event}"`)),
      EVENT_TIMEOUT,
    );
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

/**
 * Group navigation e2e. Requires the database (docker-compose.yml) and boots
 * the real HTTP + Socket.IO server on an ephemeral port. RoutingService is
 * stubbed so the suite never depends on a reachable OSRM instance.
 */
describe('Group Navigation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let url: string;

  const emails = {
    owner: `nav-owner-${Date.now()}@ridetogether.test`,
    rider: `nav-rider-${Date.now()}@ridetogether.test`,
    outsider: `nav-out-${Date.now()}@ridetogether.test`,
  };
  const tokens: Record<string, string> = {};
  const userIds: Record<string, string> = {};
  let tripId = '';
  let inviteCode = '';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(getOptionsToken())
      .useValue([
        { name: 'default', ttl: 60_000, limit: 1000 },
        { name: 'auth', ttl: 60_000, limit: 1000 },
        { name: 'music', ttl: 60_000, limit: 1000 },
        { name: 'navigation', ttl: 60_000, limit: 1000 },
      ])
      .overrideProvider(RoutingService)
      .useValue({ calculateRoute: jest.fn().mockResolvedValue(ROUTE_FIXTURE) })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address() as { port: number };
    url = `http://127.0.0.1:${address.port}`;
    prisma = app.get(PrismaService);

    for (const [key, email] of Object.entries(emails)) {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ name: key, email, password: 'Navigation123' });
      expect(res.status).toBe(201);
      tokens[key] = res.body.data.accessToken;
      userIds[key] = res.body.data.user.id;
    }

    const createRes = await request(app.getHttpServer())
      .post('/api/trips')
      .set('Authorization', `Bearer ${tokens.owner}`)
      .send({
        name: 'Navigation Ride',
        destination: 'Goa',
        startDate: new Date(Date.now() + 86_400_000).toISOString(),
        endDate: new Date(Date.now() + 172_800_000).toISOString(),
      });
    expect(createRes.status).toBe(201);
    tripId = createRes.body.data.id;
    inviteCode = createRes.body.data.inviteCode;

    const joinRes = await request(app.getHttpServer())
      .post('/api/trips/join')
      .set('Authorization', `Bearer ${tokens.rider}`)
      .send({ inviteCode });
    expect(joinRes.status).toBe(201);
  });

  afterAll(async () => {
    if (prisma && tripId) {
      await prisma.trip.deleteMany({ where: { id: tripId } });
    }
    if (prisma) {
      await prisma.user.deleteMany({
        where: { email: { in: Object.values(emails) } },
      });
    }
    await app?.close();
  });

  const putDestination = (token: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .put(`/api/trips/${tripId}/destination`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  describe('scenario 1+3: shared destination lifecycle', () => {
    let ownerSocket: Socket;
    let riderSocket: Socket;

    beforeAll(async () => {
      ownerSocket = await connect(url, tokens.owner);
      riderSocket = await connect(url, tokens.rider);
      ownerSocket.emit('trip:join', { tripId });
      await once(ownerSocket, 'trip:joined');
      riderSocket.emit('trip:join', { tripId });
      await once(riderSocket, 'trip:joined');
    });

    afterAll(() => {
      ownerSocket?.disconnect();
      riderSocket?.disconnect();
    });

    it('returns null before the host sets a destination', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/trips/${tripId}/destination`)
        .set('Authorization', `Bearer ${tokens.rider}`);
      expect(res.status).toBe(200);
      expect(res.body.data.destination).toBeNull();
    });

    it('rejects a non-member destination read', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/trips/${tripId}/destination`)
        .set('Authorization', `Bearer ${tokens.outsider}`);
      expect(res.status).toBe(404);
    });

    it('lets the host set the destination and broadcasts to the trip room', async () => {
      const received = once(
        riderSocket,
        NavigationEvents.TRIP_DESTINATION_UPDATED,
      );
      const res = await putDestination(tokens.owner, DESTINATION);
      expect(res.status).toBe(200);
      expect(res.body.data.destination).toMatchObject({
        latitude: DESTINATION.latitude,
        longitude: DESTINATION.longitude,
        name: DESTINATION.name,
        setByUserId: userIds.owner,
      });

      const payload = await received;
      expect(payload.tripId).toBe(tripId);
      expect(payload.destination).toMatchObject({
        latitude: DESTINATION.latitude,
        longitude: DESTINATION.longitude,
        name: DESTINATION.name,
      });
    });

    it('rejects a rider (non-owner) setting the destination', async () => {
      const res = await putDestination(tokens.rider, DESTINATION);
      expect(res.status).toBe(403);
    });

    it('lets the host update the destination, pushing another event', async () => {
      const updated = { ...DESTINATION, name: 'Goa Beach' };
      const received = once(
        riderSocket,
        NavigationEvents.TRIP_DESTINATION_UPDATED,
      );
      const res = await putDestination(tokens.owner, updated);
      expect(res.status).toBe(200);
      const payload = await received;
      expect(payload.destination.name).toBe('Goa Beach');
    });

    it('lets the host clear the destination, pushing cleared', async () => {
      const received = once(
        riderSocket,
        NavigationEvents.TRIP_DESTINATION_CLEARED,
      );
      const res = await request(app.getHttpServer())
        .delete(`/api/trips/${tripId}/destination`)
        .set('Authorization', `Bearer ${tokens.owner}`);
      expect(res.status).toBe(200);
      const payload = await received;
      expect(payload.tripId).toBe(tripId);
      expect(payload.destination).toBeNull();

      // Restore it so sibling scenarios can use the shared destination.
      await putDestination(tokens.owner, DESTINATION);
    });
  });

  describe('scenario 2: snapshot recovery on reconnect', () => {
    it('returns the shared destination + no active riders for a member', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/trips/${tripId}/navigation`)
        .set('Authorization', `Bearer ${tokens.rider}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.destination).toMatchObject({
        latitude: DESTINATION.latitude,
        longitude: DESTINATION.longitude,
        name: DESTINATION.name,
      });
      expect(res.body.data.riders).toEqual([]);
      expect(res.body.data.groupEta).toBeNull();
    });

    it('blocks a non-member snapshot', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/trips/${tripId}/navigation`)
        .set('Authorization', `Bearer ${tokens.outsider}`);
      expect(res.status).toBe(404);
    });

    it('blocks an unauthenticated snapshot', async () => {
      const res = await request(app.getHttpServer()).get(
        `/api/trips/${tripId}/navigation`,
      );
      expect(res.status).toBe(401);
    });
  });

  describe('scenario 4: session lifecycle + arrival', () => {
    let riderSocket: Socket;

    beforeAll(async () => {
      riderSocket = await connect(url, tokens.rider);
      riderSocket.emit('trip:join', { tripId });
      await once(riderSocket, 'trip:joined');
    });

    afterAll(() => {
      riderSocket?.disconnect();
    });

    it('starts a group session against the shared destination', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/trips/${tripId}/navigation/session`)
        .set('Authorization', `Bearer ${tokens.rider}`)
        .send({ mode: 'group' });
      // Destination is currently set by the previous scenario.
      expect(res.status).toBe(201);
      expect(res.body.data.mode).toBe('group');
      expect(res.body.data.status).toBe('navigating');
    });

    it('accepts a status update carrying an ETA', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/trips/${tripId}/navigation/session`)
        .set('Authorization', `Bearer ${tokens.rider}`)
        .send({ status: 'navigating', eta: Date.now() + 300_000 });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('navigating');
      expect(typeof res.body.data.eta).toBe('number');
    });

    it('exposes the rider in the snapshot and computes group ETA', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/trips/${tripId}/navigation`)
        .set('Authorization', `Bearer ${tokens.owner}`);
      expect(res.status).toBe(200);
      expect(res.body.data.riders).toHaveLength(1);
      expect(res.body.data.riders[0]).toMatchObject({
        userId: userIds.rider,
        status: 'navigating',
        mode: 'group',
      });
      expect(typeof res.body.data.groupEta).toBe('number');
    });

    it('broadcasts navigation:started to the trip room', async () => {
      const restarted = once(riderSocket, NavigationEvents.NAVIGATION_STARTED);
      await request(app.getHttpServer())
        .post(`/api/trips/${tripId}/navigation/session`)
        .set('Authorization', `Bearer ${tokens.rider}`)
        .send({ mode: 'group' });
      const payload = await restarted;
      expect(payload).toMatchObject({
        tripId,
        userId: userIds.rider,
        status: 'navigating',
      });
    });

    it('updates status to arrived and broadcasts it', async () => {
      const received = once(riderSocket, NavigationEvents.NAVIGATION_ARRIVED);
      const res = await request(app.getHttpServer())
        .patch(`/api/trips/${tripId}/navigation/session`)
        .set('Authorization', `Bearer ${tokens.rider}`)
        .send({ status: 'arrived', eta: Date.now() });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('arrived');
      const payload = await received;
      expect(payload.status).toBe('arrived');
    });

    it('excludes arrived riders from the group ETA', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/trips/${tripId}/navigation`)
        .set('Authorization', `Bearer ${tokens.owner}`);
      expect(res.status).toBe(200);
      expect(res.body.data.riders[0].status).toBe('arrived');
      expect(res.body.data.groupEta).toBeNull();
    });

    it('stops the session and broadcasts it', async () => {
      const received = once(riderSocket, NavigationEvents.NAVIGATION_STOPPED);
      const res = await request(app.getHttpServer())
        .delete(`/api/trips/${tripId}/navigation/session`)
        .set('Authorization', `Bearer ${tokens.rider}`);
      expect(res.status).toBe(200);
      const payload = await received;
      expect(payload.status).toBe('idle');

      const snap = await request(app.getHttpServer())
        .get(`/api/trips/${tripId}/navigation`)
        .set('Authorization', `Bearer ${tokens.owner}`);
      expect(snap.body.data.riders).toEqual([]);
    });
  });

  describe('scenario 5: rider going offline', () => {
    it('persists and broadcasts offline when a rider disconnects', async () => {
      await request(app.getHttpServer())
        .post(`/api/trips/${tripId}/navigation/session`)
        .set('Authorization', `Bearer ${tokens.rider}`)
        .send({ mode: 'group' });

      const ownerSocket = await connect(url, tokens.owner);
      ownerSocket.emit('trip:join', { tripId });
      await once(ownerSocket, 'trip:joined');

      const riderSocket = await connect(url, tokens.rider);
      const offline = once(ownerSocket, NavigationEvents.NAVIGATION_STATUS);
      riderSocket.emit('trip:join', { tripId });
      await once(riderSocket, 'trip:joined');
      riderSocket.disconnect();

      const payload = await offline;
      expect(payload.userId).toBe(userIds.rider);
      expect(payload.status).toBe('offline');

      const snap = await request(app.getHttpServer())
        .get(`/api/trips/${tripId}/navigation`)
        .set('Authorization', `Bearer ${tokens.owner}`);
      expect(snap.body.data.riders[0].status).toBe('offline');

      ownerSocket.disconnect();
    });
  });

  describe('scenario 6: distributed reroute cooldown', () => {
    const ORIGIN = { latitude: 17.385, longitude: 78.4867 };

    it('succeeds and returns the requestId + route', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/trips/${tripId}/navigation/reroute`)
        .set('Authorization', `Bearer ${tokens.rider}`)
        .send({
          origin: ORIGIN,
          destination: { latitude: 17.4065, longitude: 78.4772 },
          requestId: 'c1c0de00-0000-4000-8000-000000000001',
        });
      expect(res.status).toBe(201);
      expect(res.body.data.requestId).toBe(
        'c1c0de00-0000-4000-8000-000000000001',
      );
      expect(res.body.data.route.distanceMeters).toBe(4200);
    });

    it('rejects a second reroute inside the cooldown window', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/trips/${tripId}/navigation/reroute`)
        .set('Authorization', `Bearer ${tokens.rider}`)
        .send({
          origin: ORIGIN,
          destination: { latitude: 17.4065, longitude: 78.4772 },
          requestId: 'c1c0de00-0000-4000-8000-000000000002',
        });
      expect(res.status).toBe(429);
      expect(res.body.errorCode).toBe('REROUTE_COOLDOWN');
    });

    it('allows an idempotent retry with the same requestId', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/trips/${tripId}/navigation/reroute`)
        .set('Authorization', `Bearer ${tokens.rider}`)
        .send({
          origin: ORIGIN,
          destination: { latitude: 17.4065, longitude: 78.4772 },
          requestId: 'c1c0de00-0000-4000-8000-000000000001',
        });
      expect(res.status).toBe(201);
      expect(res.body.data.requestId).toBe(
        'c1c0de00-0000-4000-8000-000000000001',
      );
    });
  });
});
