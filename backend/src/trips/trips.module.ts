import { Module } from '@nestjs/common';
import { TripsService } from './trips.service';
import { TripsController } from './trips.controller';
import { TripDestinationService } from './trip-destination.service';
import { TripAccessService } from '../common/services/trip-access.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule],
  controllers: [TripsController],
  providers: [TripsService, TripDestinationService, TripAccessService],
  exports: [TripsService],
})
export class TripsModule {}
