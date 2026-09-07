import { TripMusicService } from './trip-music.service';
import { ApiException } from '../common/filters/all-exceptions.filter';
import { ErrorCodes } from '../common/constants/error-codes';

function makeMocks() {
  const prisma = {
    tripSong: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    song: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };
  const access = { requireMember: jest.fn() };
  const youtube = {
    searchVideos: jest.fn(),
    isValidVideoId: jest.fn(),
    getVideoDetails: jest.fn(),
  };
  return { prisma, access, youtube };
}

const SONG_ROW = {
  id: 'song-1',
  youtubeVideoId: 'dQw4w9WgXcQ',
  title: 'Never Gonna Give You Up',
  channelTitle: 'Rick Astley',
  thumbnailUrl: 'thumb.jpg',
  durationSeconds: 212,
};

const TRIP_SONG_ROW = {
  id: 'ts-1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  addedByUserId: 'user-owner',
  song: SONG_ROW,
  addedBy: { id: 'user-owner', name: 'Rohit' },
};

describe('TripMusicService', () => {
  it('search requires membership and delegates to YouTube', async () => {
    const { prisma, access, youtube } = makeMocks();
    const svc = new TripMusicService(
      prisma as never,
      access as never,
      youtube as never,
    );
    youtube.searchVideos.mockResolvedValue({
      items: [],
      nextPageToken: null,
      cached: false,
    });

    await svc.search('trip-1', 'user-1', 'arijit singh', 'CAoQAA');
    expect(access.requireMember).toHaveBeenCalledWith('trip-1', 'user-1');
    expect(youtube.searchVideos).toHaveBeenCalledWith('arijit singh', {
      pageToken: 'CAoQAA',
    });
  });

  it('listLibrary requires membership and maps rows', async () => {
    const { prisma, access } = makeMocks();
    const svc = new TripMusicService(
      prisma as never,
      access as never,
      {} as never,
    );
    prisma.tripSong.findMany.mockResolvedValue([TRIP_SONG_ROW]);

    const items = await svc.listLibrary('trip-1', 'user-1');
    expect(access.requireMember).toHaveBeenCalledWith('trip-1', 'user-1');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'ts-1',
      songId: 'song-1',
      youtubeVideoId: 'dQw4w9WgXcQ',
      title: 'Never Gonna Give You Up',
      channelTitle: 'Rick Astley',
      addedBy: { id: 'user-owner', name: 'Rohit' },
    });
  });

  describe('addSong', () => {
    it('rejects an invalid video id before touching the DB', async () => {
      const { prisma, access, youtube } = makeMocks();
      const svc = new TripMusicService(
        prisma as never,
        access as never,
        youtube as never,
      );
      youtube.isValidVideoId.mockReturnValue(false);

      await expect(
        svc.addSong('trip-1', 'user-1', 'bad-id'),
      ).rejects.toMatchObject({
        errorCode: ErrorCodes.YOUTUBE_VIDEO_NOT_FOUND,
      });
      expect(prisma.song.findUnique).not.toHaveBeenCalled();
    });

    it('creates the Song (from YouTube details) and links it to the trip', async () => {
      const { prisma, access, youtube } = makeMocks();
      const svc = new TripMusicService(
        prisma as never,
        access as never,
        youtube as never,
      );
      youtube.isValidVideoId.mockReturnValue(true);
      prisma.song.findUnique.mockResolvedValue(null);
      youtube.getVideoDetails.mockResolvedValue({
        videoId: 'dQw4w9WgXcQ',
        title: 'Never Gonna Give You Up',
        channelTitle: 'Rick Astley',
        thumbnailUrl: 'thumb.jpg',
        durationSeconds: 212,
      });
      prisma.song.create.mockResolvedValue(SONG_ROW);
      prisma.tripSong.create.mockResolvedValue(TRIP_SONG_ROW);

      const item = await svc.addSong('trip-1', 'user-1', 'dQw4w9WgXcQ');
      expect(youtube.getVideoDetails).toHaveBeenCalledWith('dQw4w9WgXcQ');
      expect(prisma.song.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            youtubeVideoId: 'dQw4w9WgXcQ',
            title: 'Never Gonna Give You Up',
            durationSeconds: 212,
          }),
        }),
      );
      expect(prisma.tripSong.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tripId: 'trip-1',
            songId: 'song-1',
            addedByUserId: 'user-1',
          }),
        }),
      );
      expect(item.youtubeVideoId).toBe('dQw4w9WgXcQ');
    });

    it('reuses an existing Song (no YouTube validation call)', async () => {
      const { prisma, access, youtube } = makeMocks();
      const svc = new TripMusicService(
        prisma as never,
        access as never,
        youtube as never,
      );
      youtube.isValidVideoId.mockReturnValue(true);
      prisma.song.findUnique.mockResolvedValue(SONG_ROW);
      prisma.tripSong.create.mockResolvedValue(TRIP_SONG_ROW);

      await svc.addSong('trip-1', 'user-1', 'dQw4w9WgXcQ');
      expect(youtube.getVideoDetails).not.toHaveBeenCalled();
      expect(prisma.song.create).not.toHaveBeenCalled();
    });

    it('rejects when the video cannot be found on YouTube', async () => {
      const { prisma, access, youtube } = makeMocks();
      const svc = new TripMusicService(
        prisma as never,
        access as never,
        youtube as never,
      );
      youtube.isValidVideoId.mockReturnValue(true);
      prisma.song.findUnique.mockResolvedValue(null);
      youtube.getVideoDetails.mockResolvedValue(null);

      await expect(
        svc.addSong('trip-1', 'user-1', 'dQw4w9WgXcQ'),
      ).rejects.toMatchObject({
        errorCode: ErrorCodes.YOUTUBE_VIDEO_NOT_FOUND,
      });
    });

    it('returns a friendly duplicate error on a unique violation (race-safe)', async () => {
      const { prisma, access, youtube } = makeMocks();
      const svc = new TripMusicService(
        prisma as never,
        access as never,
        youtube as never,
      );
      youtube.isValidVideoId.mockReturnValue(true);
      prisma.song.findUnique.mockResolvedValue(SONG_ROW);
      const dup = Object.assign(new Error('dup'), { code: 'P2002' });
      prisma.tripSong.create.mockRejectedValue(dup);

      await expect(
        svc.addSong('trip-1', 'user-1', 'dQw4w9WgXcQ'),
      ).rejects.toMatchObject({
        status: 409,
        errorCode: ErrorCodes.SONG_ALREADY_ADDED,
      });
    });
  });

  describe('removeSong', () => {
    it('lets an OWNER remove any song', async () => {
      const { prisma, access } = makeMocks();
      const svc = new TripMusicService(
        prisma as never,
        access as never,
        {} as never,
      );
      access.requireMember.mockResolvedValue({ role: 'OWNER' });
      prisma.tripSong.findFirst.mockResolvedValue({
        id: 'ts-1',
        addedByUserId: 'someone-else',
      });

      await svc.removeSong('trip-1', 'user-owner', 'song-1');
      expect(prisma.tripSong.delete).toHaveBeenCalledWith({
        where: { id: 'ts-1' },
      });
    });

    it('lets an ADMIN remove any song', async () => {
      const { prisma, access } = makeMocks();
      const svc = new TripMusicService(
        prisma as never,
        access as never,
        {} as never,
      );
      access.requireMember.mockResolvedValue({ role: 'ADMIN' });
      prisma.tripSong.findFirst.mockResolvedValue({
        id: 'ts-1',
        addedByUserId: 'someone-else',
      });

      await expect(
        svc.removeSong('trip-1', 'admin', 'song-1'),
      ).resolves.toBeUndefined();
    });

    it('lets a MEMBER remove only their own add', async () => {
      const { prisma, access } = makeMocks();
      const svc = new TripMusicService(
        prisma as never,
        access as never,
        {} as never,
      );
      access.requireMember.mockResolvedValue({ role: 'MEMBER' });
      prisma.tripSong.findFirst.mockResolvedValue({
        id: 'ts-1',
        addedByUserId: 'user-member',
      });

      await svc.removeSong('trip-1', 'user-member', 'song-1');
      expect(prisma.tripSong.delete).toHaveBeenCalled();
    });

    it('blocks a MEMBER removing someone else\u2019s add', async () => {
      const { prisma, access } = makeMocks();
      const svc = new TripMusicService(
        prisma as never,
        access as never,
        {} as never,
      );
      access.requireMember.mockResolvedValue({ role: 'MEMBER' });
      prisma.tripSong.findFirst.mockResolvedValue({
        id: 'ts-1',
        addedByUserId: 'other-user',
      });

      await expect(
        svc.removeSong('trip-1', 'user-member', 'song-1'),
      ).rejects.toMatchObject({
        status: 403,
        errorCode: ErrorCodes.TRIP_PERMISSION_DENIED,
      });
      expect(prisma.tripSong.delete).not.toHaveBeenCalled();
    });

    it('returns 404 when the song is not in this trip', async () => {
      const { prisma, access } = makeMocks();
      const svc = new TripMusicService(
        prisma as never,
        access as never,
        {} as never,
      );
      access.requireMember.mockResolvedValue({ role: 'OWNER' });
      prisma.tripSong.findFirst.mockResolvedValue(null);

      await expect(
        svc.removeSong('trip-1', 'owner', 'song-9'),
      ).rejects.toMatchObject({
        status: 404,
      });
    });

    it('rejects a non-member (membership check is authoritative)', async () => {
      const { prisma, access } = makeMocks();
      const svc = new TripMusicService(
        prisma as never,
        access as never,
        {} as never,
      );
      access.requireMember.mockRejectedValue(
        new ApiException(
          404,
          'Trip not found or you are not a member.',
          ErrorCodes.TRIP_NOT_FOUND,
        ),
      );

      await expect(
        svc.removeSong('trip-1', 'outsider', 'song-1'),
      ).rejects.toMatchObject({
        status: 404,
      });
      expect(prisma.tripSong.findFirst).not.toHaveBeenCalled();
    });
  });
});
