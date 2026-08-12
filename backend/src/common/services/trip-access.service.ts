import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MemberRole } from '../../../generated/prisma/enums';
import { ApiException } from '../filters/all-exceptions.filter';
import { ErrorCodes } from '../constants/error-codes';

export interface TripAccess {
  isMember: boolean;
  role: MemberRole | null;
  tripId: string;
}

/**
 * Centralized trip authorization. Controllers/services never re-implement
 * "is this user a member/admin/owner" checks — they delegate here.
 */
@Injectable()
export class TripAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Loads the membership record (with trip) for a user in a trip.
   * Returns null when the trip does not exist or the user is not a member.
   */
  async findMembership(tripId: string, userId: string) {
    return this.prisma.tripMember.findFirst({
      where: { tripId, userId },
      include: { trip: true },
    });
  }

  /**
   * Ensures the trip exists (404 otherwise) and the user is a member
   * (403 otherwise). Returns the membership.
   */
  async requireMember(tripId: string, userId: string) {
    const membership = await this.findMembership(tripId, userId);
    if (!membership) {
      // The trip may not exist at all — return 404 to avoid leaking whether
      // a private trip exists.
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'Trip not found or you are not a member.',
        ErrorCodes.TRIP_NOT_FOUND,
      );
    }
    return membership;
  }

  /**
   * Requires the user to be a member AND hold one of the given roles.
   */
  async requireRole(tripId: string, userId: string, roles: MemberRole[]) {
    const membership = await this.requireMember(tripId, userId);
    if (!roles.includes(membership.role)) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'You do not have permission to perform this action.',
        ErrorCodes.TRIP_PERMISSION_DENIED,
      );
    }
    return membership;
  }

  /**
   * Requires the user to be a member and hold the OWNER role.
   */
  async requireOwner(tripId: string, userId: string) {
    return this.requireRole(tripId, userId, [MemberRole.OWNER]);
  }
}
