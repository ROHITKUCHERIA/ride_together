import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../config/app.config';
import { ApiException } from '../common/filters/all-exceptions.filter';
import { ErrorCodes } from '../common/constants/error-codes';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
    refreshToken: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let jwt: { signAsync: jest.Mock };
  let config: Record<string, string>;

  const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const makeSession = (overrides: Record<string, unknown> = {}) => ({
    id: 'session-1',
    userId: 'user-1',
    tokenHash: 'hash',
    expiresAt: future,
    revokedAt: null,
    replacedById: null,
    ...overrides,
  });

  const txMock = (): any => prisma;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      refreshToken: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'new-session' }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(txMock()),
      ),
    };

    jwt = { signAsync: jest.fn().mockResolvedValue('signed-access-token') };
    config = {
      jwtAccessSecret: 'access-secret',
      jwtRefreshSecret: 'refresh-secret',
      refreshHashPepper: '',
      jwtAccessExpiresIn: '15m',
      jwtRefreshExpiresIn: '7d',
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: AppConfig, useValue: config },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('creates the user and an initial refresh session atomically', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'user-1',
        name: 'Test User',
        email: 'test@example.com',
        avatarUrl: null,
        createdAt: new Date(),
      });

      const result = await service.register({
        name: '  Test User  ',
        email: '  TEST@Example.COM ',
        password: 'Password123',
      });

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'test@example.com' }),
        }),
      );
      // Refresh session created inside the same transaction.
      expect(prisma.refreshToken.create).toHaveBeenCalled();
      expect(jwt.signAsync).toHaveBeenCalled();
      expect(result.accessToken).toBe('signed-access-token');
      expect(result.refreshToken).toBeTruthy();
      expect(result.user.email).toBe('test@example.com');
    });

    it('rejects a duplicate email', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.register({
          name: 'Test User',
          email: 'test@example.com',
          password: 'Password123',
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        errorCode: ErrorCodes.EMAIL_ALREADY_EXISTS,
      });
    });
  });

  describe('login', () => {
    it('issues tokens for valid credentials', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        passwordHash:
          '$2a$12$LJx1WKyvvfLk/eZWm7xGG.QU7hq5z1cP4VxQvHt0q7rLpYtGwqH0G', // dummy
      });
      const bcrypt = require('bcryptjs');
      jest.spyOn(bcrypt, 'compare').mockImplementationOnce(async () => true);

      const tokens = await service.login('test@example.com', 'Password123');
      expect(tokens.accessToken).toBe('signed-access-token');
      expect(tokens.refreshToken).toBeTruthy();
    });

    it('returns a generic error for a wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        passwordHash: 'hash',
      });
      const bcrypt = require('bcryptjs');
      jest.spyOn(bcrypt, 'compare').mockImplementationOnce(async () => false);

      await expect(
        service.login('test@example.com', 'WrongPass1'),
      ).rejects.toMatchObject({
        status: HttpStatus.UNAUTHORIZED,
        errorCode: ErrorCodes.INVALID_CREDENTIALS,
      });
    });
  });

  describe('refresh', () => {
    it('rotates a valid refresh token (old session revoked, new issued)', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(makeSession());

      const result = await service.refresh('some-raw-token');

      expect(result.accessToken).toBe('signed-access-token');
      expect(result.refreshToken).toBeTruthy();
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ revokedAt: null }),
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
      expect(prisma.refreshToken.create).toHaveBeenCalled();
    });

    it('rejects a reused (revoked) token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(
        makeSession({ revokedAt: new Date() }),
      );

      await expect(service.refresh('stolen-token')).rejects.toMatchObject({
        status: HttpStatus.UNAUTHORIZED,
        errorCode: ErrorCodes.REFRESH_TOKEN_REUSED,
      });
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a token that was concurrently claimed (count 0)', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(makeSession());
      prisma.refreshToken.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.refresh('racing-token')).rejects.toMatchObject({
        status: HttpStatus.UNAUTHORIZED,
        errorCode: ErrorCodes.REFRESH_TOKEN_REUSED,
      });
    });

    it('rejects an expired token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(
        makeSession({ expiresAt: past }),
      );

      await expect(service.refresh('expired-token')).rejects.toMatchObject({
        status: HttpStatus.UNAUTHORIZED,
        errorCode: ErrorCodes.INVALID_REFRESH_TOKEN,
      });
    });

    it('rejects an unknown token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refresh('unknown-token')).rejects.toMatchObject({
        status: HttpStatus.UNAUTHORIZED,
        errorCode: ErrorCodes.INVALID_REFRESH_TOKEN,
      });
    });
  });

  describe('logout', () => {
    it('revokes the given refresh token session', async () => {
      await service.logout('raw-token');
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ revokedAt: null }),
        }),
      );
    });
  });

  describe('getMe', () => {
    it('returns the public profile', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        name: 'Test User',
        email: 'test@example.com',
        avatarUrl: null,
        createdAt: new Date(),
      });
      const me = await service.getMe('user-1');
      expect(me.id).toBe('user-1');
      expect((me as any).passwordHash).toBeUndefined();
    });

    it('throws when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getMe('missing')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        errorCode: ErrorCodes.USER_NOT_FOUND,
      });
    });
  });

  it('throws an ApiException (smoke check)', () => {
    const err = new ApiException(
      HttpStatus.BAD_REQUEST,
      'nope',
      ErrorCodes.VALIDATION_ERROR,
    );
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.message).toBe('nope');
    expect(err.errorCode).toBe(ErrorCodes.VALIDATION_ERROR);
  });
});
