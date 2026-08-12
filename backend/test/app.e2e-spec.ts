import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getOptionsToken } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

/**
 * E2E tests against the real API + database.
 *
 * Requires the PostgreSQL/PostGIS database (see docker-compose.yml) to be
 * reachable via DATABASE_URL in backend/.env.
 */
describe('App (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const uniqueEmail = `e2e-${Date.now()}@ridetogether.test`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // Lift rate limits for the test flow (auth endpoints are 5/min by default).
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
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    // Clean up the user created during the run (cascades memberships/tokens).
    if (prisma) {
      await prisma.user.deleteMany({ where: { email: uniqueEmail } });
    }
    await app?.close();
  });

  it('GET /api/health reports ok and reaches the database', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
  });

  it('rejects /api/auth/me without a bearer token', async () => {
    const res = await request(app.getHttpServer()).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.errorCode).toBe('UNAUTHENTICATED');
  });

  describe('auth lifecycle (register -> refresh rotation -> reuse detection -> logout)', () => {
    let accessToken: string;
    let refreshToken1: string;
    let refreshToken2: string;
    let refreshToken3: string;

    it('registers a user and returns tokens', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          name: 'E2E User',
          email: uniqueEmail,
          password: 'E2ePassword123',
        });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeTruthy();
      expect(res.body.data.refreshToken).toBeTruthy();
      accessToken = res.body.data.accessToken;
      refreshToken1 = res.body.data.refreshToken;
    });

    it('returns the current user for a valid access token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe(uniqueEmail);
      expect(res.body.data.passwordHash).toBeUndefined();
    });

    it('rotates the refresh token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: refreshToken1 });
      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeTruthy();
      expect(res.body.data.refreshToken).toBeTruthy();
      refreshToken2 = res.body.data.refreshToken;
    });

    it('rejects a reused (already rotated) refresh token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: refreshToken1 });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe('REFRESH_TOKEN_REUSED');
    });

    it('accepts the successor token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: refreshToken2 });
      expect(res.status).toBe(200);
      refreshToken3 = res.body.data.refreshToken;
    });

    it('logs out (revokes the session)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .send({ refreshToken: refreshToken3 });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('rejects a refresh token that was logged out', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: refreshToken3 });
      expect(res.status).toBe(401);
      expect(res.body.errorCode).toBe('REFRESH_TOKEN_REUSED');
    });
  });
});
