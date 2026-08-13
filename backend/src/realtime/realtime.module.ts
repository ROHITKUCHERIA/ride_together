import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RealtimeService } from './realtime.service';
import { RealtimeGateway } from './realtime.gateway';
import { TripLocationsModule } from '../locations/locations.module';
import { TripAccessService } from '../common/services/trip-access.service';

@Module({
  imports: [JwtModule.register({}), TripLocationsModule],
  providers: [RealtimeService, RealtimeGateway, TripAccessService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
