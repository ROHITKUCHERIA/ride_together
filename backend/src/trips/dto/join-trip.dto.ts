import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class JoinTripDto {
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Length(6, 16, { message: 'inviteCode is invalid' })
  inviteCode!: string;
}
