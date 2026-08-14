import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Create-a-playlist payload. `name` is required and trimmed; `tripId` is
 * optional (null = personal playlist); `isPublic` defaults to true.
 */
export class CreatePlaylistDto {
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(1, { message: 'name must not be empty' })
  @MaxLength(80, { message: 'name must be at most 80 characters' })
  name!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MaxLength(500, { message: 'description must be at most 500 characters' })
  description?: string;

  @IsOptional()
  @IsUUID('4')
  tripId?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}
