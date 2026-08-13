import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** 11-char YouTube video id (charset the provider actually uses). */
const YOUTUBE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Add-a-song payload. Only the video id is accepted; the backend derives the
 * title/channel/duration from the official YouTube Data API, so client
 * metadata is never trusted.
 */
export class AddSongDto {
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(11, { message: 'youtubeVideoId must be 11 characters' })
  @MaxLength(11, { message: 'youtubeVideoId must be 11 characters' })
  @Matches(YOUTUBE_VIDEO_ID_RE, {
    message: 'youtubeVideoId is not a valid YouTube video id',
  })
  youtubeVideoId!: string;
}