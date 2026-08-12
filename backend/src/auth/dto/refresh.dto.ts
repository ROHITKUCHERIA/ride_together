import { IsString, MinLength } from 'class-validator';

export class RefreshDto {
  @IsString({ message: 'refreshToken must be a string' })
  @MinLength(20, { message: 'refreshToken is invalid' })
  refreshToken!: string;
}
