import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SearchMusicQuery {
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MaxLength(200, { message: 'q must be at most 200 characters long' })
  q!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  pageToken?: string;
}
