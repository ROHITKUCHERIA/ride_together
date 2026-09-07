import { Injectable } from '@nestjs/common';
import { RoutingService } from './routing.service';
import { GeocodingService } from './geocoding.service';
import { CalculateRouteDto } from './dto/calculate-route.dto';
import { GeocodeQuery } from './dto/geocode-query.dto';
import {
  GeocodeResult,
  NormalizedRoute,
} from './interfaces/routing-response.interface';

/**
 * Thin orchestration over the routing + geocoding providers. Keeps the
 * controller free of provider concerns.
 */
@Injectable()
export class NavigationService {
  constructor(
    private readonly routing: RoutingService,
    private readonly geocoding: GeocodingService,
  ) {}

  async calculateRoute(dto: CalculateRouteDto): Promise<NormalizedRoute> {
    return this.routing.calculateRoute(dto.origin, dto.destination);
  }

  async searchPlaces(query: GeocodeQuery): Promise<GeocodeResult[]> {
    return this.geocoding.search(query.q, query.limit);
  }
}
