import { Module } from '@nestjs/common';
import { TripMembersController } from './trip-members.controller';
import { TripMembersService } from './trip-members.service';
import { TripAccessService } from '../common/services/trip-access.service';
import { TripsModule } from '../trips/trips.module';

/**
 * Trip membership management (list, roles, removal, ownership transfer, leave).
 * Imports TripsModule so leave/join logic stays centralized in TripsService.
 */
@Module({
  imports: [TripsModule],
  controllers: [TripMembersController],
  providers: [TripMembersService, TripAccessService],
  exports: [TripMembersService],
})
export class TripMembersModule {}
