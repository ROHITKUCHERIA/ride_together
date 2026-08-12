import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateTripDto {
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(2, { message: 'name must be at least 2 characters long' })
  @MaxLength(120, { message: 'name must be at most 120 characters long' })
  name!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MaxLength(2000, {
    message: 'description must be at most 2000 characters long',
  })
  description?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MaxLength(200)
  startLocation?: string;

  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(2, { message: 'destination must be at least 2 characters long' })
  @MaxLength(200)
  destination!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'startLatitude must be a number' })
  @IsLatitude({ message: 'startLatitude must be between -90 and 90' })
  startLatitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'startLongitude must be a number' })
  @IsLongitude({ message: 'startLongitude must be between -180 and 180' })
  startLongitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'destinationLatitude must be a number' })
  @IsLatitude({ message: 'destinationLatitude must be between -90 and 90' })
  destinationLatitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'destinationLongitude must be a number' })
  @IsLongitude({ message: 'destinationLongitude must be between -180 and 180' })
  destinationLongitude?: number;

  @IsDateString({}, { message: 'startDate must be a valid ISO 8601 date' })
  startDate!: string;

  @IsDateString({}, { message: 'endDate must be a valid ISO 8601 date' })
  endDate!: string;
}
