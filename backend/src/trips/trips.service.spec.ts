import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { TripsService } from './trips.service';
import { PrismaService } from '../prisma/prisma.service';
import { TripAccessService } from '../common/services/trip-access.service';
import { ApiException } from '../common/filters/all-exceptions.filter';
import { ErrorCodes } from '../common/constants/error-codes';
import { MemberRole, TripStatus } from '../../generated/prisma/enums';

describe('TripsService', () => {
  let service: TripsService;
  let prisma: any;
  let access: {
    requireMember: jest.Mock;
    requireRole: jest.Mock;
    requireOwner: jest.Mock;
  };

  const futureTrip = {
    id: 'trip-1',
    name: 'Ride',
    destination: 'Goa',
    status: TripStatus.PLANNED,
    startDate: new Date(Date.now() + 86_400_000),
    endDate: new Date(Date.now() + 172_800_000),
    createdBy: 'user-1',
  };

  const membership = (role: MemberRole, trip = futureTrip) => ({
    id: 'member-1',
    tripId: 'trip-1',
    userId: 'user-1',
    role,
    trip,
  });

  beforeEach(async () => {
    prisma = {
      trip: {
        create: jest.fn().mockResolvedValue(futureTrip),
        update: jest.fn().mockResolvedValue(futureTrip),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(futureTrip),
        findUniqueOrThrow: jest.fn().mockResolvedValue(futureTrip),
        findMany: jest.fn().mockResolvedValue([futureTrip]),
        count: jest.fn().mockResolvedValue(1),
        delete: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      tripMember: {
        create: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn((arg: unknown) => {
        if (Array.isArray(arg)) return Promise.all(arg);
        return (arg as (tx: unknown) => Promise<unknown>)(prisma);
      }),
    };

    access = {
      requireMember: jest.fn().mockResolvedValue(membership(MemberRole.MEMBER)),
      requireRole: jest.fn().mockResolvedValue(membership(MemberRole.OWNER)),
      requireOwner: jest.fn().mockResolvedValue(membership(MemberRole.OWNER)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TripsService,
        { provide: PrismaService, useValue: prisma },
        { provide: TripAccessService, useValue: access },
      ],
    }).compile();

    service = module.get<TripsService>(TripsService);
  });

  describe('create', () => {
    const validDto = {
      name: 'Coast Ride',
      destination: 'Goa',
      startDate: new Date(Date.now() + 86_400_000).toISOString(),
      endDate: new Date(Date.now() + 172_800_000).toISOString(),
      destinationLatitude: 15.49,
      destinationLongitude: 73.82,
    };

    it('creates a trip with an OWNER membership and geography point', async () => {
      prisma.trip.findUnique.mockResolvedValue(null);
      const result = await service.create('user-1', validDto);
      expect(result).toBeDefined();
      expect(prisma.tripMember.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: MemberRole.OWNER }),
        }),
      );
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    it('rejects endDate before startDate', async () => {
      await expect(
        service.create('user-1', {
          ...validDto,
          startDate: new Date(Date.now() + 172_800_000).toISOString(),
          endDate: new Date(Date.now() + 86_400_000).toISOString(),
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        errorCode: ErrorCodes.VALIDATION_ERROR,
      });
    });
  });

  describe('findAll', () => {
    it('returns a flat { success, data, meta } pagination envelope', async () => {
      prisma.trip.count.mockResolvedValue(3);
      prisma.trip.findMany.mockResolvedValue([futureTrip]);

      const result = await service.findAll('user-1', 1, 20);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 3,
      });
      expect(prisma.trip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 20,
        }),
      );
    });
  });

  describe('findOne', () => {
    it('requires membership then returns the trip', async () => {
      const result = await service.findOne('trip-1', 'user-1');
      expect(access.requireMember).toHaveBeenCalledWith('trip-1', 'user-1');
      expect(result.id).toBe('trip-1');
    });
  });

  describe('update', () => {
    it('rejects mismatched destination lat/lng', async () => {
      await expect(
        service.update('trip-1', 'user-1', {
          destinationLatitude: 15.49,
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        errorCode: ErrorCodes.VALIDATION_ERROR,
      });
    });

    it('updates and syncs the geography when both coords provided', async () => {
      const result = await service.update('trip-1', 'user-1', {
        destinationLatitude: 15.49,
        destinationLongitude: 73.82,
      });
      expect(result).toBeDefined();
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });
  });

  describe('changeStatus', () => {
    it('allows PLANNED -> ACTIVE', async () => {
      await service.changeStatus('trip-1', 'user-1', TripStatus.ACTIVE);
      expect(prisma.trip.updateMany).toHaveBeenCalledWith({
        where: { id: 'trip-1', status: TripStatus.PLANNED },
        data: { status: TripStatus.ACTIVE },
      });
    });

    it('rejects COMPLETED -> ACTIVE', async () => {
      access.requireRole.mockResolvedValue(
        membership(MemberRole.OWNER, {
          ...futureTrip,
          status: TripStatus.COMPLETED,
        }),
      );
      await expect(
        service.changeStatus('trip-1', 'user-1', TripStatus.ACTIVE),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        errorCode: ErrorCodes.INVALID_ROLE_TRANSITION,
      });
    });

    it('treats a concurrent change as a conflict (count 0)', async () => {
      prisma.trip.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(
        service.changeStatus('trip-1', 'user-1', TripStatus.ACTIVE),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        errorCode: ErrorCodes.INVALID_ROLE_TRANSITION,
      });
    });
  });

  describe('join', () => {
    it('joins by invite code as MEMBER', async () => {
      prisma.trip.findUnique.mockResolvedValue(futureTrip);
      const result = await service.join('user-2', 'plncoast');
      expect(prisma.tripMember.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: MemberRole.MEMBER }),
        }),
      );
      expect(result.id).toBe('trip-1');
    });

    it('rejects an invalid invite code', async () => {
      prisma.trip.findUnique.mockResolvedValue(null);
      await expect(service.join('user-2', 'nope')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        errorCode: ErrorCodes.INVALID_INVITE_CODE,
      });
    });

    it('rejects joining a CANCELLED trip', async () => {
      prisma.trip.findUnique.mockResolvedValue({
        ...futureTrip,
        status: TripStatus.CANCELLED,
      });
      await expect(service.join('user-2', 'plncoast')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        errorCode: ErrorCodes.TRIP_ENDED,
      });
    });

    it('rejects an existing member', async () => {
      prisma.trip.findUnique.mockResolvedValue(futureTrip);
      prisma.tripMember.findFirst.mockResolvedValue({ id: 'member-1' });
      await expect(service.join('user-1', 'plncoast')).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        errorCode: ErrorCodes.ALREADY_MEMBER,
      });
    });
  });

  describe('leave', () => {
    it('lets a non-owner leave', async () => {
      access.requireMember.mockResolvedValue(
        membership(MemberRole.MEMBER),
      );
      await service.leave('trip-1', 'user-1');
      expect(prisma.tripMember.delete).toHaveBeenCalledWith({
        where: { id: 'member-1' },
      });
    });

    it('blocks the owner from leaving', async () => {
      access.requireMember.mockResolvedValue(
        membership(MemberRole.OWNER),
      );
      await expect(service.leave('trip-1', 'user-1')).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        errorCode: ErrorCodes.OWNER_CANNOT_LEAVE,
      });
    });
  });

  describe('remove', () => {
    it('requires OWNER and deletes members + trip', async () => {
      await service.remove('trip-1', 'user-1');
      expect(access.requireOwner).toHaveBeenCalledWith('trip-1', 'user-1');
      expect(prisma.tripMember.deleteMany).toHaveBeenCalled();
      expect(prisma.trip.delete).toHaveBeenCalled();
    });
  });

  describe('generateUniqueInviteCode (via create)', () => {
    it('retries when the invite code collides', async () => {
      const validDto = {
        name: 'Coast Ride',
        destination: 'Goa',
        startDate: new Date(Date.now() + 86_400_000).toISOString(),
        endDate: new Date(Date.now() + 172_800_000).toISOString(),
      };
      // First attempt collides, second is free.
      let call = 0;
      prisma.trip.findUnique.mockImplementation(() =>
        call++ === 0 ? { id: 'other' } : null,
      );
      prisma.$executeRaw.mockResolvedValueOnce(1);

      await service.create('user-1', validDto);
      expect(prisma.trip.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe('helper notFound (smoke)', () => {
    it('maps to a TRIP_NOT_FOUND ApiException', () => {
      const t = (service as any).notFound();
      expect(t).toBeInstanceOf(ApiException);
      expect(t.errorCode).toBe(ErrorCodes.TRIP_NOT_FOUND);
    });
  });
});
