import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JamService } from './jam.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';

@ApiTags('trips')
@ApiBearerAuth()
@Controller('trips')
export class TripJamController {
  constructor(private readonly jam: JamService) {}

  @Get(':tripId/jam')
  @ApiOperation({
    summary: 'Get the active Jam for a trip (or null when none exists)',
  })
  findActiveForTrip(
    @Param('tripId', new ParseUUIDPipe()) tripId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jam.findActiveForTrip(tripId, user.id);
  }

  @Post(':tripId/jam')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Create a Jam for the trip (caller becomes Host). Returns the existing active Jam when one already exists.',
  })
  create(
    @Param('tripId', new ParseUUIDPipe()) tripId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jam.create(tripId, user.id);
  }
}