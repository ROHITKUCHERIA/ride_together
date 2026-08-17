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
 * End-to-end coverage for the realtime Jam feature: creation (one active Jam
 * per trip), join, host-only control, deletion, and the Socket.IO broadcasts
 * that keep every participant synchronized.
 */
describe('Jam (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let url: string;

  const emails = {
    host: `jam-host-${Date.now()}@ridetogether.test`,
    rider: `jam-rider-${Date.now()}@ridetogether.test`,
    outsider: `jam-out-${Date.now()}@ridetogether.test`,
  };
  const tokens: Record<string, string> = {};
  const userIds: Record<string, string> = {};
  let tripId = '';
  let inviteCode = '';
  let jamId = '';
  let songId = '';
  let youtubeVideoId = '';

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

    for (const [key, email] of Object.entries(emails)) {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ name: key, email, password: 'JamJam123' });
      expect(res.status).toBe(201);
      tokens[key] = res.body.data.accessToken;
      userIds[key] = res.body.data.user.id;
    }

    const createRes = await request(app.getHttpServer())
      .post('/api/trips')
      .set('Authorization', `Bearer ${tokens.host}`)
      .send({
        name: 'Jam Ride',
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

    // Add a song to the trip library so the Host can play it. A unique video id
    // per run keeps the spec idempotent (the Song row is shared globally).
    youtubeVideoId = `jam${String(Date.now()).slice(-8)}`;
    const song = await prisma.song.create({
      data: {
        youtubeVideoId,
        title: 'Jam Test Song',
        channelTitle: 'Jam Test',
        thumbnailUrl: null,
        durationSeconds: 200,
      },
    });
    const tripSong = await prisma.tripSong.create({
      data: { tripId, songId: song.id, addedByUserId: userIds.host },
    });
    songId = song.id;
    youtubeVideoId = song.youtubeVideoId;
    expect(tripSong.id).toBeTruthy();
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.jamSession.deleteMany({ where: { tripId } });
      await prisma.tripSong.deleteMany({ where: { tripId } });
      await prisma.song.deleteMany({ where: { id: songId } });
      await prisma.trip.deleteMany({ where: { id: tripId } });
      await prisma.user.deleteMany({
        where: { email: { in: Object.values(emails) } },
      });
    }
    await app?.close();
  });

  describe('create', () => {
    it('creates a Jam with the caller as Host and first participant', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/trips/${tripId}/jam`)
        .set('Authorization', `Bearer ${tokens.host}`);
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      const state = res.body.data;
      jamId = state.jamId;
      expect(state.tripId).toBe(tripId);
      expect(state.hostId).toBe(userIds.host);
      expect(state.hostName).toBe('host');
      expect(state.hostOnline).toBe(true);
      expect(state.participants).toHaveLength(1);
      expect(state.participants[0].userId).toBe(userIds.host);
      expect(typeof state.positionAt).toBe('number');
      expect(typeof state.serverTime).toBe('number');
    });

    it('returns the existing active Jam instead of creating a second one', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/trips/${tripId}/jam`)
        .set('Authorization', `Bearer ${tokens.host}`);
      expect(res.status).toBe(201);
      expect(res.body.data.jamId).toBe(jamId);
    });

    it('blocks a non-member from creating a Jam', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/trips/${tripId}/jam`)
        .set('Authorization', `Bearer ${tokens.outsider}`);
      expect(res.status).toBe(404);
    });

    it('blocks unauthenticated creation', async () => {
      const res = await request(app.getHttpServer()).post(
        `/api/trips/${tripId}/jam`,
      );
      expect(res.status).toBe(401);
    });
  });

  describe('state retrieval', () => {
    it('returns the active Jam for the trip', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/trips/${tripId}/jam`)
        .set('Authorization', `Bearer ${tokens.rider}`);
      expect(res.status).toBe(200);
      expect(res.body.data.jamId).toBe(jamId);
    });

    it('returns the authoritative state for a specific Jam', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/jam/${jamId}/state`)
        .set('Authorization', `Bearer ${tokens.rider}`);
      expect(res.status).toBe(200);
      expect(res.body.data.stateVersion).toBeGreaterThanOrEqual(0);
    });

    it('blocks a non-member from reading state', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/jam/${jamId}/state`)
        .set('Authorization', `Bearer ${tokens.outsider}`);
      expect(res.status).toBe(404);
    });
  });

  describe('join / leave', () => {
    it('lets a trip member join as a participant', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/jam/${jamId}/join`)
        .set('Authorization', `Bearer ${tokens.rider}`);
      expect(res.status).toBe(200);
      const participantIds = res.body.data.participants.map(
        (p: { userId: string }) => p.userId,
      );
      expect(participantIds).toContain(userIds.rider);
      expect(participantIds).toHaveLength(2);
    });

    it('joining again is a no-op that returns the fresh state', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/jam/${jamId}/join`)
        .set('Authorization', `Bearer ${tokens.rider}`);
      expect(res.status).toBe(200);
      expect(res.body.data.participants).toHaveLength(2);
    });

    it('blocks a non-member from joining', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/jam/${jamId}/join`)
        .set('Authorization', `Bearer ${tokens.outsider}`);
      expect(res.status).toBe(404);
    });

    it('lets a participant leave and updates the broadcast state', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/jam/${jamId}/leave`)
        .set('Authorization', `Bearer ${tokens.rider}`);
      expect(res.status).toBe(200);
      expect(res.body.data.participants).toHaveLength(1);
    });

    it('blocks the Host from leaving (they must end the Jam)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/jam/${jamId}/leave`)
        .set('Authorization', `Bearer ${tokens.host}`);
      expect(res.status).toBe(400);
    });
  });

  describe('host control', () => {
    it('lets the Host change the song atomically', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/jam/${jamId}/control`)
        .set('Authorization', `Bearer ${tokens.host}`)
        .send({ action: 'song_changed', songId, isPlaying: true });
      expect(res.status).toBe(200);
      const state = res.body.data;
      expect(state.currentSong.songId).toBe(songId);
      expect(state.currentSong.youtubeVideoId).toBe(youtubeVideoId);
      expect(state.position).toBe(0);
      expect(state.isPlaying).toBe(true);
      expect(state.stateVersion).toBeGreaterThan(0);
    });

    it('rejects changing to a song outside the trip library', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/jam/${jamId}/control`)
        .set('Authorization', `Bearer ${tokens.host}`)
        .send({ action: 'song_changed', songId: '11111111-1111-1111-1111-111111111111' });
      expect(res.status).toBe(400);
    });

    it('lets the Host play/pause/seek', async () => {
      const playRes = await request(app.getHttpServer())
        .post(`/api/jam/${jamId}/control`)
        .set('Authorization', `Bearer ${tokens.host}`)
        .send({ action: 'play', position: 40 });
      expect(playRes.status).toBe(200);
      expect(playRes.body.data.isPlaying).toBe(true);
      expect(playRes.body.data.position).toBe(40);

      const seekRes = await request(app.getHttpServer())
        .post(`/api/jam/${jamId}/control`)
        .set('Authorization', `Bearer ${tokens.host}`)
        .send({ action: 'seek', position: 120 });
      expect(seekRes.status).toBe(200);
      expect(seekRes.body.data.position).toBe(120);

      const pauseRes = await request(app.getHttpServer())
        .post(`/api/jam/${jamId}/control`)
        .set('Authorization', `Bearer ${tokens.host}`)
        .send({ action: 'pause', position: 121 });
      expect(pauseRes.status).toBe(200);
      expect(pauseRes.body.data.isPlaying).toBe(false);
      expect(pauseRes.body.data.position).toBe(121);
    });

    it('rejects control from a non-host participant', async () => {
      await request(app.getHttpServer())
        .post(`/api/jam/${jamId}/join`)
        .set('Authorization', `Bearer ${tokens.rider}`);
      const res = await request(app.getHttpServer())
        .post(`/api/jam/${jamId}/control`)
        .set('Authorization', `Bearer ${tokens.rider}`)
        .send({ action: 'play', position: 0 });
      expect(res.status).toBe(403);
    });
  });

  describe('realtime broadcasts', () => {
    let hostSocket: Socket;
    let riderSocket: Socket;

    beforeAll(async () => {
      hostSocket = await connect(url, tokens.host);
      riderSocket = await connect(url, tokens.rider);
      hostSocket.emit('trip:join', { tripId });
      await once(hostSocket, 'trip:joined');
      riderSocket.emit('trip:join', { tripId });
      await once(riderSocket, 'trip:joined');
    });

    afterAll(() => {
      hostSocket?.disconnect();
      riderSocket?.disconnect();
    });

    it('broadcasts jam:state to the trip room on a host control action', async () => {
      const nextStateP = once(riderSocket, 'jam:state');
      await request(app.getHttpServer())
        .post(`/api/jam/${jamId}/control`)
        .set('Authorization', `Bearer ${tokens.host}`)
        .send({ action: 'play', position: 10 });
      const state = await nextStateP;
      expect(state.jamId).toBe(jamId);
      expect(state.isPlaying).toBe(true);
      expect(typeof state.stateVersion).toBe('number');
    });

    it('removes a participant from the Jam when their socket disconnects', async () => {
      // rider is a participant; when its socket drops the Host sees the count
      // update in realtime without any refresh.
      const stateP = once(hostSocket, 'jam:state');
      riderSocket.disconnect();
      const state = await stateP;
      const ids = state.participants.map((p: { userId: string }) => p.userId);
      expect(ids).not.toContain(userIds.rider);

      // Reconnect the rider for the remaining realtime tests.
      riderSocket = await connect(url, tokens.rider);
      riderSocket.emit('trip:join', { tripId });
      await once(riderSocket, 'trip:joined');
    });

    it('marks the Host offline when their socket disconnects', async () => {
      const stateP = once(riderSocket, 'jam:state');
      hostSocket.disconnect();
      const state = await stateP;
      expect(state.hostOnline).toBe(false);
    });

    it('broadcasts jam:deleted when the Host ends the Jam', async () => {
      // Reconnect the host so it is the one deleting.
      const hostSocket2 = await connect(url, tokens.host);
      try {
        hostSocket2.emit('trip:join', { tripId });
        await once(hostSocket2, 'trip:joined');

        const deletedP = once(riderSocket, 'jam:deleted');
        const res = await request(app.getHttpServer())
          .delete(`/api/jam/${jamId}`)
          .set('Authorization', `Bearer ${tokens.host}`);
        expect(res.status).toBe(200);
        const deleted = await deletedP;
        expect(deleted.jamId).toBe(jamId);
        expect(deleted.tripId).toBe(tripId);
        expect(deleted.reason).toBe('HOST_ENDED');
      } finally {
        hostSocket2.disconnect();
      }
    });

    it('cannot join a deleted Jam (prevents race with a stale client)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/jam/${jamId}/join`)
        .set('Authorization', `Bearer ${tokens.rider}`);
      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe('JAM_ENDED');
    });

    it('a deleted Jam is not returned as the active Jam for the trip', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/trips/${tripId}/jam`)
        .set('Authorization', `Bearer ${tokens.host}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toBeNull();
    });

    it('a new Jam can be created immediately after deletion', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/trips/${tripId}/jam`)
        .set('Authorization', `Bearer ${tokens.host}`);
      expect(res.status).toBe(201);
      expect(res.body.data.jamId).not.toBe(jamId);
      jamId = res.body.data.jamId;
    });
  });
});
