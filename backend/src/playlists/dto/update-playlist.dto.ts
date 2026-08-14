import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Update-a-playlist payload. All fields optional; only the owner may call it.
 * The trip association is intentionally not editable here.
 */
export class UpdatePlaylistDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(1, { message: 'name must not be empty' })
  @MaxLength(80, { message: 'name must be at most 80 characters' })
  name?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MaxLength(500, { message: 'description must be at most 500 characters' })
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}
