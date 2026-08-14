import { PlaylistsService } from './playlists.service';
import { ApiException } from '../common/filters/all-exceptions.filter';
import { ErrorCodes } from '../common/constants/error-codes';

function makeMocks() {
  const prisma = {
    playlist: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    playlistSong: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(() => Promise.resolve({})),
    },
    song: { findUnique: jest.fn() },
    $transaction: jest.fn((ops) => Promise.all(ops)),
  };
  const access = { requireMember: jest.fn() };
  return { prisma, access };
}

function makePlaylist(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pl-1',
    name: 'My Ride Mix',
    description: null,
    isPublic: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    userId: 'user-1',
    tripId: null,
    user: { id: 'user-1', name: 'Rohit', avatarUrl: null },
    trip: null,
    _count: { songs: 2 },
    ...overrides,
  };
}

function makeSongRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ps-1',
    playlistId: 'pl-1',
    position: 0,
    song: {
      id: 'song-1',
      youtubeVideoId: 'dQw4w9WgXcQ',
      title: 'Safarnama',
      channelTitle: 'Lucky Ali',
      thumbnailUrl: 'thumb.jpg',
      durationSeconds: 282,
    },
    addedBy: { id: 'user-1', name: 'Rohit' },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('PlaylistsService', () => {
  describe('create', () => {
    it('creates a personal playlist without a trip', async () => {
      const { prisma, access } = makeMocks();
      const svc = new PlaylistsService(prisma as never, access as never);
      prisma.playlist.create.mockResolvedValue(makePlaylist());

      const result = await svc.create('user-1', { name: ' My Ride Mix ' });

      expect(access.requireMember).not.toHaveBeenCalled();
      expect(prisma.playlist.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            name: 'My Ride Mix',
            tripId: null,
            isPublic: true,
          }),
        }),
      );
      expect(result).toMatchObject({ id: 'pl-1', songCount: 2, songs: [] });
    });

    it('requires trip membership when a tripId is supplied', async () => {
      const { prisma, access } = makeMocks();
      const svc = new PlaylistsService(prisma as never, access as never);
      prisma.playlist.create.mockResolvedValue(
        makePlaylist({ tripId: 'trip-1' }),
      );

      await svc.create('user-1', { name: 'Goa Mix', tripId: 'trip-1' });
      expect(access.requireMember).toHaveBeenCalledWith('trip-1', 'user-1');
    });
  });

  describe('listMine', () => {
    it('returns only the user\u2019s own playlists', async () => {
      const { prisma } = makeMocks();
      const svc = new PlaylistsService(prisma as never, {} as never);
      prisma.playlist.findMany.mockResolvedValue([makePlaylist()]);

      const rows = await svc.listMine('user-1');
      expect(prisma.playlist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } }),
      );
      expect(rows[0]).toMatchObject({ id: 'pl-1', songCount: 2 });
    });
  });

  describe('listForTrip', () => {
    it('requires membership and returns public + own playlists', async () => {
      const { prisma, access } = makeMocks();
      const svc = new PlaylistsService(prisma as never, access as never);
      prisma.playlist.findMany.mockResolvedValue([
        makePlaylist({ tripId: 'trip-1' }),
      ]);

      await svc.listForTrip('trip-1', 'user-2');
      expect(access.requireMember).toHaveBeenCalledWith('trip-1', 'user-2');
      expect(prisma.playlist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tripId: 'trip-1',
            OR: [{ isPublic: true }, { userId: 'user-2' }],
          },
        }),
      );
    });
  });

  describe('get', () => {
    it('returns the playlist with songs for the owner', async () => {
      const { prisma } = makeMocks();
      const svc = new PlaylistsService(prisma as never, {} as never);
      prisma.playlist.findUnique.mockResolvedValue(makePlaylist());
      prisma.playlistSong.findMany.mockResolvedValue([makeSongRow()]);

      const detail = await svc.get('pl-1', 'user-1');
      expect(detail.songCount).toBe(2);
      expect(detail.songs[0]).toMatchObject({
        songId: 'song-1',
        youtubeVideoId: 'dQw4w9WgXcQ',
        position: 0,
      });
    });

    it('returns 404 for a missing playlist', async () => {
      const { prisma } = makeMocks();
      const svc = new PlaylistsService(prisma as never, {} as never);
      prisma.playlist.findUnique.mockResolvedValue(null);

      await expect(svc.get('pl-9', 'user-1')).rejects.toMatchObject({
        status: 404,
        errorCode: ErrorCodes.PLAYLIST_NOT_FOUND,
      });
    });

    it('blocks a non-owner from viewing a private playlist', async () => {
      const { prisma } = makeMocks();
      const svc = new PlaylistsService(prisma as never, {} as never);
      prisma.playlist.findUnique.mockResolvedValue(
        makePlaylist({ isPublic: false, userId: 'owner-1' }),
      );

      await expect(svc.get('pl-1', 'user-2')).rejects.toMatchObject({
        status: 403,
        errorCode: ErrorCodes.PLAYLIST_ACCESS_DENIED,
      });
    });

    it('allows a member to view a public trip playlist', async () => {
      const { prisma, access } = makeMocks();
      const svc = new PlaylistsService(prisma as never, access as never);
      prisma.playlist.findUnique.mockResolvedValue(
        makePlaylist({ isPublic: true, userId: 'owner-1', tripId: 'trip-1' }),
      );
      prisma.playlistSong.findMany.mockResolvedValue([]);
      access.requireMember.mockResolvedValue({});

      await expect(svc.get('pl-1', 'user-2')).resolves.toBeDefined();
      expect(access.requireMember).toHaveBeenCalledWith('trip-1', 'user-2');
    });

    it('blocks a non-member from a public trip playlist', async () => {
      const { prisma, access } = makeMocks();
      const svc = new PlaylistsService(prisma as never, access as never);
      prisma.playlist.findUnique.mockResolvedValue(
        makePlaylist({ isPublic: true, userId: 'owner-1', tripId: 'trip-1' }),
      );
      access.requireMember.mockRejectedValue(
        new ApiException(404, 'Trip not found.', ErrorCodes.TRIP_NOT_FOUND),
      );

      await expect(svc.get('pl-1', 'user-3')).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('update', () => {
    it('lets the owner rename and toggle visibility', async () => {
      const { prisma } = makeMocks();
      const svc = new PlaylistsService(prisma as never, {} as never);
      prisma.playlist.findUnique.mockResolvedValue(makePlaylist());
      prisma.playlist.update.mockResolvedValue(
        makePlaylist({ name: 'Renamed' }),
      );

      await svc.update('pl-1', 'user-1', { name: 'Renamed', isPublic: false });
      expect(prisma.playlist.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'Renamed', isPublic: false }),
        }),
      );
    });

    it('blocks a non-owner from updating', async () => {
      const { prisma } = makeMocks();
      const svc = new PlaylistsService(prisma as never, {} as never);
      prisma.playlist.findUnique.mockResolvedValue(
        makePlaylist({ userId: 'owner-1' }),
      );

      await expect(
        svc.update('pl-1', 'user-2', { name: 'Hijack' }),
      ).rejects.toMatchObject({
        status: 403,
        errorCode: ErrorCodes.PLAYLIST_PERMISSION_DENIED,
      });
      expect(prisma.playlist.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes only the playlist (Song rows untouched)', async () => {
      const { prisma } = makeMocks();
      const svc = new PlaylistsService(prisma as never, {} as never);
      prisma.playlist.findUnique.mockResolvedValue(makePlaylist());

      await svc.remove('pl-1', 'user-1');
      expect(prisma.playlist.delete).toHaveBeenCalledWith({
        where: { id: 'pl-1' },
      });
    });

    it('blocks a non-owner from deleting', async () => {
      const { prisma } = makeMocks();
      const svc = new PlaylistsService(prisma as never, {} as never);
      prisma.playlist.findUnique.mockResolvedValue(
        makePlaylist({ userId: 'owner-1' }),
      );

      await expect(svc.remove('pl-1', 'user-2')).rejects.toMatchObject({
        status: 403,
      });
      expect(prisma.playlist.delete).not.toHaveBeenCalled();
    });
  });

  describe('addSong', () => {
    it('appends a song at the next position', async () => {
      const { prisma } = makeMocks();
      const svc = new PlaylistsService(prisma as never, {} as never);
      prisma.playlist.findUnique.mockResolvedValue(makePlaylist());
      prisma.song.findUnique.mockResolvedValue({ id: 'song-1' });
      prisma.playlistSong.count.mockResolvedValue(2);
      prisma.playlistSong.create.mockResolvedValue(
        makeSongRow({ position: 2 }),
      );

      const item = await svc.addSong('pl-1', 'user-1', 'song-1');
      expect(prisma.playlistSong.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            position: 2,
            addedByUserId: 'user-1',
          }),
        }),
      );
      expect(item.position).toBe(2);
    });

    it('returns 404 for an unknown song', async () => {
      const { prisma } = makeMocks();
      const svc = new PlaylistsService(prisma as never, {} as never);
      prisma.playlist.findUnique.mockResolvedValue(makePlaylist());
      prisma.song.findUnique.mockResolvedValue(null);

      await expect(
        svc.addSong('pl-1', 'user-1', 'song-9'),
      ).rejects.toMatchObject({
        status: 404,
      });
    });

    it('returns a friendly conflict on a duplicate (race-safe)', async () => {
      const { prisma } = makeMocks();
      const svc = new PlaylistsService(prisma as never, {} as never);
      prisma.playlist.findUnique.mockResolvedValue(makePlaylist());
      prisma.song.findUnique.mockResolvedValue({ id: 'song-1' });
      prisma.playlistSong.count.mockResolvedValue(0);
      const dup = Object.assign(new Error('dup'), { code: 'P2002' });
      prisma.playlistSong.create.mockRejectedValue(dup);

      await expect(
        svc.addSong('pl-1', 'user-1', 'song-1'),
      ).rejects.toMatchObject({
        status: 409,
        errorCode: ErrorCodes.SONG_ALREADY_IN_PLAYLIST,
      });
    });

    it('blocks a non-owner from adding', async () => {
      const { prisma } = makeMocks();
      const svc = new PlaylistsService(prisma as never, {} as never);
      prisma.playlist.findUnique.mockResolvedValue(
        makePlaylist({ userId: 'owner-1' }),
      );

      await expect(
        svc.addSong('pl-1', 'user-2', 'song-1'),
      ).rejects.toMatchObject({
        status: 403,
      });
      expect(prisma.playlistSong.create).not.toHaveBeenCalled();
    });
  });

  describe('removeSong', () => {
    it('deletes only the PlaylistSong link', async () => {
      const { prisma } = makeMocks();
      const svc = new PlaylistsService(prisma as never, {} as never);
      prisma.playlist.findUnique.mockResolvedValue(makePlaylist());
      prisma.playlistSong.findFirst.mockResolvedValue({
        id: 'ps-1',
        songId: 'song-1',
      });

      await svc.removeSong('pl-1', 'user-1', 'song-1');
      expect(prisma.playlistSong.delete).toHaveBeenCalledWith({
        where: { id: 'ps-1' },
      });
    });

    it('returns 404 when the song is not in the playlist', async () => {
      const { prisma } = makeMocks();
      const svc = new PlaylistsService(prisma as never, {} as never);
      prisma.playlist.findUnique.mockResolvedValue(makePlaylist());
      prisma.playlistSong.findFirst.mockResolvedValue(null);

      await expect(
        svc.removeSong('pl-1', 'user-1', 'song-9'),
      ).rejects.toMatchObject({
        status: 404,
        errorCode: ErrorCodes.SONG_NOT_IN_PLAYLIST,
      });
      expect(prisma.playlistSong.delete).not.toHaveBeenCalled();
    });
  });

  describe('reorder', () => {
    it('recomputes positions from the supplied order', async () => {
      const { prisma } = makeMocks();
      const svc = new PlaylistsService(prisma as never, {} as never);
      prisma.playlist.findUnique.mockResolvedValue(makePlaylist());
      prisma.playlistSong.findMany.mockResolvedValue([
        { id: 'a', songId: 'song-a' },
        { id: 'b', songId: 'song-b' },
        { id: 'c', songId: 'song-c' },
      ]);

      await svc.reorder('pl-1', 'user-1', ['song-c', 'song-a', 'song-b']);

      expect(prisma.playlistSong.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'c' }, data: { position: 0 } }),
      );
      expect(prisma.playlistSong.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'a' }, data: { position: 1 } }),
      );
      expect(prisma.playlistSong.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'b' }, data: { position: 2 } }),
      );
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Array));
    });

    it('rejects an order that does not match the current songs', async () => {
      const { prisma } = makeMocks();
      const svc = new PlaylistsService(prisma as never, {} as never);
      prisma.playlist.findUnique.mockResolvedValue(makePlaylist());
      prisma.playlistSong.findMany.mockResolvedValue([
        { id: 'a', songId: 'song-a' },
        { id: 'b', songId: 'song-b' },
      ]);

      await expect(
        svc.reorder('pl-1', 'user-1', ['song-a']),
      ).rejects.toMatchObject({
        status: 409,
        errorCode: ErrorCodes.PLAYLIST_REORDER_MISMATCH,
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('allows an empty reorder on an empty playlist', async () => {
      const { prisma } = makeMocks();
      const svc = new PlaylistsService(prisma as never, {} as never);
      prisma.playlist.findUnique.mockResolvedValue(makePlaylist());
      prisma.playlistSong.findMany.mockResolvedValue([]);

      await expect(svc.reorder('pl-1', 'user-1', [])).resolves.toBeUndefined();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('blocks a non-owner from reordering', async () => {
      const { prisma } = makeMocks();
      const svc = new PlaylistsService(prisma as never, {} as never);
      prisma.playlist.findUnique.mockResolvedValue(
        makePlaylist({ userId: 'owner-1' }),
      );

      await expect(svc.reorder('pl-1', 'user-2', [])).rejects.toMatchObject({
        status: 403,
      });
    });
  });
});
