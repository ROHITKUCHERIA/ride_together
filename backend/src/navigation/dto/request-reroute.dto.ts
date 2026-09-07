import { Type } from 'class-transformer';
import {
  IsObject,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { RouteCoordinateDto } from './calculate-route.dto';

export class RequestRerouteDto {
  @IsObject({ message: 'origin is required' })
  @ValidateNested()
  @Type(() => RouteCoordinateDto)
  origin!: RouteCoordinateDto;

  @IsObject({ message: 'destination is required' })
  @ValidateNested()
  @Type(() => RouteCoordinateDto)
  destination!: RouteCoordinateDto;

  /** Client-generated idempotency key. When several reroutes race, only the
   *  newest requestId wins; stale responses are discarded client-side. */
  @IsString()
  @IsUUID()
  @MaxLength(64)
  requestId!: string;
}
