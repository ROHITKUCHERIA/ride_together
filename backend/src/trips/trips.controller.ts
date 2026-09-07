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
import { Throttle } from '@nestjs/throttler';
import { TripsService } from './trips.service';
import { TripDestinationService } from './trip-destination.service';
import { SetTripDestinationDto } from './dto/set-trip-destination.dto';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { JoinTripDto } from './dto/join-trip.dto';
import { PaginationQuery } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';

interface ThrottleConfig {
  limit: number;
  ttl: number;
}

function throttleLimit(env: string | undefined, fallback: number): number {
  const n = Number(env);
  return env && Number.isFinite(n) ? n : fallback;
}

/** Host destination mutations — enough headroom for legit group rides, but a
 *  hard cap against a scripted client flipping the destination every second. */
const DESTINATION_THROTTLE: ThrottleConfig = {
  limit: throttleLimit(
    process.env['NAVIGATION_DESTINATION_THROTTLE_LIMIT'],
    30,
  ),
  ttl: throttleLimit(
    process.env['NAVIGATION_DESTINATION_THROTTLE_TTL_MS'],
    60_000,
  ),
};

@ApiTags('trips')
@ApiBearerAuth()
@Controller('trips')
export class TripsController {
  constructor(
    private readonly tripsService: TripsService,
    private readonly destinationService: TripDestinationService,
  ) {}

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

  // ---------- shared destination (Phase 3 group navigation) ----------

  @Put(':id/destination')
  @Throttle({ navigation: DESTINATION_THROTTLE })
  @ApiOperation({
    summary: 'Set/update the shared trip destination (HOST only)',
  })
  setDestination(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetTripDestinationDto,
  ) {
    return this.destinationService.setDestination(id, user.id, dto);
  }

  @Get(':id/destination')
  @ApiOperation({ summary: 'Get the shared trip destination (members only)' })
  getDestination(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.destinationService.getDestination(id, user.id);
  }

  @Delete(':id/destination')
  @HttpCode(HttpStatus.OK)
  @Throttle({ navigation: DESTINATION_THROTTLE })
  @ApiOperation({ summary: 'Clear the shared trip destination (HOST only)' })
  clearDestination(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.destinationService.clearDestination(id, user.id);
  }
}
