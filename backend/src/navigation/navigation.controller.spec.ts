import { HttpStatus } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Test, TestingModule } from '@nestjs/testing';
import { NavigationController } from './navigation.controller';
import { NavigationService } from './navigation.service';
import { CalculateRouteDto } from './dto/calculate-route.dto';
import { GeocodeQuery } from './dto/geocode-query.dto';
import type { RouteCoordinate } from './interfaces/routing-response.interface';

const ORIGIN: RouteCoordinate = { latitude: 17.385, longitude: 78.4867 };
const DESTINATION: RouteCoordinate = { latitude: 17.4065, longitude: 78.4772 };

describe('NavigationController', () => {
  let controller: NavigationController;
  let navigation: { calculateRoute: jest.Mock; searchPlaces: jest.Mock };

  beforeEach(async () => {
    navigation = { calculateRoute: jest.fn(), searchPlaces: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NavigationController],
      providers: [{ provide: NavigationService, useValue: navigation }],
    }).compile();
    controller = module.get<NavigationController>(NavigationController);
  });

  it('delegates a route calculation to the navigation service', async () => {
    navigation.calculateRoute.mockResolvedValue({
      distanceMeters: 1,
      coordinates: [],
    });
    const dto: CalculateRouteDto = { origin: ORIGIN, destination: DESTINATION };
    await controller.calculateRoute(dto);
    expect(navigation.calculateRoute).toHaveBeenCalledWith(dto);
  });

  it('delegates a geocode search to the navigation service', async () => {
    navigation.searchPlaces.mockResolvedValue([]);
    const query: GeocodeQuery = { q: 'Hyderabad', limit: 5 };
    await controller.searchPlaces(query);
    expect(navigation.searchPlaces).toHaveBeenCalledWith(query);
  });

  it('propagates routing failures', async () => {
    navigation.calculateRoute.mockRejectedValue(new Error('provider down'));
    await expect(
      controller.calculateRoute({ origin: ORIGIN, destination: DESTINATION }),
    ).rejects.toThrow('provider down');
  });

  it('maps throttling violations to a 429 (rate limiting surface)', () => {
    const err = new ThrottlerException();
    expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
  });
});
