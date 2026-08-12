import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TripsService } from './trips.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { JoinTripDto } from './dto/join-trip.dto';
import { PaginationQuery } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';

@ApiTags('trips')
@ApiBearerAuth()
@Controller('trips')
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a trip (creator becomes OWNER)' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTripDto) {
    return this.tripsService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List trips the user is a member of (paginated)' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQuery,
  ) {
    return this.tripsService.findAll(user.id, query.page, query.limit);
  }

  @Post('join')
  @ApiOperation({ summary: 'Join a trip using an invite code' })
  join(@CurrentUser() user: AuthenticatedUser, @Body() dto: JoinTripDto) {
    return this.tripsService.join(user.id, dto.inviteCode);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get trip details (members only)' })
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tripsService.findOne(id, user.id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update trip details (OWNER/ADMIN only)' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateTripDto,
  ) {
    return this.tripsService.update(id, user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a trip (OWNER only)' })
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.tripsService.remove(id, user.id);
    return { message: 'Trip deleted successfully.' };
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a trip (PLANNED -> ACTIVE)' })
  async start(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.tripsService.changeStatus(id, user.id, 'ACTIVE');
    return { message: 'Trip started.' };
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete a trip (ACTIVE -> COMPLETED)' })
  async complete(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.tripsService.changeStatus(id, user.id, 'COMPLETED');
    return { message: 'Trip completed.' };
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a trip (PLANNED/ACTIVE -> CANCELLED)' })
  async cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.tripsService.changeStatus(id, user.id, 'CANCELLED');
    return { message: 'Trip cancelled.' };
  }
}
