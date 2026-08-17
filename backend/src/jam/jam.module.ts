import { forwardRef, Module } from '@nestjs/common';
import { JamService } from './jam.service';
import { TripJamController } from './trip-jam.controller';
import { JamController } from './jam.controller';
import { TripAccessService } from '../common/services/trip-access.service';
import { RealtimeModule } from '../realtime/realtime.module';

/**
 * Realtime Jam sessions (Phase 3D). REST mutations are validated here and the
 * resulting authoritative state is broadcast to the trip room through the
 * shared Socket.IO server (RealtimeModule). forwardRef keeps the two modules
 * mutually dependent without a provider-level cycle.
 */
@Module({
  imports: [forwardRef(() => RealtimeModule)],
  controllers: [TripJamController, JamController],
  providers: [JamService, TripAccessService],
  exports: [JamService],
})
export class JamModule {}
