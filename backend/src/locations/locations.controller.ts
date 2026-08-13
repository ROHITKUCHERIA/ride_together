import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TripLocationService } from './locations.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';

@ApiTags('trips')
@ApiBearerAuth()
@Controller('trips')
export class LocationsController {
  constructor(private readonly locations: TripLocationService) {}

  @Get(':tripId/locations')
  @ApiOperation({
    summary: 'Current locations of trip members (members only)',
  })
  async currentLocations(
    @Param('tripId', new ParseUUIDPipe()) tripId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.locations.getLocationsForTrip(tripId, user.id);
  }
}
