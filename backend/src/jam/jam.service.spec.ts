import { JamService, HOST_OFFLINE_THRESHOLD_MS } from './jam.service';
import { ApiException } from '../common/filters/all-exceptions.filter';
import { ErrorCodes } from '../common/constants/error-codes';

function makeMocks() {
  const prisma = {
    jamSession: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    jamParticipant: {
      findUnique: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    tripSong: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn((fnOrPromises: unknown) => {
      if (typeof fnOrPromises === 'function') return fnOrPromises(prisma);
      return Promise.all(fnOrPromises as Promise<unknown>[]);
    }),
  };
  const access = { requireMember: jest.fn() };
  const realtime = {
    broadcastJamState: jest.fn(),
    broadcastJamDeleted: jest.fn(),
  };
  return { prisma, access, realtime };
}

const NOW = Date.now();

function makeJamRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'jam-1',
    tripId: 'trip-1',
    hostUserId: 'user-host',
    currentSongId: 'song-1',
    status: 'ACTIVE',
    isPlaying: false,
    position: 12,
    positionAt: new Date(NOW - 10_000),
    stateVersion: 3,
    hostLastSeenAt: new Date(NOW),
    startedAt: new Date(NOW),
    endedAt: null,
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
    host: { id: 'user-host', name: 'Rohit' },
    currentSong: {
      id: 'song-1',
      youtubeVideoId: 'aaaaaaaaaaa',
      title: 'Song A',
      channelTitle: 'Artist A',
      thumbnailUrl: 'thumb.jpg',
      durationSeconds: 200,
    },
    participants: [
      {
        joinedAt: new Date(NOW),
        user: { id: 'user-host', name: 'Rohit', avatarUrl: null },
      },
    ],
    ...overrides,
  };
}

