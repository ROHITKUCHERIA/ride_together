import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { SharedNavigationStatus } from '../interfaces/navigation-session.interface';

const VALID_STATUSES: SharedNavigationStatus[] = [
  'idle',
  'navigating',
  'off_route',
  'rerouting',
  'arrived',
  'gps_lost',
  'offline',
];

export class UpdateNavigationStatusDto {
  @IsIn(VALID_STATUSES, {
    message: `status must be one of: ${VALID_STATUSES.join(', ')}`,
  })
  status!: SharedNavigationStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2_000_000)
  distanceRemainingMeters?: number;

  /** Projected arrival (epoch ms). Riders report meaningful transitions only —
   *  the server never derivates ETA from raw GPS ticks. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  eta?: number;
}
