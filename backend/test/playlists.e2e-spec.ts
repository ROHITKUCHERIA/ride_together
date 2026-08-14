import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getOptionsToken } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

jest.setTimeout(120_000);

describe('Playlists (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const emails = {
    owner: `pl-owner-${Date.now()}@ridetogether.test`,
    member: `pl-member-${Date.now()}@ridetogether.test`,
    outsider: `pl-out-${Date.now()}@ridetogether.test`,
  };
  const tokens: Record<string, string> = {};
  let tripId = '';
  let inviteCode = '';
  let songA = '';
  let songB = '';
  let personalPlaylist = '';
  let tripPlaylist = '';
  let publicTripPlaylist = '';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(getOptionsToken())
      .useValue([
        { name: 'default', ttl: 60_000, limit: 2000 },
        { name: 'auth', ttl: 60_000, limit: 2000 },
        { name: 'music', ttl: 60_000, limit: 2000 },
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
    prisma = app.get(PrismaService);

    for (const [key, email] of Object.entries(emails)) {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ name: key, email, password: 'Playlist1!' });
      expect(res.status).toBe(201);
      tokens[key] = res.body.data.accessToken;
    }

    const createRes = await request(app.getHttpServer())
      .post('/api/trips')
      .set('Authorization', `Bearer ${tokens.owner}`)
      .send({
        name: 'Playlist Ride',
        destination: 'Goa',
        startDate: new Date(Date.now() + 86_400_000).toISOString(),
        endDate: new Date(Date.now() + 172_800_000).toISOString(),
      });
    expect(createRes.status).toBe(201);
    tripId = createRes.body.data.id;
    inviteCode = createRes.body.data.inviteCode;

    await request(app.getHttpServer())
      .post('/api/trips/join')
      .set('Authorization', `Bearer ${tokens.member}`)
      .send({ inviteCode });

    // Seed shared Songs directly (they come from the Trip Music flow).
    const [a, b] = await Promise.all([
      prisma.song.create({
        data: {
          youtubeVideoId: 'AAA11111111',
          title: 'Safarnama',
          channelTitle: 'Lucky Ali',
          thumbnailUrl: 'thumb-a.jpg',
          durationSeconds: 282,
        },
      }),
      prisma.song.create({
        data: {
          youtubeVideoId: 'BBB22222222',
          title: 'Ilahi',
          channelTitle: 'Arijit Singh',
          thumbnailUrl: 'thumb-b.jpg',
          durationSeconds: 240,
        },
      }),
    ]);
    songA = a.id;
    songB = b.id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.playlist.deleteMany({ where: { userId: { in: [] } } });
      await prisma.playlistSong.deleteMany({
        where: {
          song: { youtubeVideoId: { in: ['AAA11111111', 'BBB22222222'] } },
        },
      });
      await prisma.song.deleteMany({
        where: { youtubeVideoId: { in: ['AAA11111111', 'BBB22222222'] } },
      });
      await prisma.tripMember.deleteMany({ where: { tripId } });
      await prisma.trip.deleteMany({ where: { id: tripId } });
      await prisma.user.deleteMany({
        where: { email: { in: Object.values(emails) } },
      });
    }
    await app?.close();
  });

  describe('create', () => {
    it('creates a personal playlist', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/playlists')
        .set('Authorization', `Bearer ${tokens.owner}`)
        .send({ name: '  My Ride Mix  ' });
      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('My Ride Mix');
      expect(res.body.data.tripId).toBeNull();
      expect(res.body.data.isPublic).toBe(true);
      expect(res.body.data.songCount).toBe(0);
      personalPlaylist = res.body.data.id;
    });

    it('rejects an empty name', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/playlists')
        .set('Authorization', `Bearer ${tokens.owner}`)
        .send({ name: '   ' });
      expect(res.status).toBe(400);
    });

    it('creates a trip playlist for a member', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/playlists')
        .set('Authorization', `Bearer ${tokens.owner}`)
        .send({
          name: 'Goa Road Trip Mix',
          tripId,
          description: 'Ride vibes',
          isPublic: false,
        });
      expect(res.status).toBe(201);
      expect(res.body.data.tripId).toBe(tripId);
      expect(res.body.data.isPublic).toBe(false);
      tripPlaylist = res.body.data.id;
    });

    it('blocks creating a trip playlist for a non-member', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/playlists')
        .set('Authorization', `Bearer ${tokens.outsider}`)
        .send({ name: 'Sneak', tripId });
      expect(res.status).toBe(404);
    });

    it('creates a public trip playlist', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/playlists')
        .set('Authorization', `Bearer ${tokens.member}`)
        .send({ name: 'Public Trip Mix', tripId });
      expect(res.status).toBe(201);
      publicTripPlaylist = res.body.data.id;
    });
  });

  describe('add / remove songs', () => {
    it('adds a song to my playlist', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/playlists/${personalPlaylist}/songs`)
        .set('Authorization', `Bearer ${tokens.owner}`)
        .send({ songId: songA });
      expect(res.status).toBe(201);
      expect(res.body.data.songId).toBe(songA);
      expect(res.body.data.position).toBe(0);
    });

    it('rejects a duplicate add with 409', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/playlists/${personalPlaylist}/songs`)
        .set('Authorization', `Bearer ${tokens.owner}`)
        .send({ songId: songA });
      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe('SONG_ALREADY_IN_PLAYLIST');
    });

    it('rejects an unknown song with 404', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/playlists/${personalPlaylist}/songs`)
        .set('Authorization', `Bearer ${tokens.owner}`)
        .send({ songId: '00000000-0000-4000-8000-000000000000' });
      expect(res.status).toBe(404);
    });

    it('adds a second song', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/playlists/${personalPlaylist}/songs`)
        .set('Authorization', `Bearer ${tokens.owner}`)
        .send({ songId: songB });
      expect(res.status).toBe(201);
      expect(res.body.data.position).toBe(1);
    });

    it('removes a song (Song remains in the Song table)', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/playlists/${personalPlaylist}/songs/${songA}`)
        .set('Authorization', `Bearer ${tokens.owner}`);
      expect(res.status).toBe(200);

      const still = await prisma.song.findUnique({ where: { id: songA } });
      expect(still).not.toBeNull();
    });

    it('returns 404 when removing a song not in the playlist', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/playlists/${personalPlaylist}/songs/${songA}`)
        .set('Authorization', `Bearer ${tokens.owner}`);
      expect(res.status).toBe(404);
      expect(res.body.errorCode).toBe('SONG_NOT_IN_PLAYLIST');
    });
  });

  describe('concurrent duplicate add (race protection)', () => {
    it('only one of two parallel adds succeeds', async () => {
      const target = personalPlaylist;
      const first = request(app.getHttpServer())
        .post(`/api/playlists/${target}/songs`)
        .set('Authorization', `Bearer ${tokens.owner}`)
        .send({ songId: songA });
      const second = request(app.getHttpServer())
        .post(`/api/playlists/${target}/songs`)
        .set('Authorization', `Bearer ${tokens.owner}`)
        .send({ songId: songA });

      const [r1, r2] = await Promise.all([first, second]);
      const statuses = [r1.status, r2.status].sort();
      expect(statuses).toEqual([201, 409]);
    });
  });

  describe('reorder', () => {
    it('reorders songs by supplying the full new order', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/playlists/${personalPlaylist}/songs/reorder`)
        .set('Authorization', `Bearer ${tokens.owner}`)
        .send({ songIds: [songA, songB] });
      expect(res.status).toBe(200);

      const detail = await request(app.getHttpServer())
        .get(`/api/playlists/${personalPlaylist}`)
        .set('Authorization', `Bearer ${tokens.owner}`);
      expect(detail.body.data.songs.map((s: any) => s.songId)).toEqual([
        songA,
        songB,
      ]);
      expect(detail.body.data.songs.map((s: any) => s.position)).toEqual([
        0, 1,
      ]);
    });

    it('rejects a mismatched order', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/playlists/${personalPlaylist}/songs/reorder`)
        .set('Authorization', `Bearer ${tokens.owner}`)
        .send({ songIds: [songA] });
      expect(res.status).toBe(409);
      expect(res.body.errorCode).toBe('PLAYLIST_REORDER_MISMATCH');
    });
  });

  describe('permissions', () => {
    it('blocks adding to someone else\u2019s playlist', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/playlists/${personalPlaylist}/songs`)
        .set('Authorization', `Bearer ${tokens.member}`)
        .send({ songId: songA });
      expect(res.status).toBe(403);
    });

    it('blocks reordering someone else\u2019s playlist', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/playlists/${personalPlaylist}/songs/reorder`)
        .set('Authorization', `Bearer ${tokens.member}`)
        .send({ songIds: [songA, songB] });
      expect(res.status).toBe(403);
    });

    it('blocks deleting someone else\u2019s playlist', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/playlists/${personalPlaylist}`)
        .set('Authorization', `Bearer ${tokens.member}`);
      expect(res.status).toBe(403);
    });

    it('blocks viewing a private playlist owned by someone else', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/playlists/${tripPlaylist}`)
        .set('Authorization', `Bearer ${tokens.member}`);
      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('PLAYLIST_ACCESS_DENIED');
    });

    it('allows viewing a public personal playlist', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/playlists/${personalPlaylist}`)
        .set('Authorization', `Bearer ${tokens.member}`);
      expect(res.status).toBe(200);
    });

    it('allows a member to view a public trip playlist', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/playlists/${publicTripPlaylist}`)
        .set('Authorization', `Bearer ${tokens.member}`);
      expect(res.status).toBe(200);
      expect(res.body.data.trip.id).toBe(tripId);
    });

    it('blocks a non-member from a public trip playlist', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/playlists/${publicTripPlaylist}`)
        .set('Authorization', `Bearer ${tokens.outsider}`);
      expect(res.status).toBe(404);
    });

    it('requires authentication everywhere', async () => {
      const res = await request(app.getHttpServer()).get('/api/playlists');
      expect(res.status).toBe(401);
    });
  });

  describe('lists', () => {
    it('lists my playlists (mine only)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/playlists')
        .set('Authorization', `Bearer ${tokens.owner}`);
      expect(res.status).toBe(200);
      const ids = res.body.data.map((p: any) => p.id);
      expect(ids).toContain(personalPlaylist);
      expect(ids).toContain(tripPlaylist);
      expect(ids).not.toContain(publicTripPlaylist);
    });

    it('lists trip playlists for a member (public + own)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/trips/${tripId}/playlists`)
        .set('Authorization', `Bearer ${tokens.member}`);
      expect(res.status).toBe(200);
      const ids = res.body.data.map((p: any) => p.id);
      expect(ids).toContain(publicTripPlaylist);
      expect(ids).not.toContain(tripPlaylist); // owner-private
    });

    it('lists trip playlists including my own private ones', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/trips/${tripId}/playlists`)
        .set('Authorization', `Bearer ${tokens.owner}`);
      expect(res.status).toBe(200);
      const ids = res.body.data.map((p: any) => p.id);
      expect(ids).toContain(tripPlaylist);
    });

    it('blocks a non-member from listing trip playlists', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/trips/${tripId}/playlists`)
        .set('Authorization', `Bearer ${tokens.outsider}`);
      expect(res.status).toBe(404);
    });
  });

  describe('update / delete', () => {
    it('updates my playlist', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/playlists/${personalPlaylist}`)
        .set('Authorization', `Bearer ${tokens.owner}`)
        .send({ name: 'Renamed Mix', isPublic: false });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Renamed Mix');
      expect(res.body.data.isPublic).toBe(false);
    });

    it('blocks updating someone else\u2019s playlist', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/playlists/${personalPlaylist}`)
        .set('Authorization', `Bearer ${tokens.member}`)
        .send({ name: 'Hijack' });
      expect(res.status).toBe(403);
    });

    it('deletes my playlist and its song links', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/playlists/${personalPlaylist}`)
        .set('Authorization', `Bearer ${tokens.owner}`);
      expect(res.status).toBe(200);

      const links = await prisma.playlistSong.count({
        where: { playlistId: personalPlaylist },
      });
      expect(links).toBe(0);

      // Songs are untouched by the playlist deletion.
      const still = await prisma.song.findUnique({ where: { id: songA } });
      expect(still).not.toBeNull();
    });

    it('returns 404 for a deleted playlist', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/playlists/${personalPlaylist}`)
        .set('Authorization', `Bearer ${tokens.owner}`);
      expect(res.status).toBe(404);
    });
  });
});
