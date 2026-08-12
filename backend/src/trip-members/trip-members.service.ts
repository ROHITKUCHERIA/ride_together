import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TripAccessService } from '../common/services/trip-access.service';
import { TripsService } from '../trips/trips.service';
import { ApiException } from '../common/filters/all-exceptions.filter';
import { ErrorCodes } from '../common/constants/error-codes';
import { MemberRole } from '../../generated/prisma/enums';

const MEMBER_SELECT = {
  id: true,
  role: true,
  joinedAt: true,
  user: { select: { id: true, name: true, avatarUrl: true } },
} as const;

@Injectable()
export class TripMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TripAccessService,
    private readonly trips: TripsService,
  ) {}

  /**
   * Leave a trip. Delegated to TripsService (single source of truth for the
   * join/leave rules) and exposed through this module's controller.
   */
  async leave(tripId: string, userId: string): Promise<void> {
    await this.trips.leave(tripId, userId);
  }

  async listMembers(tripId: string, userId: string) {
    await this.access.requireMember(tripId, userId);
    const members = await this.prisma.tripMember.findMany({
      where: { tripId },
      select: MEMBER_SELECT,
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });
    return members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      avatarUrl: m.user.avatarUrl,
      role: m.role,
      joinedAt: m.joinedAt,
    }));
  }

  /**
   * Change a member's role. Scope:
   * - OWNER: can manage ADMIN/MEMBER (promote/demote); cannot be removed.
   * - ADMIN: can manage MEMBER only; cannot touch OWNER; cannot promote
   *   a MEMBER to OWNER.
   * - MEMBER: cannot manage anyone.
   * Changing the last OWNER is never allowed here (use transfer-ownership).
   */
  async updateMemberRole(
    tripId: string,
    actorId: string,
    targetUserId: string,
    newRole: MemberRole,
  ): Promise<void> {
    if (newRole === MemberRole.OWNER) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'Use transfer-ownership to change the OWNER.',
        ErrorCodes.INVALID_ROLE_TRANSITION,
      );
    }

    const actor = await this.access.requireMember(tripId, actorId);
    if (actor.role === MemberRole.MEMBER) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'You do not have permission to manage members.',
        ErrorCodes.TRIP_PERMISSION_DENIED,
      );
    }

    const target = await this.prisma.tripMember.findFirst({
      where: { tripId, userId: targetUserId },
    });
    if (!target) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'Member not found.',
        ErrorCodes.TRIP_NOT_FOUND,
      );
    }

    // The OWNER role can only be changed through transfer-ownership.
    if (target.role === MemberRole.OWNER) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'The OWNER role cannot be modified here.',
        ErrorCodes.TRIP_PERMISSION_DENIED,
      );
    }

    // ADMIN can only manage MEMBER-level members (never ADMIN/OWNER).
    if (actor.role === MemberRole.ADMIN && target.role !== MemberRole.MEMBER) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'ADMIN can only manage MEMBER-level members.',
        ErrorCodes.TRIP_PERMISSION_DENIED,
      );
    }

    if (newRole === target.role) return;

    await this.prisma.tripMember.update({
      where: { id: target.id },
      data: { role: newRole },
    });
  }

  /**
   * Remove a member from a trip.
   * - OWNER can remove ADMIN/MEMBER.
   * - ADMIN can remove MEMBER.
   * - Nobody can remove an OWNER via this route.
   */
  async removeMember(
    tripId: string,
    actorId: string,
    targetUserId: string,
  ): Promise<void> {
    const actor = await this.access.requireMember(tripId, actorId);

    const target = await this.prisma.tripMember.findFirst({
      where: { tripId, userId: targetUserId },
    });
    if (!target) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'Member not found.',
        ErrorCodes.TRIP_NOT_FOUND,
      );
    }

    if (target.role === MemberRole.OWNER) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'The OWNER cannot be removed.',
        ErrorCodes.LAST_OWNER_REMOVAL,
      );
    }

    if (actor.role === MemberRole.OWNER) {
      // OK — can remove ADMIN/MEMBER.
    } else if (actor.role === MemberRole.ADMIN) {
      if (target.role !== MemberRole.MEMBER) {
        throw new ApiException(
          HttpStatus.FORBIDDEN,
          'ADMIN can only remove MEMBER-level members.',
          ErrorCodes.TRIP_PERMISSION_DENIED,
        );
      }
    } else {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'You do not have permission to remove members.',
        ErrorCodes.TRIP_PERMISSION_DENIED,
      );
    }

    await this.prisma.tripMember.delete({ where: { id: target.id } });
  }

  /**
   * Transfer OWNER to an existing member. Current OWNER becomes ADMIN.
   * Runs in a transaction and locks the trip row so concurrent transfers
   * serialize (only one OWNER row can ever exist — also enforced by the
   * partial unique index on trip_members(trip_id) WHERE role = 'OWNER').
   */
  async transferOwnership(
    tripId: string,
    currentOwnerId: string,
    newOwnerId: string,
  ): Promise<void> {
    await this.access.requireOwner(tripId, currentOwnerId);

    if (newOwnerId === currentOwnerId) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'The new owner must be a different member.',
        ErrorCodes.INVALID_ROLE_TRANSITION,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Serialize ownership transfers per trip (lock the parent row).
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "trips" WHERE id = ${tripId}::uuid FOR UPDATE
      `;

      const newOwner = await tx.tripMember.findFirst({
        where: { tripId, userId: newOwnerId },
      });
      if (!newOwner) {
        throw new ApiException(
          HttpStatus.NOT_FOUND,
          'The new owner must already be a trip member.',
          ErrorCodes.TRIP_NOT_FOUND,
        );
      }

      // Demote the current OWNER(s) then promote the new one.
      await tx.tripMember.updateMany({
        where: { tripId, role: MemberRole.OWNER },
        data: { role: MemberRole.ADMIN },
      });
      await tx.tripMember.update({
        where: { id: newOwner.id },
        data: { role: MemberRole.OWNER },
      });
    });
  }
}
