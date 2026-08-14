import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TripAccessService } from '../common/services/trip-access.service';
import { ApiException } from '../common/filters/all-exceptions.filter';
import { ErrorCodes } from '../common/constants/error-codes';
import { CreatePlaylistDto } from './dto/create-playlist.dto';
import { UpdatePlaylistDto } from './dto/update-playlist.dto';

const OWNER = { select: { id: true, name: true, avatarUrl: true } } as const;
const TRIP = { select: { id: true, name: true } } as const;

const SUMMARY_INCLUDE = {
  user: OWNER,
  trip: TRIP,
  _count: { select: { songs: true } },
} as const;

export interface PlaylistSummary {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  tripId: string | null;
  owner: { id: string; name: string; avatarUrl: string | null };
  trip: { id: string; name: string } | null;
  songCount: number;
}

export interface PlaylistSongItem {
  id: string;
  playlistId: string;
  position: number;
  songId: string;
  youtubeVideoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  addedBy: { id: string; name: string };
  addedAt: Date;
}

export interface PlaylistDetail extends PlaylistSummary {
  songs: PlaylistSongItem[];
}

/**
 * Persistent user playlists (Phase 3C).
 *
 * A playlist references the shared `Song` table and never duplicates it.
 * Permissions are enforced server-side from the authenticated JWT identity
 * (never from client-supplied userId/ownership):
 *   - Owner: full control (view/edit/add/remove/reorder/delete).
 *   - Trip playlists: visible to trip members when public.
 *   - Private non-owned playlists: never readable or writable.
 */
