import { Test, TestingModule } from '@nestjs/testing';
import { NavigationService } from './navigation.service';
import { RoutingService } from './routing.service';
import { GeocodingService } from './geocoding.service';
import { CalculateRouteDto } from './dto/calculate-route.dto';
import { GeocodeQuery } from './dto/geocode-query.dto';
import type { RouteCoordinate } from './interfaces/routing-response.interface';

const ORIGIN: RouteCoordinate = { latitude: 17.385, longitude: 78.4867 };
const DESTINATION: RouteCoordinate = { latitude: 17.4065, longitude: 78.4772 };

describe('NavigationService', () => {
  let service: NavigationService;
  let routing: { calculateRoute: jest.Mock };
  let geocoding: { search: jest.Mock };

  beforeEach(async () => {
    routing = { calculateRoute: jest.fn() };
    geocoding = { search: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NavigationService,
        { provide: RoutingService, useValue: routing },
        { provide: GeocodingService, useValue: geocoding },
      ],
    }).compile();

    service = module.get<NavigationService>(NavigationService);
  });

  it('delegates a valid route request to the routing engine', async () => {
    routing.calculateRoute.mockResolvedValue({
      distanceMeters: 4200,
      durationSeconds: 900,
      coordinates: [],
    });
    const dto: CalculateRouteDto = { origin: ORIGIN, destination: DESTINATION };

    const result = await service.calculateRoute(dto);

    expect(routing.calculateRoute).toHaveBeenCalledWith(ORIGIN, DESTINATION);
    expect(result).toMatchObject({
      distanceMeters: 4200,
      durationSeconds: 900,
    });
  });

  it('delegates a valid geocode query to the geocoder', async () => {
    geocoding.search.mockResolvedValue([
      { name: 'Hyderabad', latitude: 17.385, longitude: 78.4867 },
    ]);
    const query: GeocodeQuery = { q: 'Hyderabad', limit: 5 };

    const result = await service.searchPlaces(query);

    expect(geocoding.search).toHaveBeenCalledWith('Hyderabad', 5);
    expect(result).toHaveLength(1);
  });

  it('propagates routing provider failures', async () => {
    routing.calculateRoute.mockRejectedValue(new Error('provider down'));
    const dto: CalculateRouteDto = { origin: ORIGIN, destination: DESTINATION };

    await expect(service.calculateRoute(dto)).rejects.toThrow('provider down');
  });

  it('propagates no-route results', async () => {
    routing.calculateRoute.mockResolvedValue(null);
    const dto: CalculateRouteDto = { origin: ORIGIN, destination: DESTINATION };

    expect(await service.calculateRoute(dto)).toBeNull();
  });
});
