import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TripMembersService } from './trip-members.service';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { TransferOwnershipDto } from './dto/transfer-ownership.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';

@ApiTags('trip-members')
@ApiBearerAuth()
@Controller('trips')
export class TripMembersController {
  constructor(private readonly membersService: TripMembersService) {}

  @Get(':tripId/members')
  @ApiOperation({ summary: 'List trip members' })
  listMembers(
    @Param('tripId', new ParseUUIDPipe()) tripId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.membersService.listMembers(tripId, user.id);
  }

  @Post(':tripId/leave')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Leave a trip (OWNER must transfer ownership first)',
  })
  async leave(
    @Param('tripId', new ParseUUIDPipe()) tripId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Delegated to trips service to avoid a circular dependency; the leave
    // logic lives in TripsService but is invoked through the members module.
    return this.membersService.leave(tripId, user.id);
  }

  @Patch(':tripId/members/:userId/role')
  @ApiOperation({ summary: 'Change a member role (OWNER/ADMIN only)' })
  async updateRole(
    @Param('tripId', new ParseUUIDPipe()) tripId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: UpdateMemberRoleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.membersService.updateMemberRole(
      tripId,
      user.id,
      userId,
      dto.role,
    );
    return { message: 'Member role updated.' };
  }

  @Delete(':tripId/members/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a member (OWNER/ADMIN only)' })
  async remove(
    @Param('tripId', new ParseUUIDPipe()) tripId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.membersService.removeMember(tripId, user.id, userId);
    return { message: 'Member removed.' };
  }

  @Post(':tripId/transfer-ownership')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transfer OWNER role to another member' })
  async transfer(
    @Param('tripId', new ParseUUIDPipe()) tripId: string,
    @Body() dto: TransferOwnershipDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.membersService.transferOwnership(
      tripId,
      user.id,
      dto.newOwnerId,
    );
    return { message: 'Ownership transferred.' };
  }
}
