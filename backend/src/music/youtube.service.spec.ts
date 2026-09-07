import { YouTubeService, parseIsoDuration } from './youtube.service';
import { ErrorCodes } from '../common/constants/error-codes';

function makeService(overrides: Partial<Record<string, unknown>> = {}) {
  const config = {
    youtubeApiKey: 'test-key',
    youtubeSearchCacheTtlMs: 60_000,
    youtubeSearchMaxResults: 10,
    youtubeSearchMaxQueryLength: 200,
    ...overrides,
  };
  return new YouTubeService(config as never);
}

function searchResponse(items: Array<Record<string, unknown>> = []) {
  return {
    ok: true,
    json: async () => ({ items }),
  } as Response;
}

function errorResponse(status: number, reason: string) {
  return {
    ok: false,
    status,
    json: async () => ({
      error: { message: 'nope', errors: [{ reason }] },
    }),
  } as Response;
}

describe('parseIsoDuration', () => {
  it('parses minutes and seconds', () => {
    expect(parseIsoDuration('PT4M13S')).toBe(253);
  });
  it('parses hours + minutes + seconds', () => {
    expect(parseIsoDuration('PT1H2M3S')).toBe(3723);
  });
  it('returns null for garbage', () => {
    expect(parseIsoDuration('P1DT2H')).toBeNull();
    expect(parseIsoDuration(undefined)).toBeNull();
  });
});

describe('YouTubeService', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('normalizeQuery', () => {
    it('lowercases and collapses whitespace', () => {
      const svc = makeService();
      expect(svc.normalizeQuery('  Arijit   Singh  ')).toBe('arijit singh');
    });
  });

  describe('isValidVideoId', () => {
    it('accepts 11-char ids and rejects others', () => {
      const svc = makeService();
      expect(svc.isValidVideoId('dQw4w9WgXcQ')).toBe(true);
      expect(svc.isValidVideoId('abc')).toBe(false);
      expect(svc.isValidVideoId('dQw4w9WgXcQ-extra')).toBe(false);
      expect(svc.isValidVideoId(123)).toBe(false);
      expect(svc.isValidVideoId('')).toBe(false);
    });
  });

  describe('searchVideos', () => {
    it('rejects an empty query without calling the provider', async () => {
      const svc = makeService();
      await expect(svc.searchVideos('   ')).rejects.toMatchObject({
        errorCode: ErrorCodes.MUSIC_QUERY_REQUIRED,
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('rejects an over-long query', async () => {
      const svc = makeService();
      await expect(svc.searchVideos('x'.repeat(300))).rejects.toMatchObject({
        errorCode: ErrorCodes.VALIDATION_ERROR,
      });
    });

    it('throws YOUTUBE_API_KEY_MISSING when the key is not configured', async () => {
      const svc = makeService({ youtubeApiKey: '' });
      await expect(svc.searchVideos('arijit singh')).rejects.toMatchObject({
        status: 503,
        errorCode: ErrorCodes.YOUTUBE_API_KEY_MISSING,
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('maps search results into the UI shape', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        searchResponse([
          {
            id: { videoId: 'dQw4w9WgXcQ' },
            snippet: {
              title: 'Never Gonna Give You Up',
              channelTitle: 'Rick Astley',
              publishedAt: '2009-10-25T06:57:33Z',
              thumbnails: {
                medium: {
                  url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
                },
              },
            },
          },
          { id: { videoId: 'x' }, snippet: null }, // filtered out
        ]),
      );
      const svc = makeService();
      const page = await svc.searchVideos('Rick Astley');
      expect(page.cached).toBe(false);
      expect(page.items).toHaveLength(1);
      expect(page.items[0]).toMatchObject({
        videoId: 'dQw4w9WgXcQ',
        title: 'Never Gonna Give You Up',
        channelTitle: 'Rick Astley',
        thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
        publishedAt: '2009-10-25T06:57:33Z',
      });
      const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
      expect(url).toContain('/search');
      expect(url).toContain('type=video');
      expect(url).toContain('videoEmbeddable=true');
      expect(url).toContain('videoSyndicated=true');
      expect(url).toContain('key=test-key');
    });

    it('serves cached results and skips the provider', async () => {
      const fetchMock = jest.fn().mockResolvedValue(searchResponse([]));
      global.fetch = fetchMock;
      const svc = makeService();
      const first = await svc.searchVideos('Arijit Singh');
      const second = await svc.searchVideos('arijit singh'); // same normalized key
      expect(first.cached).toBe(false);
      expect(second.cached).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('expires the cache after the TTL', async () => {
      const fetchMock = jest.fn().mockResolvedValue(searchResponse([]));
      global.fetch = fetchMock;
      const svc = makeService({ youtubeSearchCacheTtlMs: 1000 });
      const now = 1_000_000;
      await svc.searchVideos('road trip songs', undefined, now);
      await svc.searchVideos('road trip songs', undefined, now + 500);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await svc.searchVideos('road trip songs', undefined, now + 2_000);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('maps quota exhaustion to YOUTUBE_API_ERROR', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(errorResponse(403, 'quotaExceeded'));
      const svc = makeService();
      await expect(svc.searchVideos('arijit singh')).rejects.toMatchObject({
        status: 503,
        errorCode: ErrorCodes.YOUTUBE_API_ERROR,
      });
    });

    it('maps provider failures to YOUTUBE_API_ERROR', async () => {
      global.fetch = jest.fn().mockRejectedValue(new TypeError('network down'));
      const svc = makeService();
      await expect(svc.searchVideos('arijit singh')).rejects.toMatchObject({
        errorCode: ErrorCodes.YOUTUBE_API_ERROR,
      });
    });
  });

  describe('getVideoDetails', () => {
    it('returns null for an invalid id without calling the provider', async () => {
      const svc = makeService();
      await expect(svc.getVideoDetails('abc')).resolves.toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('returns parsed details including duration', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            {
              id: 'dQw4w9WgXcQ',
              snippet: {
                title: 'Never Gonna Give You Up',
                channelTitle: 'Rick Astley',
                thumbnails: { default: { url: 'thumb.jpg' } },
              },
              contentDetails: { duration: 'PT3M32S' },
            },
          ],
        }),
      });
      const svc = makeService();
      const details = await svc.getVideoDetails('dQw4w9WgXcQ');
      expect(details).toMatchObject({
        videoId: 'dQw4w9WgXcQ',
        title: 'Never Gonna Give You Up',
        channelTitle: 'Rick Astley',
        thumbnailUrl: 'thumb.jpg',
        durationSeconds: 212,
      });
      const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
      expect(url).toContain('/videos');
    });

    it('returns null when the video does not exist', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [] }),
      });
      const svc = makeService();
      await expect(svc.getVideoDetails('dQw4w9WgXcQ')).resolves.toBeNull();
    });

    it('throws a friendly error on provider failure', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('boom'));
      const svc = makeService();
      await expect(svc.getVideoDetails('dQw4w9WgXcQ')).rejects.toMatchObject({
        errorCode: ErrorCodes.YOUTUBE_API_ERROR,
      });
    });
  });
});
