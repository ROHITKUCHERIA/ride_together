import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { TripMusicService } from './trip-music.service';
import { SearchMusicQuery } from './dto/search-music.query';
import { AddSongDto } from './dto/add-song.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';

@ApiTags('trips')
@ApiBearerAuth()
@Controller('trips')
export class TripMusicController {
  constructor(private readonly music: TripMusicService) {}

  @Get(':tripId/music/search')
  @Throttle({ music: { limit: 90, ttl: 60_000 } })
  @ApiOperation({ summary: 'Search YouTube for songs (members only)' })
  search(
    @Param('tripId', new ParseUUIDPipe()) tripId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SearchMusicQuery,
  ) {
    return this.music.search(tripId, user.id, query.q, query.pageToken);
  }

  @Get(':tripId/music')
  @ApiOperation({ summary: 'List the trip music library (members only)' })
  list(
    @Param('tripId', new ParseUUIDPipe()) tripId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.music.listLibrary(tripId, user.id);
  }

  @Post(':tripId/music')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ music: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Add a song to the trip music library' })
  add(
    @Param('tripId', new ParseUUIDPipe()) tripId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddSongDto,
  ) {
    return this.music.addSong(tripId, user.id, dto.youtubeVideoId);
  }

  @Delete(':tripId/music/:songId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remove a song from the trip music library (OWNER/ADMIN/own adds)',
  })
  async remove(
    @Param('tripId', new ParseUUIDPipe()) tripId: string,
    @Param('songId', new ParseUUIDPipe()) songId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.music.removeSong(tripId, user.id, songId);
    return { message: 'Song removed from the trip.' };
  }
}
