import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { HttpStatus } from '@nestjs/common';
import { RealtimeService } from './realtime.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../config/app.config';
import { TripAccessService } from '../common/services/trip-access.service';
import { ErrorCodes } from '../common/constants/error-codes';
import { TripStatus } from '../../generated/prisma/enums';

describe('RealtimeService', () => {
  let service: RealtimeService;
  let prisma: any;
  let jwt: { verifyAsync: jest.Mock };
  let access: { requireMember: jest.Mock };
  let config: any;

  const now = 1_700_000_000_000;

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      currentLocation: { upsert: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(prisma),
      ),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    jwt = { verifyAsync: jest.fn() };
    access = { requireMember: jest.fn() };
    config = {
      jwtAccessSecret: 'access-secret',
      locationUpdateMinIntervalMs: 3_000,
      riderLiveThresholdMs: 15_000,
      riderDelayedThresholdMs: 60_000,
      locationMaxAgeMs: 300_000,
      locationMaxFutureMs: 30_000,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RealtimeService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: AppConfig, useValue: config },
        { provide: TripAccessService, useValue: access },
      ],
    }).compile();

    service = module.get<RealtimeService>(RealtimeService);
  });

  describe('verifyToken', () => {
    it('returns the user for a valid access token', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', type: 'access' });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        name: 'Rohit',
        email: 'rohit@test.app',
      });
      const user = await service.verifyToken('token');
      expect(user?.id).toBe('user-1');
    });

    it('rejects a refresh-typed token', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', type: 'refresh' });
      expect(await service.verifyToken('token')).toBeNull();
    });

    it('rejects a deleted user', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', type: 'access' });
      prisma.user.findUnique.mockResolvedValue(null);
      expect(await service.verifyToken('token')).toBeNull();
    });

    it('rejects an invalid/expired token', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));
      expect(await service.verifyToken('bad')).toBeNull();
    });
  });

  describe('requireTripAccess', () => {
    it('accepts a member of an active trip', async () => {
      access.requireMember.mockResolvedValue({
        trip: { status: TripStatus.ACTIVE },
      });
      await expect(
        service.requireTripAccess('trip-1', 'user-1'),
      ).resolves.toBeUndefined();
    });

    it('rejects a non-member (404 to avoid leaking trip existence)', async () => {
      access.requireMember.mockRejectedValue(
        new (require('@nestjs/common').NotFoundException)('Trip not found.'),
      );
      await expect(
        service.requireTripAccess('trip-1', 'user-1'),
      ).rejects.toBeDefined();
    });

    it('rejects an ended trip', async () => {
      access.requireMember.mockResolvedValue({
        trip: { status: TripStatus.COMPLETED },
      });
      await expect(
        service.requireTripAccess('trip-1', 'user-1'),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        errorCode: ErrorCodes.TRIP_ENDED,
      });
    });
  });

  describe('throttling', () => {
    it('allows the first update then rejects within the window', () => {
      expect(service.isThrottled('trip-1', 'user-1', now)).toBe(false);
      expect(service.isThrottled('trip-1', 'user-1', now + 1_000)).toBe(true);
      expect(service.isThrottled('trip-1', 'user-2', now)).toBe(false);
    });
  });

  describe('upsertLocation', () => {
    it('upserts the current location and syncs the geography point in a transaction', async () => {
      await service.upsertLocation('trip-1', 'user-1', {
        tripId: 'trip-1',
        latitude: 15.49,
        longitude: 73.82,
        accuracy: 10,
        speed: 70,
        heading: 90,
        timestamp: now,
      });

      expect(prisma.currentLocation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tripId_userId: { tripId: 'trip-1', userId: 'user-1' } },
          create: expect.objectContaining({
            latitude: 15.49,
            longitude: 73.82,
          }),
        }),
      );
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });
  });
});
