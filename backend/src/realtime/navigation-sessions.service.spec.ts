import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { NavigationSessionsService } from './navigation-sessions.service';
import { TripAccessService } from '../common/services/trip-access.service';
import { AppConfig } from '../config/app.config';
import { GroupNavRealtimeService } from './group-nav-realtime.service';
import { PrismaService } from '../prisma/prisma.service';
import { NavigationMode, NavigationStatus } from '../../generated/prisma/enums';
import { NavigationEvents } from '../socket/events/navigation.events';

const NOW = new Date('2026-09-05T10:00:00Z');

function sessionFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    tripId: 'trip1',
    userId: 'user1',
    mode: NavigationMode.GROUP,
    status: NavigationStatus.NAVIGATING,
    destinationLatitude: 17.385,
    destinationLongitude: 78.4867,
    destinationName: 'Goa',
    distanceRemainingMeters: 4200,
    etaEpochMs: NOW.getTime() + 900_000,
    startedAt: NOW,
    lastUpdatedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('NavigationSessionsService', () => {
  let service: NavigationSessionsService;
  let prisma: {
    trip: { findUniqueOrThrow: jest.Mock };
    navigationSession: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    currentLocation: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let realtime: { broadcastSession: jest.Mock };
  let access: { requireMember: jest.Mock };

  beforeEach(async () => {
    prisma = {
      trip: { findUniqueOrThrow: jest.fn() },
      navigationSession: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      currentLocation: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((calls) => Promise.all(calls)),
    };
    realtime = { broadcastSession: jest.fn() };
    access = {
      requireMember: jest.fn().mockResolvedValue({
        trip: {
          destination: 'Goa',
          destinationLatitude: 17.385,
          destinationLongitude: 78.4867,
        },
      }),
    };
    const config = {
      navigationStatusMinIntervalMs: 5000,
      riderDelayedThresholdMs: 60_000,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NavigationSessionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: TripAccessService, useValue: access },
        { provide: AppConfig, useValue: config },
        { provide: GroupNavRealtimeService, useValue: realtime },
      ],
    }).compile();

    service = module.get<NavigationSessionsService>(NavigationSessionsService);
  });

  describe('getGroupSnapshot', () => {
    it('returns destination, riders, and derived group ETA', async () => {
      prisma.trip.findUniqueOrThrow.mockResolvedValue({
        destination: 'Goa',
        destinationLatitude: 17.385,
        destinationLongitude: 78.4867,
        destinationSetBy: 'user2',
        destinationSetAt: NOW,
      });
      prisma.navigationSession.findMany.mockResolvedValue([
        sessionFixture({ userId: 'a', etaEpochMs: 1_700_000_000_000 }),
        sessionFixture({ userId: 'b', etaEpochMs: 1_800_000_000_000 }),
        sessionFixture({
          userId: 'c',
          status: NavigationStatus.ARRIVED,
          etaEpochMs: 1_900_000_000_000,
        }),
      ]);

      const snap = await service.getGroupSnapshot('trip1', 'user1');

      expect(snap.destination).toEqual({
        latitude: 17.385,
        longitude: 78.4867,
        name: 'Goa',
        setByUserId: 'user2',
        setAt: NOW.toISOString(),
      });
      expect(snap.riders).toHaveLength(3);
      expect(snap.riders[0].status).toBe('navigating');
      expect(snap.riders[2].status).toBe('arrived');
      // Group ETA = latest among ACTIVE riders (arrived excluded).
      expect(snap.groupEta).toBe(1_800_000_000_000);
    });

    it('derives offline for riders whose location is stale', async () => {
      prisma.trip.findUniqueOrThrow.mockResolvedValue({
        destinationLatitude: null,
        destinationLongitude: null,
      });
      prisma.navigationSession.findMany.mockResolvedValue([
        sessionFixture({
          userId: 'a',
          lastUpdatedAt: new Date(Date.now() - 60_000),
        }),
      ]);
      prisma.currentLocation.findMany.mockResolvedValue([
        { userId: 'a', lastUpdatedAt: new Date(Date.now() - 120_000) },
      ]);

      const snap = await service.getGroupSnapshot('trip1', 'user1');
      expect(snap.riders[0].status).toBe('offline');
    });
  });

  describe('startSession', () => {
    it('creates a group session from the trip destination and broadcasts', async () => {
      const created = sessionFixture();
      prisma.navigationSession.upsert.mockResolvedValue(created);

      const payload = await service.startSession('trip1', 'user1', {
        mode: 'group',
      });

      expect(prisma.navigationSession.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tripId_userId: { tripId: 'trip1', userId: 'user1' } },
          create: expect.objectContaining({
            mode: NavigationMode.GROUP,
            status: NavigationStatus.NAVIGATING,
            destinationLatitude: 17.385,
          }),
        }),
      );
      expect(payload.status).toBe('navigating');
      expect(realtime.broadcastSession).toHaveBeenCalledWith(
        NavigationEvents.NAVIGATION_STARTED,
        expect.objectContaining({ userId: 'user1', tripId: 'trip1' }),
      );
    });

    it('rejects a group session when the trip has no destination', async () => {
      prisma.navigationSession.upsert.mockResolvedValue(sessionFixture());
      access.requireMember.mockResolvedValue({
        trip: {
          destination: 'Goa',
          destinationLatitude: null,
          destinationLongitude: null,
        },
      });
      await expect(
        service.startSession('trip1', 'user1', { mode: 'group' }),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });

    it('keeps personal sessions private (no broadcast)', async () => {
      const created = sessionFixture({ mode: NavigationMode.PERSONAL });
      prisma.navigationSession.upsert.mockResolvedValue(created);

      const payload = await service.startSession('trip1', 'user1', {
        mode: 'personal',
        destinationLatitude: 10,
        destinationLongitude: 20,
        destinationName: 'Home',
      });

      expect(payload.mode).toBe('personal');
      expect(realtime.broadcastSession).not.toHaveBeenCalled();
    });
  });

  describe('updateSession', () => {
    it('broadcasts the arrived transition with the arrived event', async () => {
      prisma.navigationSession.findUnique.mockResolvedValue(
        sessionFixture({ lastUpdatedAt: new Date(NOW.getTime() - 60_000) }),
      );
      prisma.navigationSession.update.mockResolvedValue(
        sessionFixture({ status: NavigationStatus.ARRIVED }),
      );

      const payload = await service.updateSession('trip1', 'user1', {
        status: 'arrived',
        eta: NOW.getTime(),
      });

      expect(payload.status).toBe('arrived');
      expect(realtime.broadcastSession).toHaveBeenCalledWith(
        NavigationEvents.NAVIGATION_ARRIVED,
        expect.objectContaining({ status: 'arrived' }),
      );
    });

    it('emits rerouted when leaving the rerouting state', async () => {
      prisma.navigationSession.findUnique.mockResolvedValue(
        sessionFixture({
          status: NavigationStatus.REROUTING,
          lastUpdatedAt: new Date(NOW.getTime() - 60_000),
        }),
      );
      prisma.navigationSession.update.mockResolvedValue(
        sessionFixture({ status: NavigationStatus.NAVIGATING }),
      );

      await service.updateSession('trip1', 'user1', { status: 'navigating' });

      expect(realtime.broadcastSession).toHaveBeenCalledWith(
        NavigationEvents.NAVIGATION_REROUTED,
        expect.anything(),
      );
    });

    it('throws when no session exists', async () => {
      prisma.navigationSession.findUnique.mockResolvedValue(null);
      await expect(
        service.updateSession('trip1', 'user1', { status: 'navigating' }),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        errorCode: 'NAV_SESSION_NOT_FOUND',
      });
    });

    it('persists the rider’s first ETA report (never treated as trivial)', async () => {
      prisma.navigationSession.findUnique.mockResolvedValue(
        sessionFixture({ etaEpochMs: null, lastUpdatedAt: NOW }),
      );
      prisma.navigationSession.update.mockResolvedValue(
        sessionFixture({ etaEpochMs: NOW.getTime() + 600_000 }),
      );

      const payload = await service.updateSession('trip1', 'user1', {
        status: 'navigating',
        eta: NOW.getTime() + 600_000,
      });

      expect(prisma.navigationSession.update).toHaveBeenCalled();
      expect(payload.eta).toBe(NOW.getTime() + 600_000);
      expect(realtime.broadcastSession).toHaveBeenCalledWith(
        NavigationEvents.NAVIGATION_STATUS,
        expect.objectContaining({ status: 'navigating' }),
      );
    });

    it('skips trivial updates inside the throttle window', async () => {
      prisma.navigationSession.findUnique.mockResolvedValue(sessionFixture());
      const payload = await service.updateSession('trip1', 'user1', {
        status: 'navigating',
        eta: NOW.getTime() + 900_000,
      });

      expect(prisma.navigationSession.update).not.toHaveBeenCalled();
      expect(realtime.broadcastSession).not.toHaveBeenCalled();
      expect(payload.status).toBe('navigating');
    });
  });

  describe('stopSession', () => {
    it('deletes and broadcasts stopped for group sessions', async () => {
      prisma.navigationSession.findUnique.mockResolvedValue(sessionFixture());
      prisma.navigationSession.delete.mockResolvedValue({});

      await service.stopSession('trip1', 'user1');

      expect(realtime.broadcastSession).toHaveBeenCalledWith(
        NavigationEvents.NAVIGATION_STOPPED,
        expect.objectContaining({ status: 'idle' }),
      );
    });

    it('is a no-op when no session exists', async () => {
      prisma.navigationSession.findUnique.mockResolvedValue(null);
      await expect(
        service.stopSession('trip1', 'user1'),
      ).resolves.toBeUndefined();
      expect(realtime.broadcastSession).not.toHaveBeenCalled();
    });
  });

  describe('markOffline', () => {
    it('broadcasts offline for a group session and persists it', async () => {
      prisma.navigationSession.findUnique.mockResolvedValue(sessionFixture());
      prisma.navigationSession.update.mockResolvedValue(
        sessionFixture({ status: NavigationStatus.OFFLINE }),
      );

      await service.markOffline('trip1', 'user1');

      expect(prisma.navigationSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: NavigationStatus.OFFLINE }),
        }),
      );
      expect(realtime.broadcastSession).toHaveBeenCalledWith(
        expect.stringContaining('status'),
        expect.objectContaining({ status: 'offline' }),
      );
    });
  });
});
