import { Module } from '@nestjs/common';
import { NavigationController } from './navigation.controller';
import { NavigationService } from './navigation.service';
import { RoutingService } from './routing.service';
import { GeocodingService } from './geocoding.service';
import { TripNavigationController } from './trip-navigation.controller';
import { TripNavigationService } from './trip-navigation.service';
import { TripAccessService } from '../common/services/trip-access.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule],
  controllers: [NavigationController, TripNavigationController],
  providers: [
    NavigationService,
    RoutingService,
    GeocodingService,
    TripNavigationService,
    TripAccessService,
  ],
  exports: [NavigationService],
})
export class NavigationModule {}
