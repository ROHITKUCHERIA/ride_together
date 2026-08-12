import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(2, { message: 'name must be at least 2 characters long' })
  @MaxLength(100, { message: 'name must be at most 100 characters long' })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'avatarUrl must be at most 500 characters long' })
  @IsUrl(
    { require_protocol: true },
    { message: 'avatarUrl must be a valid URL' },
  )
  avatarUrl?: string;
}
