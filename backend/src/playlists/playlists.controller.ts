import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlaylistsService } from './playlists.service';
import { CreatePlaylistDto } from './dto/create-playlist.dto';
import { UpdatePlaylistDto } from './dto/update-playlist.dto';
import { AddPlaylistSongDto } from './dto/add-playlist-song.dto';
import { ReorderPlaylistSongsDto } from './dto/reorder-playlist-songs.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';

@ApiTags('playlists')
@ApiBearerAuth()
@Controller('playlists')
export class PlaylistsController {
  constructor(private readonly playlists: PlaylistsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a playlist (personal or trip-linked)' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePlaylistDto,
  ) {
    return this.playlists.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my playlists' })
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.playlists.listMine(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a playlist with its songs' })
  get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.playlists.get(id, user.id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a playlist (owner only)' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePlaylistDto,
  ) {
    return this.playlists.update(id, user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a playlist (owner only)' })
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.playlists.remove(id, user.id);
    return { message: 'Playlist deleted.' };
  }

  @Post(':id/songs')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a song to a playlist (owner only)' })
  addSong(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddPlaylistSongDto,
  ) {
    return this.playlists.addSong(id, user.id, dto.songId);
  }

  @Delete(':id/songs/:songId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a song from a playlist (owner only)' })
  async removeSong(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('songId', new ParseUUIDPipe()) songId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.playlists.removeSong(id, user.id, songId);
    return { message: 'Song removed from the playlist.' };
  }

  @Patch(':id/songs/reorder')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reorder a playlist (owner only)' })
  async reorder(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReorderPlaylistSongsDto,
  ) {
    await this.playlists.reorder(id, user.id, dto.songIds);
    return { message: 'Playlist reordered.' };
  }
}