describe('JamService', () => {
  describe('create', () => {
    it('requires trip membership', async () => {
      const { prisma, access, realtime } = makeMocks();
      const svc = new JamService(
        prisma as never,
        access as never,
        realtime as never,
      );
      access.requireMember.mockRejectedValue(
        new ApiException(
          404,
          'Trip not found or you are not a member.',
          ErrorCodes.TRIP_NOT_FOUND,
        ),
      );

      await expect(svc.create('trip-1', 'user-1')).rejects.toMatchObject({
        status: 404,
      });
      expect(prisma.jamSession.create).not.toHaveBeenCalled();
    });

    it('creates the Jam with the caller as Host and first participant, then broadcasts', async () => {
      const { prisma, access, realtime } = makeMocks();
      const svc = new JamService(
        prisma as never,
        access as never,
        realtime as never,
      );
      access.requireMember.mockResolvedValue({ role: 'MEMBER' });
      prisma.jamSession.findFirst.mockResolvedValue(null);
      prisma.jamSession.create.mockResolvedValue(
        makeJamRow({ id: 'jam-new', hostUserId: 'user-host' }),
      );

      const state = await svc.create('trip-1', 'user-host');

      expect(prisma.jamSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tripId: 'trip-1',
            hostUserId: 'user-host',
            participants: { create: { userId: 'user-host' } },
          }),
        }),
      );
      expect(state).toMatchObject({
        jamId: 'jam-new',
        hostId: 'user-host',
        hostName: 'Rohit',
      });
      expect(realtime.broadcastJamState).toHaveBeenCalledWith(
        'trip-1',
        expect.objectContaining({ jamId: 'jam-new' }),
      );
    });

    it('returns the existing active Jam instead of creating a duplicate', async () => {
      const { prisma, access, realtime } = makeMocks();
      const svc = new JamService(
        prisma as never,
        access as never,
        realtime as never,
      );
      access.requireMember.mockResolvedValue({ role: 'MEMBER' });
      prisma.jamSession.findFirst.mockResolvedValue(makeJamRow());

      const state = await svc.create('trip-1', 'user-host');
      expect(prisma.jamSession.create).not.toHaveBeenCalled();
      expect(state.jamId).toBe('jam-1');
    });

    it('recovers from a concurrent-create unique violation by returning the winner', async () => {
      const { prisma, access, realtime } = makeMocks();
      const svc = new JamService(
        prisma as never,
        access as never,
        realtime as never,
      );
      access.requireMember.mockResolvedValue({ role: 'MEMBER' });
      prisma.jamSession.findFirst.mockResolvedValueOnce(null);
      const dup = Object.assign(new Error('dup'), { code: 'P2002' });
      prisma.jamSession.create.mockRejectedValueOnce(dup);
      prisma.jamSession.findFirst.mockResolvedValueOnce(makeJamRow());

      const state = await svc.create('trip-1', 'user-host');
      expect(state.jamId).toBe('jam-1');
    });
  });

  describe('findActiveForTrip', () => {
    it('returns null when there is no active Jam', async () => {
      const { prisma, access, realtime } = makeMocks();
      const svc = new JamService(
        prisma as never,
        access as never,
        realtime as never,
      );
      access.requireMember.mockResolvedValue({ role: 'MEMBER' });
      prisma.jamSession.findFirst.mockResolvedValue(null);

      await expect(
        svc.findActiveForTrip('trip-1', 'user-1'),
      ).resolves.toBeNull();
    });
  });

  describe('join', () => {
    it('rejects joining an ended Jam', async () => {
      const { prisma, access, realtime } = makeMocks();
      const svc = new JamService(
        prisma as never,
        access as never,
        realtime as never,
      );
      prisma.jamSession.findUnique.mockResolvedValue(
        makeJamRow({ status: 'DELETED' }),
      );

      await expect(svc.join('jam-1', 'user-2')).rejects.toMatchObject({
        status: 409,
        errorCode: ErrorCodes.JAM_ENDED,
      });
      expect(access.requireMember).not.toHaveBeenCalled();
    });

    it('requires trip membership before joining', async () => {
      const { prisma, access, realtime } = makeMocks();
      const svc = new JamService(
        prisma as never,
        access as never,
        realtime as never,
      );
      prisma.jamSession.findUnique.mockResolvedValue(makeJamRow());
      access.requireMember.mockRejectedValue(
        new ApiException(
          404,
          'Trip not found or you are not a member.',
          ErrorCodes.TRIP_NOT_FOUND,
        ),
      );

      await expect(svc.join('jam-1', 'outsider')).rejects.toMatchObject({
        status: 404,
      });
      expect(prisma.jamParticipant.create).not.toHaveBeenCalled();
    });

    it('adds the caller as a participant and broadcasts the fresh state', async () => {
      const { prisma, access, realtime } = makeMocks();
      const svc = new JamService(
        prisma as never,
        access as never,
        realtime as never,
      );
      access.requireMember.mockResolvedValue({ role: 'MEMBER' });
      prisma.jamSession.findUnique
        .mockResolvedValueOnce(makeJamRow())
        .mockResolvedValueOnce(makeJamRow({ stateVersion: 4 }));
      prisma.jamParticipant.upsert.mockResolvedValue({
        id: 'p-2',
        jamSessionId: 'jam-1',
        userId: 'user-2',
      });

      const state = await svc.join('jam-1', 'user-2');
      expect(prisma.jamParticipant.upsert).toHaveBeenCalledWith({
        where: {
          jamSessionId_userId: { jamSessionId: 'jam-1', userId: 'user-2' },
        },
        update: { lastSeenAt: expect.any(Date) },
        create: { jamSessionId: 'jam-1', userId: 'user-2' },
      });
      expect(state.stateVersion).toBe(4);
      expect(realtime.broadcastJamState).toHaveBeenCalledWith(
        'trip-1',
        expect.anything(),
      );
    });

    it('is a no-op (state only, no broadcast) when the user already joined', async () => {
      const { prisma, access, realtime } = makeMocks();
      const svc = new JamService(
        prisma as never,
        access as never,
        realtime as never,
      );
      access.requireMember.mockResolvedValue({ role: 'MEMBER' });
      prisma.jamSession.findUnique.mockResolvedValue(
        makeJamRow({
          participants: [
            {
              joinedAt: new Date(NOW),
              user: { id: 'user-host', name: 'Rohit', avatarUrl: null },
            },
            {
              joinedAt: new Date(NOW),
              user: { id: 'user-2', name: 'Sam', avatarUrl: null },
            },
          ],
        }),
      );

      const state = await svc.join('jam-1', 'user-2');
      expect(prisma.jamParticipant.upsert).not.toHaveBeenCalled();
      expect(realtime.broadcastJamState).not.toHaveBeenCalled();
      expect(state.jamId).toBe('jam-1');
    });
  });

  describe('leave', () => {
    it('blocks the host from leaving', async () => {
      const { prisma, access, realtime } = makeMocks();
      const svc = new JamService(
        prisma as never,
        access as never,
        realtime as never,
      );
      access.requireMember.mockResolvedValue({ role: 'MEMBER' });
      prisma.jamSession.findUnique.mockResolvedValue(
        makeJamRow({ hostUserId: 'user-host' }),
      );

      await expect(svc.leave('jam-1', 'user-host')).rejects.toMatchObject({
        status: 400,
        errorCode: ErrorCodes.JAM_NOT_JOINED,
      });
      expect(prisma.jamParticipant.deleteMany).not.toHaveBeenCalled();
    });

    it('removes a participant and broadcasts', async () => {
      const { prisma, access, realtime } = makeMocks();
      const svc = new JamService(
        prisma as never,
        access as never,
        realtime as never,
      );
      access.requireMember.mockResolvedValue({ role: 'MEMBER' });
      prisma.jamSession.findUnique
        .mockResolvedValueOnce(makeJamRow())
        .mockResolvedValueOnce(makeJamRow({ stateVersion: 5 }));
      prisma.jamParticipant.deleteMany.mockResolvedValue({ count: 1 });

      const state = await svc.leave('jam-1', 'user-2');
      expect(prisma.jamParticipant.deleteMany).toHaveBeenCalledWith({
        where: { jamSessionId: 'jam-1', userId: 'user-2' },
      });
      expect(realtime.broadcastJamState).toHaveBeenCalled();
      expect(state.stateVersion).toBe(5);
    });

    it('does not broadcast when the user was not a participant', async () => {
      const { prisma, access, realtime } = makeMocks();
      const svc = new JamService(
        prisma as never,
        access as never,
        realtime as never,
      );
      access.requireMember.mockResolvedValue({ role: 'MEMBER' });
      prisma.jamSession.findUnique.mockResolvedValue(makeJamRow());
      prisma.jamParticipant.deleteMany.mockResolvedValue({ count: 0 });

      const state = await svc.leave('jam-1', 'user-2');
      expect(realtime.broadcastJamState).not.toHaveBeenCalled();
      expect(state.stateVersion).toBe(3);
    });
  });

  describe('deleteJam', () => {
    it('only the host can delete the Jam', async () => {
      const { prisma, access, realtime } = makeMocks();
      const svc = new JamService(
        prisma as never,
        access as never,
        realtime as never,
      );
      access.requireMember.mockResolvedValue({ role: 'MEMBER' });
      prisma.jamSession.findUnique.mockResolvedValue(makeJamRow());

      await expect(svc.deleteJam('jam-1', 'user-2')).rejects.toMatchObject({
        status: 403,
        errorCode: ErrorCodes.JAM_NOT_HOST,
      });
      expect(prisma.jamSession.update).not.toHaveBeenCalled();
    });

    it('marks the Jam deleted, removes participants and broadcasts jam:deleted', async () => {
      const { prisma, access, realtime } = makeMocks();
      const svc = new JamService(
        prisma as never,
        access as never,
        realtime as never,
      );
      access.requireMember.mockResolvedValue({ role: 'MEMBER' });
      prisma.jamSession.findUnique.mockResolvedValue(makeJamRow());

      await svc.deleteJam('jam-1', 'user-host');

      expect(prisma.jamParticipant.deleteMany).toHaveBeenCalledWith({
        where: { jamSessionId: 'jam-1' },
      });
      expect(prisma.jamSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'jam-1' },
          data: expect.objectContaining({
            status: 'DELETED',
            isPlaying: false,
          }),
        }),
      );
      expect(realtime.broadcastJamDeleted).toHaveBeenCalledWith('trip-1', {
        jamId: 'jam-1',
        tripId: 'trip-1',
        reason: 'HOST_ENDED',
      });
    });
  });

  describe('control', () => {
    it('rejects non-hosts', async () => {
      const { prisma, access, realtime } = makeMocks();
      const svc = new JamService(
        prisma as never,
        access as never,
        realtime as never,
      );
      access.requireMember.mockResolvedValue({ role: 'MEMBER' });
      prisma.jamSession.findUnique.mockResolvedValue(makeJamRow());

      await expect(
        svc.control('jam-1', 'user-2', { action: 'play' }),
      ).rejects.toMatchObject({
        status: 403,
        errorCode: ErrorCodes.JAM_NOT_HOST,
      });
      expect(prisma.jamSession.update).not.toHaveBeenCalled();
    });

    it('rejects control on an ended Jam', async () => {
      const { prisma, access, realtime } = makeMocks();
      const svc = new JamService(
        prisma as never,
        access as never,
        realtime as never,
      );
      prisma.jamSession.findUnique.mockResolvedValue(
        makeJamRow({ status: 'DELETED' }),
      );

      await expect(
        svc.control('jam-1', 'user-host', { action: 'play' }),
      ).rejects.toMatchObject({ status: 409, errorCode: ErrorCodes.JAM_ENDED });
    });

    it('play sets isPlaying and bumps the state version', async () => {
      const { prisma, access, realtime } = makeMocks();
      const svc = new JamService(
        prisma as never,
        access as never,
        realtime as never,
      );
      access.requireMember.mockResolvedValue({ role: 'MEMBER' });
      prisma.jamSession.findUnique.mockResolvedValue(makeJamRow());
      prisma.jamSession.update.mockResolvedValue(
        makeJamRow({ stateVersion: 4, isPlaying: true }),
      );

      const state = await svc.control('jam-1', 'user-host', {
        action: 'play',
        position: 42,
      });

      expect(prisma.jamSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isPlaying: true,
            position: 42,
            stateVersion: { increment: 1 },
          }),
        }),
      );
      expect(state.isPlaying).toBe(true);
      expect(state.stateVersion).toBe(4);
      expect(realtime.broadcastJamState).toHaveBeenCalledWith(
        'trip-1',
        expect.anything(),
      );
    });

    it('pause derives the expected position from the stored playback state', async () => {
      const { prisma, access, realtime } = makeMocks();
      const svc = new JamService(
        prisma as never,
        access as never,
        realtime as never,
      );
      access.requireMember.mockResolvedValue({ role: 'MEMBER' });
      // Playing, positionAt was ~10s ago → expected position is 12 + 10 ≈ 22.
      prisma.jamSession.findUnique.mockResolvedValue(
        makeJamRow({ isPlaying: true }),
      );
      prisma.jamSession.update.mockResolvedValue(
        makeJamRow({ isPlaying: false, position: 22 }),
      );

      await svc.control('jam-1', 'user-host', { action: 'pause' });

      const updateCall = prisma.jamSession.update.mock.calls[0][0] as {
        data: { isPlaying: boolean; position: number };
      };
      expect(updateCall.data.isPlaying).toBe(false);
      expect(updateCall.data.position).toBeCloseTo(22, 0);
    });

    it('seek clamps the position to the song duration', async () => {
      const { prisma, access, realtime } = makeMocks();
      const svc = new JamService(
        prisma as never,
        access as never,
        realtime as never,
      );
      access.requireMember.mockResolvedValue({ role: 'MEMBER' });
      prisma.jamSession.findUnique.mockResolvedValue(makeJamRow());
      prisma.jamSession.update.mockResolvedValue(makeJamRow({ position: 200 }));

      await svc.control('jam-1', 'user-host', {
        action: 'seek',
        position: 9999,
      });

      expect(prisma.jamSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ position: 200 }),
        }),
      );
    });

    it('song_changed requires the song to be in the trip library', async () => {
      const { prisma, access, realtime } = makeMocks();
      const svc = new JamService(
        prisma as never,
        access as never,
        realtime as never,
      );
      access.requireMember.mockResolvedValue({ role: 'MEMBER' });
      prisma.jamSession.findUnique.mockResolvedValue(makeJamRow());
      prisma.tripSong.findFirst.mockResolvedValue(null);

      await expect(
        svc.control('jam-1', 'user-host', {
          action: 'song_changed',
          songId: 'song-9',
        }),
      ).rejects.toMatchObject({
        status: 400,
        errorCode: ErrorCodes.JAM_SONG_NOT_IN_TRIP,
      });
    });

    it('song_changed is atomic: new song, position 0, fresh timestamp, version bump', async () => {
      const { prisma, access, realtime } = makeMocks();
      const svc = new JamService(
        prisma as never,
        access as never,
        realtime as never,
      );
      access.requireMember.mockResolvedValue({ role: 'MEMBER' });
      prisma.jamSession.findUnique.mockResolvedValue(makeJamRow());
      prisma.tripSong.findFirst.mockResolvedValue({
        id: 'link',
        songId: 'song-2',
      });
      const next = makeJamRow({
        currentSongId: 'song-2',
        currentSong: {
          id: 'song-2',
          youtubeVideoId: 'bbbbbbbbbbb',
          title: 'Song B',
          channelTitle: 'Artist B',
          thumbnailUrl: null,
          durationSeconds: 150,
        },
        position: 0,
        stateVersion: 4,
        isPlaying: true,
      });
      prisma.jamSession.update.mockResolvedValue(next);

      const state = await svc.control('jam-1', 'user-host', {
        action: 'song_changed',
        songId: 'song-2',
        isPlaying: true,
      });

      expect(prisma.jamSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentSongId: 'song-2',
            position: 0,
            isPlaying: true,
            stateVersion: { increment: 1 },
          }),
        }),
      );
      expect(state.currentSong?.songId).toBe('song-2');
    });

    it('next advances through the trip library in order', async () => {
      const { prisma, access, realtime } = makeMocks();
      const svc = new JamService(
        prisma as never,
        access as never,
        realtime as never,
      );
      access.requireMember.mockResolvedValue({ role: 'MEMBER' });
      prisma.jamSession.findUnique.mockResolvedValue(makeJamRow());
      // Current song's library link, then the next song after it.
      prisma.tripSong.findFirst
        .mockResolvedValueOnce({ createdAt: new Date(NOW) })
        .mockResolvedValueOnce({ songId: 'song-2' });
      prisma.jamSession.update.mockResolvedValue(
        makeJamRow({ currentSongId: 'song-2', position: 0 }),
      );

      await svc.control('jam-1', 'user-host', { action: 'next' });

      expect(prisma.jamSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentSongId: 'song-2',
            position: 0,
          }),
        }),
      );
    });

    it('next wraps back to the first song when the current song is last', async () => {
      const { prisma, access, realtime } = makeMocks();
      const svc = new JamService(
        prisma as never,
        access as never,
        realtime as never,
      );
      access.requireMember.mockResolvedValue({ role: 'MEMBER' });
      prisma.jamSession.findUnique.mockResolvedValue(
        makeJamRow({ currentSongId: 'song-3' }),
      );
      prisma.tripSong.findFirst
        .mockResolvedValueOnce({ createdAt: new Date(NOW) })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ songId: 'song-1' });
      prisma.jamSession.update.mockResolvedValue(
        makeJamRow({ currentSongId: 'song-1', position: 0 }),
      );

      await svc.control('jam-1', 'user-host', { action: 'next' });

      expect(prisma.jamSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentSongId: 'song-1',
            position: 0,
          }),
        }),
      );
    });

    it('next starts from the first song when nothing is playing', async () => {
      const { prisma, access, realtime } = makeMocks();
      const svc = new JamService(
        prisma as never,
        access as never,
        realtime as never,
      );
      access.requireMember.mockResolvedValue({ role: 'MEMBER' });
      prisma.jamSession.findUnique.mockResolvedValue(
        makeJamRow({ currentSongId: null }),
      );
      prisma.tripSong.findFirst.mockResolvedValueOnce({ songId: 'song-1' });
      prisma.jamSession.update.mockResolvedValue(
        makeJamRow({ currentSongId: 'song-1', position: 0 }),
      );

      await svc.control('jam-1', 'user-host', { action: 'next' });

      expect(prisma.jamSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentSongId: 'song-1',
            position: 0,
          }),
        }),
      );
    });
  });

  describe('host presence', () => {
    it('heartbeat from a non-host is ignored', async () => {
      const { prisma, access, realtime } = makeMocks();
      const svc = new JamService(
        prisma as never,
        access as never,
        realtime as never,
      );
      prisma.jamSession.findFirst.mockResolvedValue(
        makeJamRow({ hostUserId: 'user-host' }),
      );

      const result = await svc.heartbeat('trip-1', 'user-2');
      expect(result).toEqual({ state: null, changed: false });
      expect(prisma.jamSession.update).not.toHaveBeenCalled();
    });

    it('host returning online triggers a changed broadcast state', async () => {
      const { prisma, access, realtime } = makeMocks();
      const svc = new JamService(
        prisma as never,
        access as never,
        realtime as never,
      );
      // Last heartbeat is older than the offline threshold → host was offline.
      prisma.jamSession.findFirst.mockResolvedValue(
        makeJamRow({
          hostLastSeenAt: new Date(NOW - HOST_OFFLINE_THRESHOLD_MS - 5_000),
        }),
      );
      prisma.jamSession.update.mockResolvedValue(
        makeJamRow({ hostLastSeenAt: new Date(NOW) }),
      );

      const result = await svc.heartbeat('trip-1', 'user-host');
      expect(result.changed).toBe(true);
      expect(result.state?.hostOnline).toBe(true);
      expect(prisma.jamSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ stateVersion: { increment: 1 } }),
        }),
      );
    });

    it('silent heartbeat while the host is online does not bump stateVersion', async () => {
      const { prisma, access, realtime } = makeMocks();
      const svc = new JamService(
        prisma as never,
        access as never,
        realtime as never,
      );
      prisma.jamSession.findFirst.mockResolvedValue(
        makeJamRow({ hostLastSeenAt: new Date(NOW - 1_000) }),
      );

      const result = await svc.heartbeat('trip-1', 'user-host');
      expect(result).toEqual({ state: null, changed: false });
      expect(prisma.jamSession.update).toHaveBeenCalledTimes(1);
      const data = (
        prisma.jamSession.update.mock.calls[0][0] as {
          data: Record<string, unknown>;
        }
      ).data;
      expect(data.stateVersion).toBeUndefined();
    });

    it('markHostDisconnected broadcasts hostOnline=false for the host only', async () => {
      const { prisma, access, realtime } = makeMocks();
      const svc = new JamService(
        prisma as never,
        access as never,
        realtime as never,
      );
      prisma.jamSession.findFirst.mockResolvedValue(makeJamRow());

      const changed = await svc.markHostDisconnected('trip-1', 'user-host');
      expect(changed).toBe(true);
      expect(prisma.jamSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hostLastSeenAt: new Date(0),
            isPlaying: false,
          }),
        }),
      );
      expect(realtime.broadcastJamState).toHaveBeenCalledWith(
        'trip-1',
        expect.objectContaining({ hostOnline: false }),
      );
    });

    it('markHostDisconnected is a no-op when the user is not a host', async () => {
      const { prisma, access, realtime } = makeMocks();
      const svc = new JamService(
        prisma as never,
        access as never,
        realtime as never,
      );
      prisma.jamSession.findFirst.mockResolvedValue(
        makeJamRow({ hostUserId: 'other' }),
      );

      await expect(svc.markHostDisconnected('trip-1', 'user-2')).resolves.toBe(
        false,
      );
      expect(prisma.jamSession.update).not.toHaveBeenCalled();
    });
  });

  describe('disconnect cleanup', () => {
    it('removes a disconnected participant and broadcasts the fresh state', async () => {
      const { prisma, access, realtime } = makeMocks();
      const svc = new JamService(
        prisma as never,
        access as never,
        realtime as never,
      );
      prisma.jamSession.findFirst.mockResolvedValue(makeJamRow());
      prisma.jamParticipant.findUnique.mockResolvedValue({ id: 'p-2' });

      await svc.removeParticipantOnDisconnect('trip-1', 'user-2');

      expect(prisma.jamParticipant.delete).toHaveBeenCalledWith({
        where: { id: 'p-2' },
      });
      expect(realtime.broadcastJamState).toHaveBeenCalledWith(
        'trip-1',
        expect.objectContaining({ jamId: 'jam-1' }),
      );
    });

    it('does nothing for the host (handled by markHostDisconnected)', async () => {
      const { prisma, access, realtime } = makeMocks();
      const svc = new JamService(
        prisma as never,
        access as never,
        realtime as never,
      );
      prisma.jamSession.findFirst.mockResolvedValue(
        makeJamRow({ hostUserId: 'user-host' }),
      );

      await svc.removeParticipantOnDisconnect('trip-1', 'user-host');
      expect(prisma.jamParticipant.findUnique).not.toHaveBeenCalled();
      expect(realtime.broadcastJamState).not.toHaveBeenCalled();
    });

    it('does nothing when the user is not in the Jam', async () => {
      const { prisma, access, realtime } = makeMocks();
      const svc = new JamService(
        prisma as never,
        access as never,
        realtime as never,
      );
      prisma.jamSession.findFirst.mockResolvedValue(makeJamRow());
      prisma.jamParticipant.findUnique.mockResolvedValue(null);

      await svc.removeParticipantOnDisconnect('trip-1', 'user-2');
      expect(prisma.jamParticipant.delete).not.toHaveBeenCalled();
      expect(realtime.broadcastJamState).not.toHaveBeenCalled();
    });
  });

  describe('getState', () => {
    it('requires membership of the jam trip', async () => {
      const { prisma, access, realtime } = makeMocks();
      const svc = new JamService(
        prisma as never,
        access as never,
        realtime as never,
      );
      prisma.jamSession.findUnique.mockResolvedValue(makeJamRow());
      access.requireMember.mockRejectedValue(
        new ApiException(
          403,
          'You do not have permission.',
          ErrorCodes.TRIP_PERMISSION_DENIED,
        ),
      );

      await expect(svc.getState('jam-1', 'outsider')).rejects.toMatchObject({
        status: 403,
      });
    });

    it('returns a fully mapped state', async () => {
      const { prisma, access, realtime } = makeMocks();
      const svc = new JamService(
        prisma as never,
        access as never,
        realtime as never,
      );
      access.requireMember.mockResolvedValue({ role: 'MEMBER' });
      prisma.jamSession.findUnique.mockResolvedValue(makeJamRow());

      const state = await svc.getState('jam-1', 'user-host');
      expect(state).toMatchObject({
        jamId: 'jam-1',
        tripId: 'trip-1',
        hostId: 'user-host',
        hostName: 'Rohit',
        hostOnline: true,
        currentSong: { songId: 'song-1', durationSeconds: 200 },
        participants: [{ userId: 'user-host', name: 'Rohit' }],
      });
      expect(typeof state.positionAt).toBe('number');
      expect(typeof state.serverTime).toBe('number');
    });
  });
});
