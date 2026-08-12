import { Module } from '@nestjs/common';
import { TripsService } from './trips.service';
import { TripsController } from './trips.controller';
import { TripAccessService } from '../common/services/trip-access.service';

@Module({
  controllers: [TripsController],
  providers: [TripsService, TripAccessService],
  exports: [TripsService],
})
export class TripsModule {}
