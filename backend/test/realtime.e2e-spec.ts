import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getOptionsToken } from '@nestjs/throttler';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

const EVENT_TIMEOUT = 5_000;

jest.setTimeout(120_000);

function connect(url: string, token?: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(url, {
      auth: token ? { token } : {},
      forceNew: true,
      transports: ['websocket'],
    });
    // Cleanup removes these once-listeners on success so they never consume
    // events meant for later tests on the same socket.
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

const validUpdate = (tripId: string, ts = Date.now()) => ({
  tripId,
  latitude: 15.4989,
  longitude: 73.8278,
  accuracy: 10,
  speed: 70,
  heading: 90,
  timestamp: ts,
});

/**
 * Real-time GPS e2e. Requires the database (docker-compose.yml) and boots the
 * real HTTP + Socket.IO server on an ephemeral port.
 */
describe('Realtime (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let url: string;

  const emails = {
    owner: `rt-owner-${Date.now()}@ridetogether.test`,
    member: `rt-member-${Date.now()}@ridetogether.test`,
    outsider: `rt-out-${Date.now()}@ridetogether.test`,
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
      ])
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

    // Register 3 users.
    for (const [key, email] of Object.entries(emails)) {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ name: key, email, password: 'Realtime123' });
      expect(res.status).toBe(201);
      tokens[key] = res.body.data.accessToken;
      userIds[key] = res.body.data.user.id;
    }

    // Owner creates a trip; member joins by invite code.
    const createRes = await request(app.getHttpServer())
      .post('/api/trips')
      .set('Authorization', `Bearer ${tokens.owner}`)
      .send({
        name: 'Realtime Ride',
        destination: 'Goa',
        startDate: new Date(Date.now() + 86_400_000).toISOString(),
        endDate: new Date(Date.now() + 172_800_000).toISOString(),
      });
    expect(createRes.status).toBe(201);
    tripId = createRes.body.data.id;
    inviteCode = createRes.body.data.inviteCode;

    const joinRes = await request(app.getHttpServer())
      .post('/api/trips/join')
      .set('Authorization', `Bearer ${tokens.member}`)
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

  describe('authentication', () => {
    it('rejects a socket without a token', async () => {
      const socket = io(url, { forceNew: true, transports: ['websocket'] });
      const errorP = once(socket, 'trip:error');
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', () => resolve());
        socket.once('connect_error', reject);
      });
      try {
        const error = await errorP;
        expect(error.code).toBe('UNAUTHENTICATED');
      } finally {
        socket.disconnect();
      }
    });

    it('rejects a socket with a garbage token', async () => {
      const socket = io(url, {
        auth: { token: 'not-a-jwt' },
        forceNew: true,
        transports: ['websocket'],
      });
      const errorP = once(socket, 'trip:error');
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', () => resolve());
        socket.once('connect_error', reject);
      });
      try {
        const error = await errorP;
        expect(error.code).toBe('UNAUTHENTICATED');
      } finally {
        socket.disconnect();
      }
    });
  });

  describe('joining trips', () => {
    it('lets a member join the trip room', async () => {
      const socket = await connect(url, tokens.owner);
      try {
        socket.emit('trip:join', { tripId });
        const joined = await once(socket, 'trip:joined');
        expect(joined.tripId).toBe(tripId);
        expect(Array.isArray(joined.riders)).toBe(true);
      } finally {
        socket.disconnect();
      }
    });

    it('rejects a non-member', async () => {
      const socket = await connect(url, tokens.outsider);
      try {
        const errorP = once(socket, 'trip:error');
        socket.emit('trip:join', { tripId });
        const error = await errorP;
        expect(error.code).toBe('TRIP_NOT_FOUND');
      } finally {
        socket.disconnect();
      }
    });
  });

  describe('location updates', () => {
    let ownerSocket: Socket;
    let memberSocket: Socket;

    beforeAll(async () => {
      ownerSocket = await connect(url, tokens.owner);
      memberSocket = await connect(url, tokens.member);
      ownerSocket.emit('trip:join', { tripId });
      await once(ownerSocket, 'trip:joined');
      memberSocket.emit('trip:join', { tripId });
      await once(memberSocket, 'trip:joined');
    });

    afterAll(() => {
      ownerSocket?.disconnect();
      memberSocket?.disconnect();
    });

    it('accepts a valid update and broadcasts it to other members', async () => {
      const others = once(memberSocket, 'location:updated');
      ownerSocket.emit('location:update', validUpdate(tripId));
      const own = await once(ownerSocket, 'location:updated');
      const broadcast = await others;

      expect(own.userId).toBe(userIds.owner);
      expect(own.latitude).toBeCloseTo(15.4989, 3);
      expect(own.status).toBe('LIVE');

      expect(broadcast.userId).toBe(userIds.owner);
      expect(broadcast.latitude).toBeCloseTo(15.4989, 3);
    });

    it('rejects an out-of-range latitude', async () => {
      const invalid = { ...validUpdate(tripId), latitude: 91 };
      const errorP = once(ownerSocket, 'trip:error');
      ownerSocket.emit('location:update', invalid);
      const error = await errorP;
      expect(error.code).toBe('INVALID_LATITUDE');
    });

    it('rejects a stale timestamp', async () => {
      const stale = { ...validUpdate(tripId), timestamp: Date.now() - 600_000 };
      const errorP = once(ownerSocket, 'trip:error');
      ownerSocket.emit('location:update', stale);
      const error = await errorP;
      expect(error.code).toBe('STALE_TIMESTAMP');
    });

    it('rejects a non-member trying to send a location (impersonation)', async () => {
      const socket = await connect(url, tokens.outsider);
      try {
        const errorP = once(socket, 'trip:error');
        socket.emit('location:update', validUpdate(tripId));
        const error = await errorP;
        expect(error.code).toBe('TRIP_NOT_FOUND');
      } finally {
        socket.disconnect();
      }
    });

    it('throttles excessive updates', async () => {
      const first = once(memberSocket, 'location:updated');
      memberSocket.emit('location:update', validUpdate(tripId));
      await first; // wait for the throttle window to start

      const errorP = once(memberSocket, 'trip:error');
      memberSocket.emit('location:update', validUpdate(tripId));
      const error = await errorP;
      expect(error.code).toBe('RATE_LIMITED');
    });
  });

  describe('current location REST API', () => {
    it('returns member locations for a member', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/trips/${tripId}/locations`)
        .set('Authorization', `Bearer ${tokens.owner}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const riderIds = res.body.data.map((r: { userId: string }) => r.userId);
      // Only riders who actually sent an update appear.
      expect(riderIds).toContain(userIds.owner);
      for (const rider of res.body.data) {
        expect(rider.email).toBeUndefined();
        expect(typeof rider.latitude).toBe('number');
        expect(typeof rider.status).toBe('string');
      }
    });

    it('blocks a non-member', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/trips/${tripId}/locations`)
        .set('Authorization', `Bearer ${tokens.outsider}`);
      expect(res.status).toBe(404);
    });

    it('blocks unauthenticated requests', async () => {
      const res = await request(app.getHttpServer()).get(
        `/api/trips/${tripId}/locations`,
      );
      expect(res.status).toBe(401);
    });
  });

  describe('disconnect / reconnect', () => {
    it('broadcasts rider:offline on disconnect and re-syncs on reconnect', async () => {
      const ownerSocket = await connect(url, tokens.owner);
      ownerSocket.emit('trip:join', { tripId });
      await once(ownerSocket, 'trip:joined');

      const memberSocket = await connect(url, tokens.member);
      const offline = once(ownerSocket, 'rider:offline');
      memberSocket.emit('trip:join', { tripId });
      await once(memberSocket, 'trip:joined');
      memberSocket.disconnect();
      const offlineEvent = await offline;
      expect(offlineEvent.userId).toBeDefined();

      // Reconnect: the snapshot still contains the rider's last position.
      const memberSocket2 = await connect(url, tokens.member);
      try {
        memberSocket2.emit('trip:join', { tripId });
        const joined = await once(memberSocket2, 'trip:joined');
        expect(Array.isArray(joined.riders)).toBe(true);
      } finally {
        memberSocket2.disconnect();
        ownerSocket.disconnect();
      }
    });
  });
});
