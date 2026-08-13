import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getOptionsToken } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { YouTubeService } from './../src/music/youtube.service';

jest.setTimeout(120_000);

const fakeYouTube = {
  searchVideos: jest.fn().mockResolvedValue({
    items: [
      {
        videoId: 'dQw4w9WgXcQ',
        title: 'Never Gonna Give You Up',
        channelTitle: 'Rick Astley',
        thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
        publishedAt: '2009-10-25T06:57:33Z',
      },
    ],
    nextPageToken: null,
    cached: false,
  }),
  isValidVideoId: (id: unknown): id is string =>
    typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id),
  getVideoDetails: jest
    .fn()
    .mockImplementation((videoId: string) =>
      Promise.resolve({
        videoId,
        title: `Song ${videoId}`,
        channelTitle: 'Test Channel',
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
        durationSeconds: 200,
      }),
    ),
};

describe('Trip Music (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const emails = {
    owner: `music-owner-${Date.now()}@ridetogether.test`,
    member: `music-member-${Date.now()}@ridetogether.test`,
    outsider: `music-out-${Date.now()}@ridetogether.test`,
  };
  const tokens: Record<string, string> = {};
  let tripId = '';
  let inviteCode = '';
  let songId = '';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(getOptionsToken())
      .useValue([
        { name: 'default', ttl: 60_000, limit: 1000 },
        { name: 'auth', ttl: 60_000, limit: 1000 },
        { name: 'music', ttl: 60_000, limit: 1000 },
      ])
      .overrideProvider(YouTubeService)
      .useValue(fakeYouTube)
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
        .send({ name: key, email, password: 'Music123!' });
      expect(res.status).toBe(201);
      tokens[key] = res.body.data.accessToken;
    }

    const createRes = await request(app.getHttpServer())
      .post('/api/trips')
      .set('Authorization', `Bearer ${tokens.owner}`)
      .send({
        name: 'Music Ride',
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
  });

  afterAll(async () => {
    if (prisma && tripId) {
      await prisma.tripSong.deleteMany({ where: { tripId } });
      await prisma.trip.deleteMany({ where: { id: tripId } });
    }
    if (prisma) {
      await prisma.user.deleteMany({
        where: { email: { in: Object.values(emails) } },
      });
    }
    await app?.close();
  });

  it('rejects search without authentication', async () => {
    const res = await request(app.getHttpServer()).get(
      `/api/trips/${tripId}/music/search?q=arijit`,
    );
    expect(res.status).toBe(401);
  });

  it('rejects search for a non-member', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/trips/${tripId}/music/search?q=arijit`)
      .set('Authorization', `Bearer ${tokens.outsider}`);
    expect(res.status).toBe(404);
  });

  it('searches YouTube for a member', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/trips/${tripId}/music/search?q=Rick%20Astley`)
      .set('Authorization', `Bearer ${tokens.member}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items[0].videoId).toBe('dQw4w9WgXcQ');
  });

  it('rejects an empty search query', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/trips/${tripId}/music/search?q=`)
      .set('Authorization', `Bearer ${tokens.member}`);
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('MUSIC_QUERY_REQUIRED');
  });

  it('adds a song to the trip library', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/trips/${tripId}/music`)
      .set('Authorization', `Bearer ${tokens.member}`)
      .send({ youtubeVideoId: 'dQw4w9WgXcQ' });
    expect(res.status).toBe(201);
    expect(res.body.data.youtubeVideoId).toBe('dQw4w9WgXcQ');
    songId = res.body.data.songId;
  });

  it('rejects a duplicate add with a friendly conflict', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/trips/${tripId}/music`)
      .set('Authorization', `Bearer ${tokens.owner}`)
      .send({ youtubeVideoId: 'dQw4w9WgXcQ' });
    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('SONG_ALREADY_ADDED');
  });

  it('rejects an invalid video id', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/trips/${tripId}/music`)
      .set('Authorization', `Bearer ${tokens.member}`)
      .send({ youtubeVideoId: 'not-valid' });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('VALIDATION_ERROR');
  });

  it('adds a second song added by the OWNER (for remove-permission tests)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/trips/${tripId}/music`)
      .set('Authorization', `Bearer ${tokens.owner}`)
      .send({ youtubeVideoId: 'dQw4w9WgXcR' });
    expect(res.status).toBe(201);
    expect(res.body.data.youtubeVideoId).toBe('dQw4w9WgXcR');
  });

  it('lists the trip library for any member', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/trips/${tripId}/music`)
      .set('Authorization', `Bearer ${tokens.owner}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('blocks a non-member from reading the library', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/trips/${tripId}/music`)
      .set('Authorization', `Bearer ${tokens.outsider}`);
    expect(res.status).toBe(404);
  });

  it('removes a song a member did not add (403)', async () => {
    const ownerAdded = await request(app.getHttpServer())
      .get(`/api/trips/${tripId}/music`)
      .set('Authorization', `Bearer ${tokens.member}`);
    // member tries to remove the song the OWNER added
    const ownerSong = ownerAdded.body.data.find(
      (s: any) => s.youtubeVideoId === 'dQw4w9WgXcR',
    );
    const res = await request(app.getHttpServer())
      .delete(`/api/trips/${tripId}/music/${ownerSong.songId}`)
      .set('Authorization', `Bearer ${tokens.member}`);
    expect(res.status).toBe(403);
  });

  it('allows the member who added a song to remove it', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/trips/${tripId}/music/${songId}`)
      .set('Authorization', `Bearer ${tokens.member}`);
    expect(res.status).toBe(200);
  });

  it('allows the OWNER to remove any song', async () => {
    const lib = await request(app.getHttpServer())
      .get(`/api/trips/${tripId}/music`)
      .set('Authorization', `Bearer ${tokens.owner}`);
    const ownerSong = lib.body.data.find(
      (s: any) => s.youtubeVideoId === 'dQw4w9WgXcR',
    );
    const res = await request(app.getHttpServer())
      .delete(`/api/trips/${tripId}/music/${ownerSong.songId}`)
      .set('Authorization', `Bearer ${tokens.owner}`);
    expect(res.status).toBe(200);
  });

  it('returns 404 when removing a song not in the library', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/trips/${tripId}/music/${songId}`)
      .set('Authorization', `Bearer ${tokens.owner}`);
    expect(res.status).toBe(404);
  });
});