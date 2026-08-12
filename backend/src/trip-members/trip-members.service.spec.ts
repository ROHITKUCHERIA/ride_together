import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { TripMembersService } from './trip-members.service';
import { PrismaService } from '../prisma/prisma.service';
import { TripAccessService } from '../common/services/trip-access.service';
import { TripsService } from '../trips/trips.service';
import { ErrorCodes } from '../common/constants/error-codes';
import { MemberRole } from '../../generated/prisma/enums';

describe('TripMembersService', () => {
  let service: TripMembersService;
  let prisma: any;
  let access: {
    requireMember: jest.Mock;
    requireOwner: jest.Mock;
  };
  let trips: { leave: jest.Mock };

  const actor = (role: MemberRole) => ({
    id: 'actor-membership',
    tripId: 'trip-1',
    userId: 'user-1',
    role,
    trip: {},
  });

  const target = (role: MemberRole, userId = 'user-2') => ({
    id: 'target-membership',
    tripId: 'trip-1',
    userId,
    role,
  });

  beforeEach(async () => {
    prisma = {
      tripMember: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(target(MemberRole.MEMBER)),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        delete: jest.fn().mockResolvedValue({}),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(prisma),
      ),
    };

    access = {
      requireMember: jest.fn().mockResolvedValue(actor(MemberRole.OWNER)),
      requireOwner: jest.fn().mockResolvedValue(actor(MemberRole.OWNER)),
    };

    trips = { leave: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TripMembersService,
        { provide: PrismaService, useValue: prisma },
        { provide: TripAccessService, useValue: access },
        { provide: TripsService, useValue: trips },
      ],
    }).compile();

    service = module.get<TripMembersService>(TripMembersService);
  });

  describe('leave', () => {
    it('delegates to TripsService.leave', async () => {
      await service.leave('trip-1', 'user-1');
      expect(trips.leave).toHaveBeenCalledWith('trip-1', 'user-1');
    });
  });

  describe('listMembers', () => {
    it('requires membership and maps members', async () => {
      prisma.tripMember.findMany.mockResolvedValue([
        {
          id: 'm1',
          role: MemberRole.OWNER,
          joinedAt: new Date(),
          user: {
            id: 'u1',
            name: 'Alice',
            avatarUrl: null,
          },
        },
      ]);

      const result = await service.listMembers('trip-1', 'user-1');
      expect(access.requireMember).toHaveBeenCalledWith('trip-1', 'user-1');
      expect(result[0]).toMatchObject({
        id: 'u1',
        name: 'Alice',
        role: MemberRole.OWNER,
      });
    });
  });

  describe('updateMemberRole', () => {
    it('rejects promoting to OWNER', async () => {
      await expect(
        service.updateMemberRole('trip-1', 'user-1', 'user-2', MemberRole.OWNER),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        errorCode: ErrorCodes.INVALID_ROLE_TRANSITION,
      });
    });

    it('rejects a MEMBER actor', async () => {
      access.requireMember.mockResolvedValue(actor(MemberRole.MEMBER));
      await expect(
        service.updateMemberRole('trip-1', 'user-1', 'user-2', MemberRole.ADMIN),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        errorCode: ErrorCodes.TRIP_PERMISSION_DENIED,
      });
    });

    it('rejects a missing target member', async () => {
      prisma.tripMember.findFirst.mockResolvedValue(null);
      await expect(
        service.updateMemberRole('trip-1', 'user-1', 'user-9', MemberRole.ADMIN),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        errorCode: ErrorCodes.TRIP_NOT_FOUND,
      });
    });

    it('never modifies an OWNER', async () => {
      prisma.tripMember.findFirst.mockResolvedValue(target(MemberRole.OWNER));
      await expect(
        service.updateMemberRole('trip-1', 'user-1', 'user-2', MemberRole.ADMIN),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        errorCode: ErrorCodes.TRIP_PERMISSION_DENIED,
      });
    });

    it('lets an ADMIN manage only MEMBER targets', async () => {
      access.requireMember.mockResolvedValue(actor(MemberRole.ADMIN));
      prisma.tripMember.findFirst.mockResolvedValue(target(MemberRole.ADMIN));
      await expect(
        service.updateMemberRole('trip-1', 'user-1', 'user-2', MemberRole.MEMBER),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        errorCode: ErrorCodes.TRIP_PERMISSION_DENIED,
      });
    });

    it('promotes a MEMBER to ADMIN when actor is ADMIN', async () => {
      access.requireMember.mockResolvedValue(actor(MemberRole.ADMIN));
      prisma.tripMember.findFirst.mockResolvedValue(target(MemberRole.MEMBER));
      await service.updateMemberRole(
        'trip-1',
        'user-1',
        'user-2',
        MemberRole.ADMIN,
      );
      expect(prisma.tripMember.update).toHaveBeenCalledWith({
        where: { id: 'target-membership' },
        data: { role: MemberRole.ADMIN },
      });
    });

    it('lets the OWNER demote an ADMIN', async () => {
      prisma.tripMember.findFirst.mockResolvedValue(target(MemberRole.ADMIN));
      await service.updateMemberRole(
        'trip-1',
        'user-1',
        'user-2',
        MemberRole.MEMBER,
      );
      expect(prisma.tripMember.update).toHaveBeenCalledWith({
        where: { id: 'target-membership' },
        data: { role: MemberRole.MEMBER },
      });
    });

    it('no-ops when the role is unchanged', async () => {
      prisma.tripMember.findFirst.mockResolvedValue(target(MemberRole.MEMBER));
      await service.updateMemberRole(
        'trip-1',
        'user-1',
        'user-2',
        MemberRole.MEMBER,
      );
      expect(prisma.tripMember.update).not.toHaveBeenCalled();
    });
  });

  describe('removeMember', () => {
    it('never removes the OWNER', async () => {
      prisma.tripMember.findFirst.mockResolvedValue(target(MemberRole.OWNER));
      await expect(
        service.removeMember('trip-1', 'user-1', 'user-2'),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        errorCode: ErrorCodes.LAST_OWNER_REMOVAL,
      });
    });

    it('blocks a MEMBER actor', async () => {
      access.requireMember.mockResolvedValue(actor(MemberRole.MEMBER));
      await expect(
        service.removeMember('trip-1', 'user-1', 'user-2'),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        errorCode: ErrorCodes.TRIP_PERMISSION_DENIED,
      });
    });

    it('lets an ADMIN remove a MEMBER', async () => {
      access.requireMember.mockResolvedValue(actor(MemberRole.ADMIN));
      await service.removeMember('trip-1', 'user-1', 'user-2');
      expect(prisma.tripMember.delete).toHaveBeenCalledWith({
        where: { id: 'target-membership' },
      });
    });

    it('blocks an ADMIN from removing an ADMIN', async () => {
      access.requireMember.mockResolvedValue(actor(MemberRole.ADMIN));
      prisma.tripMember.findFirst.mockResolvedValue(target(MemberRole.ADMIN));
      await expect(
        service.removeMember('trip-1', 'user-1', 'user-2'),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        errorCode: ErrorCodes.TRIP_PERMISSION_DENIED,
      });
    });
  });

  describe('transferOwnership', () => {
    it('requires the caller to be the current OWNER', async () => {
      access.requireOwner.mockRejectedValue(
        new (require('@nestjs/common').HttpException)('denied', 403),
      );
      await expect(
        service.transferOwnership('trip-1', 'user-1', 'user-2'),
      ).rejects.toBeDefined();
      expect(access.requireOwner).toHaveBeenCalledWith('trip-1', 'user-1');
    });

    it('rejects transferring to yourself', async () => {
      await expect(
        service.transferOwnership('trip-1', 'user-1', 'user-1'),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        errorCode: ErrorCodes.INVALID_ROLE_TRANSITION,
      });
    });

    it('rejects a new owner who is not a member', async () => {
      prisma.tripMember.findFirst.mockResolvedValue(null);
      await expect(
        service.transferOwnership('trip-1', 'user-1', 'user-2'),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        errorCode: ErrorCodes.TRIP_NOT_FOUND,
      });
    });

    it('locks the trip, demotes old owner, promotes the new one', async () => {
      prisma.tripMember.findFirst.mockResolvedValue(target(MemberRole.MEMBER));
      await service.transferOwnership('trip-1', 'user-1', 'user-2');

      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(prisma.tripMember.updateMany).toHaveBeenCalledWith({
        where: { tripId: 'trip-1', role: MemberRole.OWNER },
        data: { role: MemberRole.ADMIN },
      });
      expect(prisma.tripMember.update).toHaveBeenCalledWith({
        where: { id: 'target-membership' },
        data: { role: MemberRole.OWNER },
      });
    });
  });
});
