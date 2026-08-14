import { Module } from '@nestjs/common';
import { PlaylistsController } from './playlists.controller';
import { TripPlaylistsController } from './trip-playlists.controller';
import { PlaylistsService } from './playlists.service';
import { TripAccessService } from '../common/services/trip-access.service';

/**
 * Persistent user playlists (Phase 3C). Personal and trip-linked playlists
 * reference the shared Song table; ownership, trip membership and visibility
 * are all enforced server-side.
 */
@Module({
  controllers: [PlaylistsController, TripPlaylistsController],
  providers: [PlaylistsService, TripAccessService],
})
export class PlaylistsModule {}
