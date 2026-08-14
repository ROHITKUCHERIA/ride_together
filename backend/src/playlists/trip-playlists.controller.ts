import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlaylistsService } from './playlists.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';

@ApiTags('trips')
@ApiBearerAuth()
@Controller('trips')
export class TripPlaylistsController {
  constructor(private readonly playlists: PlaylistsService) {}

  @Get(':tripId/playlists')
  @ApiOperation({
    summary: 'List trip playlists visible to a member (public + own)',
  })
  listForTrip(
    @Param('tripId', new ParseUUIDPipe()) tripId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.playlists.listForTrip(tripId, user.id);
  }
}
