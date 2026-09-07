import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CalculateRouteDto,
  RouteCoordinateDto,
} from './dto/calculate-route.dto';
import { GeocodeQuery } from './dto/geocode-query.dto';

describe('CalculateRouteDto validation', () => {
  it('accepts a valid route payload', async () => {
    const dto = plainToInstance(CalculateRouteDto, {
      origin: { latitude: 17.385, longitude: 78.4867 },
      destination: { latitude: 17.4065, longitude: 78.4772 },
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects an invalid origin latitude', async () => {
    const dto = plainToInstance(CalculateRouteDto, {
      origin: { latitude: 91, longitude: 78.4867 },
      destination: { latitude: 17.4065, longitude: 78.4772 },
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('origin');
  });

  it('rejects a missing origin', async () => {
    const dto = plainToInstance(CalculateRouteDto, {
      destination: { latitude: 17.4065, longitude: 78.4772 },
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects an out-of-range destination longitude', async () => {
    const dto = plainToInstance(CalculateRouteDto, {
      origin: { latitude: 17.385, longitude: 78.4867 },
      destination: { latitude: 17.4065, longitude: 181 },
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a non-numeric latitude', async () => {
    const dto = plainToInstance(RouteCoordinateDto, {
      latitude: 'north',
      longitude: 78.4867,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('GeocodeQuery validation', () => {
  it('accepts a valid query', async () => {
    const dto = plainToInstance(GeocodeQuery, { q: 'Hyderabad', limit: 5 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a missing query', async () => {
    const dto = plainToInstance(GeocodeQuery, {});
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a limit outside the allowed range', async () => {
    const dto = plainToInstance(GeocodeQuery, { q: 'Hyderabad', limit: 100 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
