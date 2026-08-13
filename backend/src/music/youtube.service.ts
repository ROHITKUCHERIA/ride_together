import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../config/app.config';
import { ApiException } from '../common/filters/all-exceptions.filter';
import { ErrorCodes } from '../common/constants/error-codes';

/** A single YouTube search result, mapped to the shape the UI consumes. */
export interface YouTubeVideoResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string | null;
  publishedAt: string;
}

export interface YouTubeSearchPage {
  items: YouTubeVideoResult[];
  nextPageToken: string | null;
  /** True when the page was served from the in-memory cache. */
  cached: boolean;
}

export interface YouTubeVideoDetails {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
}

interface CacheEntry {
  at: number;
  page: Omit<YouTubeSearchPage, 'cached'>;
}

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

/** Accepts the exact videoId charset YouTube uses (11 chars, [A-Za-z0-9_-]). */
const YOUTUBE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Official YouTube Data API v3 client.
 *
 * - The API key lives only here (server-side), never in the frontend.
 * - Search results are cached per normalized query so repeated/near-duplicate
 *   searches do not burn YouTube quota.
 * - All provider errors are mapped to a single friendly error code so raw
 *   provider internals never leak to the client.
 */
@Injectable()
export class YouTubeService {
  private readonly logger = new Logger(YouTubeService.name);
  private readonly searchCache = new Map<string, CacheEntry>();

  constructor(private readonly config: AppConfig) {}

