import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { TripDestinationService } from './trip-destination.service';
import { TripAccessService } from '../common/services/trip-access.service';
import { GroupNavRealtimeService } from '../realtime/group-nav-realtime.service';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/filters/all-exceptions.filter';
import { ErrorCodes } from '../common/constants/error-codes';

const NOW = new Date('2026-09-05T10:00:00Z');

function tripRow(overrides: Record<string, unknown> = {}) {
  return {
    destination: 'Goa',
    destinationLatitude: 17.385,
    destinationLongitude: 78.4867,
    destinationSetBy: 'user1',
    destinationSetAt: NOW,
    ...overrides,
  };
}

describe('TripDestinationService', () => {
  let service: TripDestinationService;
  let tx: {
    trip: { update: jest.Mock; findUniqueOrThrow: jest.Mock };
    $executeRaw: jest.Mock;
  };
  let prisma: {
    trip: { findUniqueOrThrow: jest.Mock };
    $transaction: jest.Mock;
  };
  let access: { requireOwner: jest.Mock; requireMember: jest.Mock };
  let realtime: {
    broadcastDestinationUpdated: jest.Mock;
    broadcastDestinationCleared: jest.Mock;
  };

  beforeEach(async () => {
    tx = {
      trip: { update: jest.fn(), findUniqueOrThrow: jest.fn() },
      $executeRaw: jest.fn().mockResolvedValue([1]),
    };
    prisma = {
      trip: { findUniqueOrThrow: jest.fn() },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    access = {
      requireOwner: jest.fn().mockResolvedValue({
        role: 'OWNER',
        trip: { id: 'trip1' },
      }),
      requireMember: jest.fn().mockResolvedValue({
        role: 'MEMBER',
        trip: { id: 'trip1' },
      }),
    };
    realtime = {
      broadcastDestinationUpdated: jest.fn(),
      broadcastDestinationCleared: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TripDestinationService,
        { provide: PrismaService, useValue: prisma },
        { provide: TripAccessService, useValue: access },
        { provide: GroupNavRealtimeService, useValue: realtime },
      ],
    }).compile();

    service = module.get<TripDestinationService>(TripDestinationService);
  });

  describe('setDestination', () => {
    it('updates the trip, syncs PostGIS geo, and broadcasts to the trip room', async () => {
      const row = tripRow();
      tx.trip.update.mockResolvedValue(row);
      tx.trip.findUniqueOrThrow.mockResolvedValue(row);

      const result = await service.setDestination('trip1', 'user1', {
        latitude: 17.385,
        longitude: 78.4867,
        name: 'Goa',
      });

      expect(access.requireOwner).toHaveBeenCalledWith('trip1', 'user1');
      expect(tx.trip.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'trip1' },
          data: expect.objectContaining({
            destinationLatitude: 17.385,
            destinationLongitude: 78.4867,
            destinationSetBy: 'user1',
            destination: 'Goa',
          }),
        }),
      );
      const geoSql = (tx.$executeRaw.mock.calls[0][0] as string[]).join(' ');
      expect(geoSql).toContain('destination_geo');
      expect(geoSql).toContain('ST_SetSRID');
      expect(result.destination).toEqual({
        latitude: 17.385,
        longitude: 78.4867,
        name: 'Goa',
        setByUserId: 'user1',
        setAt: NOW.toISOString(),
      });
      expect(realtime.broadcastDestinationUpdated).toHaveBeenCalledWith({
        tripId: 'trip1',
        destination: result.destination,
      });
    });

    it('keeps the existing destination name when none is provided', async () => {
      tx.trip.update.mockResolvedValue(tripRow());
      tx.trip.findUniqueOrThrow.mockResolvedValue(tripRow());

      await service.setDestination('trip1', 'user1', {
        latitude: 17.385,
        longitude: 78.4867,
      });

      const updateArg = tx.trip.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(updateArg.data).not.toHaveProperty('destination');
    });

    it('rejects a non-owner without touching the trip', async () => {
      access.requireOwner.mockRejectedValue(
        new ApiException(
          HttpStatus.FORBIDDEN,
          'You do not have permission to perform this action.',
          ErrorCodes.TRIP_PERMISSION_DENIED,
        ),
      );

      await expect(
        service.setDestination('trip1', 'rider', {
          latitude: 17.385,
          longitude: 78.4867,
        }),
      ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });

      expect(tx.trip.update).not.toHaveBeenCalled();
      expect(realtime.broadcastDestinationUpdated).not.toHaveBeenCalled();
    });
  });

  describe('getDestination', () => {
    it('returns the wire destination for a member', async () => {
      const row = tripRow();
      prisma.trip.findUniqueOrThrow.mockResolvedValue(row);

      const result = await service.getDestination('trip1', 'user2');

      expect(access.requireMember).toHaveBeenCalledWith('trip1', 'user2');
      expect(result.destination).toEqual({
        latitude: 17.385,
        longitude: 78.4867,
        name: 'Goa',
        setByUserId: 'user1',
        setAt: NOW.toISOString(),
      });
    });

    it('returns null when the trip has no destination set', async () => {
      prisma.trip.findUniqueOrThrow.mockResolvedValue(
        tripRow({ destinationLatitude: null, destinationLongitude: null }),
      );

      await expect(service.getDestination('trip1', 'user2')).resolves.toEqual({
        destination: null,
      });
    });
  });

  describe('clearDestination', () => {
    it('nulls the destination and geo, and broadcasts cleared', async () => {
      const clearedRow = tripRow({
        destinationLatitude: null,
        destinationLongitude: null,
        destinationSetBy: null,
        destinationSetAt: null,
      });
      tx.trip.update.mockResolvedValue(clearedRow);

      const result = await service.clearDestination('trip1', 'user1');

      expect(access.requireOwner).toHaveBeenCalledWith('trip1', 'user1');
      expect(tx.trip.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            destinationLatitude: null,
            destinationLongitude: null,
          }),
        }),
      );
      const geoSql = (tx.$executeRaw.mock.calls[0][0] as string[]).join(' ');
      expect(geoSql).toContain('destination_geo');
      expect(geoSql).toContain('NULL');
      expect(result).toEqual({ destination: null });
      expect(realtime.broadcastDestinationCleared).toHaveBeenCalledWith({
        tripId: 'trip1',
        destination: null,
      });
    });

    it('rejects a non-owner', async () => {
      access.requireOwner.mockRejectedValue(
        new ApiException(
          HttpStatus.FORBIDDEN,
          'You do not have permission to perform this action.',
          ErrorCodes.TRIP_PERMISSION_DENIED,
        ),
      );

      await expect(
        service.clearDestination('trip1', 'rider'),
      ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
      expect(realtime.broadcastDestinationCleared).not.toHaveBeenCalled();
    });
  });
});
