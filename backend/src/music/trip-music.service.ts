import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TripAccessService } from '../common/services/trip-access.service';
import { YouTubeService } from './youtube.service';
import { ApiException } from '../common/filters/all-exceptions.filter';
import { ErrorCodes } from '../common/constants/error-codes';
import { MemberRole } from '../../generated/prisma/enums';

const TRIP_SONG_INCLUDE = {
  song: true,
  addedBy: { select: { id: true, name: true } },
} as const;

export interface TripSongItem {
  id: string;
  songId: string;
  youtubeVideoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  addedBy: { id: string; name: string };
  addedAt: Date;
}

/**
 * Shared trip music library.
 *
 * - Search is backed by the official YouTube Data API (cached server-side).
 * - Adding creates/derives a Song (metadata from YouTube, never from the
 *   client) and links it to the trip; the DB unique constraint on
 *   (tripId, songId) makes duplicate adds race-safe.
 * - Removal is permission-scoped: OWNER/ADMIN may remove any song; a MEMBER
 *   may only remove songs they added.
 */
@Injectable()
export class TripMusicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TripAccessService,
    private readonly youtube: YouTubeService,
  ) {}

  async search(
    tripId: string,
    userId: string,
    query: string,
    pageToken?: string,
  ) {
    await this.access.requireMember(tripId, userId);

    const normalized = query?.trim() ?? '';
    if (!normalized) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'A search query is required.',
        ErrorCodes.MUSIC_QUERY_REQUIRED,
      );
    }
    return this.youtube.searchVideos(normalized, { pageToken });
  }

  async listLibrary(tripId: string, userId: string): Promise<TripSongItem[]> {
    await this.access.requireMember(tripId, userId);
    const rows = await this.prisma.tripSong.findMany({
      where: { tripId },
      include: TRIP_SONG_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toItem(row));
  }

  /**
   * Adds a song to the trip's library. The Song row is created once and shared
   * across trips; only the TripSong link is per-trip.
   */
  async addSong(
    tripId: string,
    userId: string,
    youtubeVideoId: string,
  ): Promise<TripSongItem> {
    await this.access.requireMember(tripId, userId);

    if (!this.youtube.isValidVideoId(youtubeVideoId)) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'That is not a valid YouTube video id.',
        ErrorCodes.YOUTUBE_VIDEO_NOT_FOUND,
      );
    }

    let song = await this.prisma.song.findUnique({
      where: { youtubeVideoId },
    });

    if (!song) {
      const details = await this.youtube.getVideoDetails(youtubeVideoId);
      if (!details) {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          'That video could not be found on YouTube.',
          ErrorCodes.YOUTUBE_VIDEO_NOT_FOUND,
        );
      }
      song = await this.prisma.song.create({
        data: {
          youtubeVideoId: details.videoId,
          title: details.title,
          channelTitle: details.channelTitle,
          thumbnailUrl: details.thumbnailUrl,
          durationSeconds: details.durationSeconds,
        },
      });
    }

    try {
      const tripSong = await this.prisma.tripSong.create({
        data: { tripId, songId: song.id, addedByUserId: userId },
        include: TRIP_SONG_INCLUDE,
      });
      return this.toItem(tripSong);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          "This song is already in the trip's music.",
          ErrorCodes.SONG_ALREADY_ADDED,
        );
      }
      throw err;
    }
  }

  /**
   * Removes a song from a trip's library. `songId` is the shared Song id;
   * only the trip link is deleted (the Song stays for other trips).
   */
  async removeSong(
    tripId: string,
    actorId: string,
    songId: string,
  ): Promise<void> {
    const membership = await this.access.requireMember(tripId, actorId);

    const tripSong = await this.prisma.tripSong.findFirst({
      where: { tripId, songId },
    });
    if (!tripSong) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "This song is not in the trip's music.",
        ErrorCodes.TRIP_NOT_FOUND,
      );
    }

    const isManager =
      membership.role === MemberRole.OWNER ||
      membership.role === MemberRole.ADMIN;
    const isOwnAdd = tripSong.addedByUserId === actorId;
    if (!isManager && !isOwnAdd) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'Only the member who added this song (or a trip manager) can remove it.',
        ErrorCodes.TRIP_PERMISSION_DENIED,
      );
    }

    await this.prisma.tripSong.delete({ where: { id: tripSong.id } });
  }

  private toItem(row: {
    id: string;
    createdAt: Date;
    addedByUserId: string;
    song: {
      id: string;
      youtubeVideoId: string;
      title: string;
      channelTitle: string;
      thumbnailUrl: string | null;
      durationSeconds: number | null;
    };
    addedBy: { id: string; name: string };
  }): TripSongItem {
    return {
      id: row.id,
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

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === 'P2002'
  );
}
