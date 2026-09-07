import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type { SharedNavigationMode } from '../interfaces/navigation-session.interface';

export class StartNavigationSessionDto {
  /** group = ride to the trip's shared destination; personal = a private trip.
   *  Personal sessions are stored only for the rider's own reconnect restore. */
  @IsOptional()
  @IsIn(['group', 'personal'], {
    message: 'mode must be "group" or "personal"',
  })
  mode: SharedNavigationMode = 'group';

  // ---- personal sessions only -------------------------------------------------
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  destinationLatitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  destinationLongitude?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  destinationName?: string;
}
