import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TripAccessService } from '../common/services/trip-access.service';
import { JamRealtimeService } from '../realtime/jam-realtime.service';
import { ApiException } from '../common/filters/all-exceptions.filter';
import { ErrorCodes } from '../common/constants/error-codes';
import { JamStatus } from '../../generated/prisma/enums';
import type {
  JamEndReason,
  JamParticipantState,
  JamSongState,
  JamState,
} from './jam.types';
import type { JamControlDto } from './dto/jam-control.dto';

/** A host is considered offline when no heartbeat arrived within this window. */
export const HOST_OFFLINE_THRESHOLD_MS = 30_000;

const JAM_INCLUDE = {
  host: { select: { id: true, name: true } },
  currentSong: true,
  participants: {
    select: {
      joinedAt: true,
      user: { select: { id: true, name: true, avatarUrl: true } },
    },
    orderBy: { joinedAt: 'asc' },
  },
} as const;

type JamRow = Awaited<
  ReturnType<PrismaService['jamSession']['findUnique']>
> & {
  host: { id: string; name: string };
  currentSong: {
    id: string;
    youtubeVideoId: string;
    title: string;
    channelTitle: string;
    thumbnailUrl: string | null;
    durationSeconds: number | null;
  } | null;
  participants: {
    joinedAt: Date;
    user: { id: string; name: string; avatarUrl: string | null };
  }[];
};

/**
 * Server-authoritative Jam sessions (Phase 3D — Spotify-Jam-style sync).
 *
 * Rules enforced here (never trusted from the client):
 *  - only trip members may create/join/view/control a Jam;
 *  - only ONE active Jam may exist per trip (returned, not duplicated);
 *  - only the Host may mutate playback or delete the Jam;
 *  - a deleted/ended Jam is never joinable or returned as active.
 *
 * Every mutation bumps `stateVersion` and broadcasts the fresh authoritative
 * `jam:state` to the whole trip room so every rider converges without any page
 * refresh. Playback is time-based: `position` + `positionAt` (server clock).
 */
