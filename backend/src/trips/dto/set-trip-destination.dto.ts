import { Type } from 'class-transformer';
import {
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SetTripDestinationDto {
  @Type(() => Number)
  @IsNumber({}, { message: 'latitude must be a number' })
  @IsLatitude({ message: 'latitude must be between -90 and 90' })
  latitude!: number;

  @Type(() => Number)
  @IsNumber({}, { message: 'longitude must be a number' })
  @IsLongitude({ message: 'longitude must be between -180 and 180' })
  longitude!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'name must be at most 200 characters long' })
  name?: string;
}