@Injectable()
export class PlaylistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TripAccessService,
  ) {}

  async create(
    userId: string,
    dto: CreatePlaylistDto,
  ): Promise<PlaylistDetail> {
    if (dto.tripId) {
      await this.access.requireMember(dto.tripId, userId);
    }

    const name = dto.name.trim();
    if (!name) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'Playlist name must not be empty.',
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    const playlist = await this.prisma.playlist.create({
      data: {
        userId,
        name,
        description: normalizeDescription(dto.description),
        tripId: dto.tripId ?? null,
        isPublic: dto.isPublic ?? true,
      },
      include: {
        user: OWNER,
        trip: TRIP,
        _count: { select: { songs: true } },
      },
    });

    return { ...this.toSummary(playlist), songs: [] };
  }

  async listMine(userId: string): Promise<PlaylistSummary[]> {
    const rows = await this.prisma.playlist.findMany({
      where: { userId },
      include: SUMMARY_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((row) => this.toSummary(row));
  }

  async listForTrip(
    tripId: string,
    userId: string,
  ): Promise<PlaylistSummary[]> {
    await this.access.requireMember(tripId, userId);

    const rows = await this.prisma.playlist.findMany({
      where: { tripId, OR: [{ isPublic: true }, { userId }] },
      include: SUMMARY_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((row) => this.toSummary(row));
  }

  async get(id: string, userId: string): Promise<PlaylistDetail> {
    const playlist = await this.findOwned(id);
    if (!playlist) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'This playlist was not found.',
        ErrorCodes.PLAYLIST_NOT_FOUND,
      );
    }

    await this.assertCanView(playlist, userId);

    const songs = await this.prisma.playlistSong.findMany({
      where: { playlistId: id },
      include: {
        song: true,
        addedBy: { select: { id: true, name: true } },
      },
      orderBy: { position: 'asc' },
    });

    return {
      ...this.toSummary(playlist),
      songs: songs.map((row) => this.toSongItem(row)),
    };
  }

  async update(
    id: string,
    userId: string,
    dto: UpdatePlaylistDto,
  ): Promise<PlaylistSummary> {
    const playlist = await this.findOwned(id);
    if (!playlist) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'This playlist was not found.',
        ErrorCodes.PLAYLIST_NOT_FOUND,
      );
    }
    if (playlist.userId !== userId) {
      throw notOwner();
    }

    const name = dto.name?.trim();
    if (name === '') {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'Playlist name must not be empty.',
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    const updated = await this.prisma.playlist.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(dto.description !== undefined
          ? { description: normalizeDescription(dto.description) }
          : {}),
        ...(dto.isPublic !== undefined ? { isPublic: dto.isPublic } : {}),
      },
      include: SUMMARY_INCLUDE,
    });

    return this.toSummary(updated);
  }

  async remove(id: string, userId: string): Promise<void> {
    const playlist = await this.findOwned(id);
    if (!playlist) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'This playlist was not found.',
        ErrorCodes.PLAYLIST_NOT_FOUND,
      );
    }
    if (playlist.userId !== userId) {
      throw notOwner();
    }

    // onDelete: Cascade removes the PlaylistSong rows; the Song rows remain.
    await this.prisma.playlist.delete({ where: { id } });
  }

  async addSong(
    id: string,
    userId: string,
    songId: string,
  ): Promise<PlaylistSongItem> {
    const playlist = await this.findOwned(id);
    if (!playlist) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'This playlist was not found.',
        ErrorCodes.PLAYLIST_NOT_FOUND,
      );
    }
    if (playlist.userId !== userId) {
      throw notOwner();
    }

    const song = await this.prisma.song.findUnique({ where: { id: songId } });
    if (!song) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'This song was not found.',
        ErrorCodes.YOUTUBE_VIDEO_NOT_FOUND,
      );
    }

    const position = await this.prisma.playlistSong.count({
      where: { playlistId: id },
    });

    try {
      const row = await this.prisma.playlistSong.create({
        data: { playlistId: id, songId, position, addedByUserId: userId },
        include: { song: true, addedBy: { select: { id: true, name: true } } },
      });
      return this.toSongItem(row);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          'This song is already in the playlist.',
          ErrorCodes.SONG_ALREADY_IN_PLAYLIST,
        );
      }
      throw err;
    }
  }

  async removeSong(id: string, userId: string, songId: string): Promise<void> {
    const playlist = await this.findOwned(id);
    if (!playlist) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'This playlist was not found.',
        ErrorCodes.PLAYLIST_NOT_FOUND,
      );
    }
    if (playlist.userId !== userId) {
      throw notOwner();
    }

    const row = await this.prisma.playlistSong.findFirst({
      where: { playlistId: id, songId },
    });
    if (!row) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'This song is not in the playlist.',
        ErrorCodes.SONG_NOT_IN_PLAYLIST,
      );
    }

    // Deleting the link never deletes the Song itself.
    await this.prisma.playlistSong.delete({ where: { id: row.id } });
  }

  async reorder(id: string, userId: string, songIds: string[]): Promise<void> {
    const playlist = await this.findOwned(id);
    if (!playlist) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'This playlist was not found.',
        ErrorCodes.PLAYLIST_NOT_FOUND,
      );
    }
    if (playlist.userId !== userId) {
      throw notOwner();
    }

    const rows = await this.prisma.playlistSong.findMany({
      where: { playlistId: id },
      select: { id: true, songId: true },
    });

    const current = new Set(rows.map((r) => r.songId));
    const desired = new Set(songIds);
    if (
      current.size !== desired.size ||
      current.size !== songIds.length ||
      [...current].some((s) => !desired.has(s))
    ) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'The playlist changed before the reorder could be applied.',
        ErrorCodes.PLAYLIST_REORDER_MISMATCH,
      );
    }

    if (rows.length === 0) return;

    const bySongId = new Map(rows.map((r) => [r.songId, r.id]));
    const updates = songIds.map((songId, index) =>
      this.prisma.playlistSong.update({
        where: { id: bySongId.get(songId) as string },
        data: { position: index },
      }),
    );

    await this.prisma.$transaction(updates);
  }

  private async findOwned(id: string) {
    return this.prisma.playlist.findUnique({
      where: { id },
      include: {
        user: OWNER,
        trip: TRIP,
        _count: { select: { songs: true } },
      },
    });
  }

  private async assertCanView(
    playlist: {
      userId: string;
      isPublic: boolean;
      tripId: string | null;
    },
    userId: string,
  ): Promise<void> {
    if (playlist.userId === userId) return;
    if (!playlist.isPublic) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'This playlist is private.',
        ErrorCodes.PLAYLIST_ACCESS_DENIED,
      );
    }
    if (playlist.tripId) {
      // Public trip playlist: only members of that trip may view it. Use 404
      // so we don't leak the existence of a trip.
      await this.access.requireMember(playlist.tripId, userId);
    }
  }

  private toSummary(row: {
    id: string;
    name: string;
    description: string | null;
    isPublic: boolean;
    createdAt: Date;
    updatedAt: Date;
    userId: string;
    tripId: string | null;
    user: { id: string; name: string; avatarUrl: string | null };
    trip: { id: string; name: string } | null;
    _count: { songs: number };
  }): PlaylistSummary {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      isPublic: row.isPublic,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      userId: row.userId,
      tripId: row.tripId,
      owner: row.user,
      trip: row.trip,
      songCount: row._count.songs,
    };
  }

  private toSongItem(row: {
    id: string;
    playlistId: string;
    position: number;
    addedByUserId: string;
    createdAt: Date;
    song: {
      id: string;
      youtubeVideoId: string;
      title: string;
      channelTitle: string;
      thumbnailUrl: string | null;
      durationSeconds: number | null;
    };
    addedBy: { id: string; name: string };
  }): PlaylistSongItem {
    return {
      id: row.id,
      playlistId: row.playlistId,
      position: row.position,
      songId: row.song.id,
      youtubeVideoId: row.song.youtubeVideoId,
      title: row.song.title,
      channelTitle: row.song.channelTitle,
      thumbnailUrl: row.song.thumbnailUrl,
      durationSeconds: row.song.durationSeconds,
      addedBy: row.addedBy,
      addedAt: row.createdAt,
    };
  }
}

function normalizeDescription(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function notOwner(): ApiException {
  return new ApiException(
    HttpStatus.FORBIDDEN,
    'You do not own this playlist.',
    ErrorCodes.PLAYLIST_PERMISSION_DENIED,
  );
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === 'P2002'
  );
}
