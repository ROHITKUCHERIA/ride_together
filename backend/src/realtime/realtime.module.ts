import { forwardRef, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RealtimeService } from './realtime.service';
import { RealtimeGateway } from './realtime.gateway';
import { JamRealtimeService } from './jam-realtime.service';
import { GroupNavRealtimeService } from './group-nav-realtime.service';
import { NavigationSessionsService } from './navigation-sessions.service';
import { TripLocationsModule } from '../locations/locations.module';
import { TripAccessService } from '../common/services/trip-access.service';
import { JamModule } from '../jam/jam.module';

@Module({
  imports: [
    JwtModule.register({}),
    TripLocationsModule,
    forwardRef(() => JamModule),
  ],
  providers: [
    RealtimeService,
    RealtimeGateway,
    JamRealtimeService,
    GroupNavRealtimeService,
    NavigationSessionsService,
    TripAccessService,
  ],
  exports: [
    RealtimeService,
    JamRealtimeService,
    GroupNavRealtimeService,
    NavigationSessionsService,
  ],
})
export class RealtimeModule {}