  /** Normalizes a query so case/whitespace differences share one cache key. */
  normalizeQuery(raw: string): string {
    return raw.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  /** True when the string looks like a valid YouTube video id. */
  isValidVideoId(videoId: unknown): videoId is string {
    return typeof videoId === 'string' && YOUTUBE_VIDEO_ID_RE.test(videoId);
  }

  /**
   * Searches YouTube for videos. Empty/normalized-empty queries are rejected
   * before any provider call. Results are cached per (normalized query, page).
   */
  async searchVideos(
    rawQuery: string,
    opts: { pageToken?: string } = {},
    now = Date.now(),
  ): Promise<YouTubeSearchPage> {
    const query = this.normalizeQuery(rawQuery);
    if (!query) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'A search query is required.',
        ErrorCodes.MUSIC_QUERY_REQUIRED,
      );
    }
    if (query.length > this.config.youtubeSearchMaxQueryLength) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        `Search query must be at most ${this.config.youtubeSearchMaxQueryLength} characters.`,
        ErrorCodes.VALIDATION_ERROR,
      );
    }

    const cacheKey = `${query}|${opts.pageToken ?? ''}`;
    const cached = this.searchCache.get(cacheKey);
    if (cached && now - cached.at < this.config.youtubeSearchCacheTtlMs) {
      return { ...cached.page, cached: true };
    }

    const page = await this.callSearch(query, opts.pageToken);
    this.searchCache.set(cacheKey, { at: now, page });
    this.pruneCache(now);
    return { ...page, cached: false };
  }

  /**
   * Resolves a single video's metadata via `videos.list`. Returns null when the
   * video does not exist; throws a friendly error when the provider itself
   * fails (quota / network). The DB Song row then acts as the long-lived cache.
   */
  async getVideoDetails(videoId: string): Promise<YouTubeVideoDetails | null> {
    if (!this.isValidVideoId(videoId)) return null;
    this.requireKey();

    const url = this.buildUrl('/videos', {
      part: 'snippet,contentDetails',
      id: videoId,
    });
    const json = await this.fetchJson(url, 'videos.list');
    const item = json?.items?.[0];
    if (!item) return null;

    return {
      videoId,
      title: String(item?.snippet?.title ?? ''),
      channelTitle: String(item?.snippet?.channelTitle ?? ''),
      thumbnailUrl: pickThumbnail(item?.snippet?.thumbnails),
      durationSeconds: parseIsoDuration(item?.contentDetails?.duration),
    };
  }

  // ------------------------------------------------------------------ internals

  private requireKey(): string {
    const key = this.config.youtubeApiKey;
    if (!key) {
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'YouTube is not configured. Please set YOUTUBE_API_KEY.',
        ErrorCodes.YOUTUBE_API_KEY_MISSING,
      );
    }
    return key;
  }

  private buildUrl(endpoint: string, params: Record<string, string>): string {
    const search = new URLSearchParams({ ...params, key: this.requireKey() });
    return `${YOUTUBE_API_BASE}${endpoint}?${search.toString()}`;
  }

  private async callSearch(
    query: string,
    pageToken: string | undefined,
  ): Promise<Omit<YouTubeSearchPage, 'cached'>> {
    const url = this.buildUrl('/search', {
      part: 'snippet',
      type: 'video',
      videoEmbeddable: 'true',
      videoSyndicated: 'true',
      q: query,
      maxResults: String(this.config.youtubeSearchMaxResults),
      ...(pageToken ? { pageToken } : {}),
      // Small deterministic tiebreaker so the same query doesn't drift pages.
      order: 'relevance',
    });
    const json = await this.fetchJson(url, 'search.list');
    const rawItems = (json?.items as Array<any> | undefined) ?? [];

    const items: YouTubeVideoResult[] = rawItems
      .filter((it: any) => it?.id?.videoId && it?.snippet)
      .map((it: any) => ({
        videoId: String(it.id.videoId),
        title: String(it.snippet.title ?? ''),
        channelTitle: String(it.snippet.channelTitle ?? ''),
        thumbnailUrl: pickThumbnail(it.snippet.thumbnails),
        publishedAt: String(it.snippet.publishedAt ?? ''),
      }));

    const nextPageToken = json?.nextPageToken;
    return {
      items,
      nextPageToken:
        typeof nextPageToken === 'string' && nextPageToken ? nextPageToken : null,
    };
  }

  /** Performs the provider request and normalizes failures. */
  private async fetchJson(
    url: string,
    operation: string,
  ): Promise<Record<string, unknown> | null> {
    let res: Response;
    try {
      res = await fetch(url);
    } catch {
      throw this.providerError(operation, 'YouTube is unreachable right now.');
    }

    let json: any = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }

    if (!res.ok) {
      const reason = json?.error?.errors?.[0]?.reason;
      const message = json?.error?.message;
      this.logger.warn(
        `YouTube ${operation} failed: ${res.status} ${reason ?? ''} ${message ?? ''}`,
      );
      if (reason === 'quotaExceeded') {
        throw new ApiException(
          HttpStatus.SERVICE_UNAVAILABLE,
          'The music search is temporarily unavailable (YouTube quota). Try again later.',
          ErrorCodes.YOUTUBE_API_ERROR,
        );
      }
      throw this.providerError(operation, 'YouTube could not complete that request.');
    }

    return json;
  }

  private providerError(operation: string, message: string): ApiException {
    this.logger.warn(`YouTube ${operation} failed: ${message}`);
    return new ApiException(
      HttpStatus.SERVICE_UNAVAILABLE,
      'The music search is unavailable right now. Please try again.',
      ErrorCodes.YOUTUBE_API_ERROR,
    );
  }

  private pruneCache(now: number): void {
    const ttl = this.config.youtubeSearchCacheTtlMs;
    for (const [key, entry] of this.searchCache) {
      if (now - entry.at > ttl) this.searchCache.delete(key);
    }
  }
}

function pickThumbnail(thumbnails: any): string | null {
  if (!thumbnails) return null;
  const candidate = thumbnails.medium ?? thumbnails.default ?? thumbnails.high;
  return typeof candidate?.url === 'string' ? candidate.url : null;
}

/** Parses ISO-8601 durations ("PT4M13S") into whole seconds. */
export function parseIsoDuration(iso: unknown): number | null {
  if (typeof iso !== 'string') return null;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match) return null;
  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = match[2] ? Number(match[2]) : 0;
  const seconds = match[3] ? Number(match[3]) : 0;
  return hours * 3600 + minutes * 60 + seconds;
}
