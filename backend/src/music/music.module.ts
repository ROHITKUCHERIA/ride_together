import { Module } from '@nestjs/common';
import { TripMusicController } from './trip-music.controller';
import { TripMusicService } from './trip-music.service';
import { YouTubeService } from './youtube.service';
import { TripAccessService } from '../common/services/trip-access.service';

/**
 * Shared trip music library (Phase 3A). Search results come from the official
 * YouTube Data API and are cached server-side to protect quota.
 */
@Module({
  controllers: [TripMusicController],
  providers: [TripMusicService, YouTubeService, TripAccessService],
})
export class MusicModule {}
