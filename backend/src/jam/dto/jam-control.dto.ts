import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

/**
 * Authoritative playback mutations issued by the Jam HOST. The server is the
 * only place that decides the resulting Jam state; the client merely proposes
 * an action (plus the Host's current position as the seed for the next state).
 */
export class JamControlDto {
  @IsIn(['play', 'pause', 'seek', 'song_changed', 'next'])
  action!: 'play' | 'pause' | 'seek' | 'song_changed' | 'next';

  /** Required for `song_changed` — must already be in the trip library. */
  @IsOptional()
  @IsUUID()
  songId?: string;

  /** Host's current position in seconds (seed for play/pause/seek). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  position?: number;

  /** For `song_changed`: whether the new song should start playing. */
  @IsOptional()
  @IsBoolean()
  isPlaying?: boolean;
}
