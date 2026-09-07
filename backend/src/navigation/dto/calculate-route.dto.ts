import { Type } from 'class-transformer';
import {
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsObject,
  ValidateNested,
} from 'class-validator';

export class RouteCoordinateDto {
  @Type(() => Number)
  @IsNumber({}, { message: 'latitude must be a number' })
  @IsLatitude({ message: 'latitude must be between -90 and 90' })
  latitude!: number;

  @Type(() => Number)
  @IsNumber({}, { message: 'longitude must be a number' })
  @IsLongitude({ message: 'longitude must be between -180 and 180' })
  longitude!: number;
}

export class CalculateRouteDto {
  @IsObject({ message: 'origin is required' })
  @ValidateNested()
  @Type(() => RouteCoordinateDto)
  origin!: RouteCoordinateDto;

  @IsObject({ message: 'destination is required' })
  @ValidateNested()
  @Type(() => RouteCoordinateDto)
  destination!: RouteCoordinateDto;
}
