import { Module } from '@nestjs/common';
import { TripLocationService } from './locations.service';
import { LocationsController } from './locations.controller';
import { TripAccessService } from '../common/services/trip-access.service';

@Module({
  controllers: [LocationsController],
  providers: [TripLocationService, TripAccessService],
  exports: [TripLocationService],
})
export class TripLocationsModule {}