@Injectable()
export class JamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TripAccessService,
    private readonly realtime: JamRealtimeService,
  ) {}

  /** Active Jam for a trip (or null). Validates the caller is a member. */
  async findActiveForTrip(
    tripId: string,
    userId: string,
  ): Promise<JamState | null> {
    await this.access.requireMember(tripId, userId);
    const jam = await this.findActive(tripId);
    return jam ? this.toState(jam) : null;
  }

  /** Current authoritative state of a specific Jam. */
  async getState(jamId: string, userId: string): Promise<JamState> {
    const jam = await this.findJam(jamId);
    await this.access.requireMember(jam.tripId, userId);
    return this.toState(jam);
  }

  /**
   * Creates a Jam with the caller as Host (and first participant). Idempotent:
   * when an active Jam already exists for the trip it is returned unchanged, so
   * a concurrent create never produces a second active session.
   */
  async create(tripId: string, userId: string): Promise<JamState> {
    await this.access.requireMember(tripId, userId);

    const existing = await this.findActive(tripId);
    if (existing) return this.toState(existing);

    const now = new Date();
    try {
      const jam = await this.prisma.jamSession.create({
        data: {
          tripId,
          hostUserId: userId,
          positionAt: now,
          hostLastSeenAt: now,
          startedAt: now,
          participants: { create: { userId } },
        },
        include: JAM_INCLUDE,
      });
      const state = this.toState(jam);
      // "Rohit started a Jam" — every connected trip member learns about it.
      this.realtime.broadcastJamState(tripId, state);
      return state;
    } catch (err) {
      // A concurrent create tripped the partial unique index on ACTIVE jams.
      if (isUniqueViolation(err)) {
        const jam = await this.findActive(tripId);
        if (jam) return this.toState(jam);
      }
      throw err;
    }
  }

  /** Adds the caller as a participant and returns the fresh Jam state. */
  async join(jamId: string, userId: string): Promise<JamState> {
    const jam = await this.findJam(jamId);
    if (jam.status !== JamStatus.ACTIVE) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'This Jam is no longer active.',
        ErrorCodes.JAM_ENDED,
      );
    }
    await this.access.requireMember(jam.tripId, userId);

    const existing = await this.prisma.jamParticipant.findUnique({
      where: {
        jamSessionId_userId: { jamSessionId: jamId, userId },
      },
    });
    if (!existing) {
      await this.prisma.jamParticipant.create({
        data: { jamSessionId: jamId, userId },
      });
    }

    const fresh = await this.findJam(jamId);
    const state = this.toState(fresh);
    this.realtime.broadcastJamState(jam.tripId, state);
    return state;
  }

  /** Removes the caller from the participants (hosts must end the Jam). */
  async leave(jamId: string, userId: string): Promise<JamState> {
    const jam = await this.findJam(jamId);
    await this.access.requireMember(jam.tripId, userId);
    if (jam.hostUserId === userId) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'The Host cannot leave the Jam. End the Jam instead.',
        ErrorCodes.JAM_NOT_JOINED,
      );
    }

    await this.prisma.jamParticipant.deleteMany({
      where: { jamSessionId: jamId, userId },
    });

    const fresh = await this.findJam(jamId);
    const state = this.toState(fresh);
    this.realtime.broadcastJamState(jam.tripId, state);
    return state;
  }

  /** Ends the Jam (Host only). Every participant is removed automatically. */
  async deleteJam(jamId: string, userId: string): Promise<void> {
    const jam = await this.findJam(jamId);
    await this.access.requireMember(jam.tripId, userId);
    if (jam.hostUserId !== userId) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'Only the Jam Host can end the Jam.',
        ErrorCodes.JAM_NOT_HOST,
      );
    }

    const reason: JamEndReason = 'HOST_ENDED';
    await this.prisma.$transaction([
      this.prisma.jamParticipant.deleteMany({ where: { jamSessionId: jamId } }),
      this.prisma.jamSession.update({
        where: { id: jamId },
        data: {
          status: JamStatus.DELETED,
          endedAt: new Date(),
          isPlaying: false,
        },
      }),
    ]);

    this.realtime.broadcastJamDeleted(jam.tripId, {
      jamId,
      tripId: jam.tripId,
      reason,
    });
  }

  /**
   * Host-only playback mutation. The resulting state is the single source of
   * truth: every connected rider (including the Host's own player) re-syncs
   * from the broadcast `jam:state` — there is no per-client playback decision.
   */
  async control(
    jamId: string,
    userId: string,
    input: JamControlDto,
  ): Promise<JamState> {
    const jam = await this.findJam(jamId);
    if (jam.status !== JamStatus.ACTIVE) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'This Jam is no longer active.',
        ErrorCodes.JAM_ENDED,
      );
    }
    await this.access.requireMember(jam.tripId, userId);
    if (jam.hostUserId !== userId) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'Only the Jam Host can control playback.',
        ErrorCodes.JAM_NOT_HOST,
      );
    }

    const now = new Date();
    const data = await this.buildControlUpdate(jam, input, now);

    const updated = await this.prisma.jamSession.update({
      where: { id: jamId },
      data: {
        ...data,
        stateVersion: { increment: 1 },
        hostLastSeenAt: now,
      },
      include: JAM_INCLUDE,
    });

    const state = this.toState(updated);
    this.realtime.broadcastJamState(jam.tripId, state);
    return state;
  }

  /**
   * Host presence heartbeat. Returns `changed: true` (with fresh state) when the
   * host just came back online so the gateway can broadcast it; otherwise the
   * heartbeat is silent.
   */
  async heartbeat(tripId: string, userId: string): Promise<{
    state: JamState | null;
    changed: boolean;
  }> {
    const jam = await this.findActive(tripId);
    if (!jam || jam.hostUserId !== userId) {
      return { state: null, changed: false };
    }
    const now = Date.now();
    const wasOnline = now - jam.hostLastSeenAt.getTime() < HOST_OFFLINE_THRESHOLD_MS;
    await this.prisma.jamSession.update({
      where: { id: jam.id },
      data: { hostLastSeenAt: new Date(now), stateVersion: { increment: 1 } },
    });
    if (wasOnline) return { state: null, changed: false };
    const fresh = await this.findActive(tripId);
    return { state: fresh ? this.toState(fresh) : null, changed: true };
  }

  /**
   * Marks the host offline after a socket disconnect and pauses playback so no
   * participant keeps drifting. Returns true (and broadcasts `jam:state`) when
   * an active Jam owned by the user exists.
   */
  async markHostDisconnected(
    tripId: string,
    userId: string,
  ): Promise<boolean> {
    const jam = await this.findActive(tripId);
    if (!jam || jam.hostUserId !== userId) return false;
    const now = new Date();
    await this.prisma.jamSession.update({
      where: { id: jam.id },
      data: {
        hostLastSeenAt: new Date(0),
        isPlaying: false,
        position: expectedPosition(jam, now),
        positionAt: now,
        stateVersion: { increment: 1 },
      },
    });
    const fresh = await this.findActive(tripId);
    if (fresh) this.realtime.broadcastJamState(tripId, this.toState(fresh));
    return true;
  }

  /**
   * Removes a non-host participant whose socket disconnected (they re-join on
   * reconnect). Keeps the participant list/count accurate in realtime. Host
   * disconnects are handled by `markHostDisconnected`.
   */
  async removeParticipantOnDisconnect(
    tripId: string,
    userId: string,
  ): Promise<void> {
    const jam = await this.findActive(tripId);
    if (!jam || jam.status !== JamStatus.ACTIVE || jam.hostUserId === userId) {
      return;
    }
    const existing = await this.prisma.jamParticipant.findUnique({
      where: {
        jamSessionId_userId: { jamSessionId: jam.id, userId },
      },
    });
    if (!existing) return;
    await this.prisma.jamParticipant.delete({ where: { id: existing.id } });
    const fresh = await this.findActive(tripId);
    if (fresh) this.realtime.broadcastJamState(tripId, this.toState(fresh));
  }

  // ------------------------------------------------------------- internals

  private async buildControlUpdate(
    jam: JamRow,
    input: JamControlDto,
    now: Date,
  ): Promise<Record<string, unknown>> {
    const duration = jam.currentSong?.durationSeconds ?? null;

    switch (input.action) {
      case 'play': {
        return {
          isPlaying: true,
          position: clampPosition(input.position ?? expectedPosition(jam, now), duration),
          positionAt: now,
        };
      }
      case 'pause': {
        return {
          isPlaying: false,
          position: clampPosition(input.position ?? expectedPosition(jam, now), duration),
          positionAt: now,
        };
      }
      case 'seek': {
        if (input.position == null) {
          throw new ApiException(
            HttpStatus.BAD_REQUEST,
            'position is required for a seek.',
            ErrorCodes.JAM_INVALID_ACTION,
          );
        }
        return {
          position: clampPosition(input.position, duration),
          positionAt: now,
        };
      }
      case 'song_changed': {
        if (!input.songId) {
          throw new ApiException(
            HttpStatus.BAD_REQUEST,
            'songId is required to change the song.',
            ErrorCodes.JAM_INVALID_ACTION,
          );
        }
        await this.assertSongInTrip(jam.tripId, input.songId);
        return {
          currentSongId: input.songId,
          position: clampPosition(input.position ?? 0, null),
          positionAt: now,
          isPlaying: input.isPlaying ?? jam.isPlaying,
        };
      }
      case 'next': {
        const nextSongId = await this.nextSongFor(jam);
        if (!nextSongId) {
          throw new ApiException(
            HttpStatus.CONFLICT,
            'The trip has no more songs to play.',
            ErrorCodes.JAM_SONG_NOT_IN_TRIP,
          );
        }
        return {
          currentSongId: nextSongId,
          position: 0,
          positionAt: now,
          isPlaying: jam.isPlaying,
        };
      }
      default:
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          'Unknown playback action.',
          ErrorCodes.JAM_INVALID_ACTION,
        );
    }
  }

  private async assertSongInTrip(
    tripId: string,
    songId: string,
  ): Promise<void> {
    const link = await this.prisma.tripSong.findFirst({
      where: { tripId, songId },
    });
    if (!link) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'That song is not in this trip\'s music library.',
        ErrorCodes.JAM_SONG_NOT_IN_TRIP,
      );
    }
  }

  /** Next song in library order (oldest-added first), wrapping at the end. */
  private async nextSongFor(jam: JamRow): Promise<string | null> {
    const songs = await this.prisma.tripSong.findMany({
      where: { tripId: jam.tripId },
      orderBy: { createdAt: 'asc' },
      select: { songId: true },
    });
    if (songs.length === 0) return null;
    if (!jam.currentSongId) return songs[0].songId;
    const index = songs.findIndex((s) => s.songId === jam.currentSongId);
    return songs[(index + 1) % songs.length].songId;
  }

  private async findActive(tripId: string): Promise<JamRow | null> {
    return this.prisma.jamSession.findFirst({
      where: { tripId, status: JamStatus.ACTIVE },
      include: JAM_INCLUDE,
    });
  }

  private async findJam(jamId: string): Promise<JamRow> {
    const jam = await this.prisma.jamSession.findUnique({
      where: { id: jamId },
      include: JAM_INCLUDE,
    });
    if (!jam) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'This Jam was not found.',
        ErrorCodes.JAM_NOT_FOUND,
      );
    }
    return jam;
  }

  private toState(jam: JamRow): JamState {
    const serverTime = Date.now();
    const currentSong: JamSongState | null = jam.currentSong
      ? {
          songId: jam.currentSong.id,
          youtubeVideoId: jam.currentSong.youtubeVideoId,
          title: jam.currentSong.title,
          channelTitle: jam.currentSong.channelTitle,
          thumbnailUrl: jam.currentSong.thumbnailUrl,
          durationSeconds: jam.currentSong.durationSeconds,
        }
      : null;
    const participants: JamParticipantState[] = (jam.participants ?? []).map(
      (p) => ({
        userId: p.user.id,
        name: p.user.name,
        avatarUrl: p.user.avatarUrl,
        joinedAt: p.joinedAt.toISOString(),
      }),
    );
    return {
      jamId: jam.id,
      tripId: jam.tripId,
      hostId: jam.hostUserId,
      hostName: jam.host?.name ?? '',
      status: jam.status,
      isPlaying: jam.isPlaying,
      position: jam.position,
      positionAt: jam.positionAt.getTime(),
      stateVersion: jam.stateVersion,
      hostOnline:
        serverTime - jam.hostLastSeenAt.getTime() < HOST_OFFLINE_THRESHOLD_MS,
      currentSong,
      participants,
      serverTime,
    };
  }
}

function clampPosition(
  position: number,
  durationSeconds: number | null,
): number {
  if (!Number.isFinite(position) || position < 0) return 0;
  if (durationSeconds != null && durationSeconds > 0) {
    return Math.min(position, durationSeconds);
  }
  return position;
}

function expectedPosition(
  jam: { isPlaying: boolean; position: number; positionAt: Date },
  now: Date,
): number {
  if (!jam.isPlaying) return jam.position;
  const elapsed = (now.getTime() - jam.positionAt.getTime()) / 1000;
  return Math.max(0, jam.position + elapsed);
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === 'P2002'
  );
}
