import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ApiException } from '../common/filters/all-exceptions.filter';
import { ErrorCodes } from '../common/constants/error-codes';
import { AppConfig } from '../config/app.config';
import { RoutingService } from './routing.service';
import type { RouteCoordinate } from './interfaces/routing-response.interface';
import { ROUTE_CACHE } from '../cache/tokens';
import { InMemoryRouteCache } from '../cache/in-memory-route-cache';

const ORIGIN: RouteCoordinate = { latitude: 17.385, longitude: 78.4867 };
const DESTINATION: RouteCoordinate = { latitude: 17.4065, longitude: 78.4772 };

function osmOk(): Response {
  return new Response(
    JSON.stringify({
      code: 'Ok',
      routes: [
        {
          distance: 4200,
          duration: 900,
          geometry: {
            coordinates: [
              [78.4867, 17.385],
              [78.48, 17.395],
              [78.4772, 17.4065],
            ],
          },
        },
      ],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

type Json = Record<string, any>;

/** The step-bearing OSRM fixture as a plain object (tests mutate a clone). */
function stepsRouteJson(): Json {
  return {
    code: 'Ok',
    routes: [
      {
        distance: 4200,
        duration: 900,
        geometry: {
          coordinates: [
            [78.4867, 17.385],
            [78.48, 17.3959],
            [78.4772, 17.4065],
          ],
        },
        legs: [
          {
            steps: [
              {
                distance: 120,
                duration: 20,
                name: 'MG Road',
                ref: 'NH 63',
                maneuver: {
                  type: 'depart',
                  modifier: 'straight',
                  location: [78.4867, 17.385],
                  instruction: 'Head east on MG Road',
                },
              },
              {
                distance: 250,
                duration: 30,
                name: '',
                ref: 'NH 44',
                maneuver: {
                  type: 'turn',
                  modifier: 'right',
                  location: [78.48, 17.3959],
                  instruction: 'Turn right onto NH 44',
                },
              },
              {
                distance: 12,
                duration: 5,
                name: 'NH 44',
                maneuver: {
                  type: 'arrive',
                  location: [78.4772, 17.4065],
                  instruction: 'Arrive at your destination',
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

function stepsRoute(): Response {
  return new Response(JSON.stringify(stepsRouteJson()), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function respond(json: Json): Response {
  return new Response(JSON.stringify(json), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('RoutingService', () => {
  let service: RoutingService;
  let config: {
    routingProvider: string;
    routingApiUrl: string;
    routingTimeoutMs: number;
    navigationRouteCacheTtlSeconds: number;
  };
  const originalFetch = globalThis.fetch;

  async function build() {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoutingService,
        { provide: AppConfig, useValue: config },
        { provide: ROUTE_CACHE, useValue: new InMemoryRouteCache() },
      ],
    }).compile();
    service = module.get<RoutingService>(RoutingService);
  }

  beforeEach(() => {
    config = {
      routingProvider: 'osrm',
      routingApiUrl: 'https://router.test',
      routingTimeoutMs: 1000,
      navigationRouteCacheTtlSeconds: 300,
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('normalizes a valid OSRM response', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(osmOk());
    await build();

    const route = await service.calculateRoute(ORIGIN, DESTINATION);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        '/route/v1/driving/78.4867,17.385;78.4772,17.4065',
      ),
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(route).toMatchObject({
      distanceMeters: 4200,
      durationSeconds: 900,
      instructions: [],
    });
    expect(route.coordinates).toHaveLength(3);
    expect(route.coordinates).toEqual([
      { latitude: 17.385, longitude: 78.4867 },
      { latitude: 17.395, longitude: 78.48 },
      { latitude: 17.4065, longitude: 78.4772 },
    ]);
  });

  it('requests turn-by-turn steps from OSRM', async () => {
    const fetchMock = jest.fn().mockResolvedValue(osmOk());
    globalThis.fetch = fetchMock;
    await build();

    await service.calculateRoute(ORIGIN, DESTINATION);

    expect(String(fetchMock.mock.calls[0][0])).toContain('steps=true');
  });

  it('extracts normalized turn-by-turn instructions from OSRM steps', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(stepsRoute());
    await build();

    const route = await service.calculateRoute(ORIGIN, DESTINATION);

    expect(route.instructions).toHaveLength(3);
    expect(route.instructions![0]).toMatchObject({
      id: 'step-0',
      type: 'depart',
      modifier: 'straight',
      text: 'Head east on MG Road',
      distanceMeters: 120,
      durationSeconds: 20,
      latitude: 17.385,
      longitude: 78.4867,
      roadName: 'MG Road',
    });
    expect(route.instructions![1]).toMatchObject({
      id: 'step-1',
      type: 'turn',
      modifier: 'right',
      text: 'Turn right onto NH 44',
      distanceMeters: 250,
      durationSeconds: 30,
      latitude: 17.3959,
      longitude: 78.48,
      roadName: 'NH 44',
    });
    expect(route.instructions![2]).toMatchObject({ type: 'arrive' });
  });

  it('builds a readable turn text when OSRM omits the instruction string', async () => {
    const json: Json = stepsRouteJson();
    delete json.routes[0].legs[0].steps[1].maneuver.instruction;
    globalThis.fetch = jest.fn().mockResolvedValue(respond(json));
    await build();

    const route = await service.calculateRoute(ORIGIN, DESTINATION);

    expect(route.instructions![1].text).toBe('Turn right onto NH 44');
  });

  it('normalizes a roundabout with an exit number', async () => {
    const json: Json = stepsRouteJson();
    json.routes[0].legs[0].steps[1] = {
      distance: 200,
      duration: 25,
      name: 'Necklace Rd',
      maneuver: {
        type: 'roundabout',
        location: [78.48, 17.3959],
        exit: 2,
        instruction: 'At the roundabout, take exit 2 onto Necklace Rd',
      },
    };
    globalThis.fetch = jest.fn().mockResolvedValue(respond(json));
    await build();

    const route = await service.calculateRoute(ORIGIN, DESTINATION);

    const roundabout = route.instructions?.find((i) => i.type === 'roundabout');
    expect(roundabout).toBeDefined();
    expect(roundabout!.exitNumber).toBe(2);
  });

  it('does not invent an exit number when OSRM omits it', async () => {
    const json: Json = stepsRouteJson();
    json.routes[0].legs[0].steps[1] = {
      distance: 200,
      duration: 25,
      name: 'Necklace Rd',
      maneuver: { type: 'roundabout', location: [78.48, 17.3959] },
    };
    globalThis.fetch = jest.fn().mockResolvedValue(respond(json));
    await build();

    const route = await service.calculateRoute(ORIGIN, DESTINATION);

    const roundabout = route.instructions?.find((i) => i.type === 'roundabout');
    expect(roundabout).toBeDefined();
    expect(roundabout!.exitNumber).toBeUndefined();
    expect(roundabout!.text).toContain('Enter the roundabout');
  });

  it('handles a missing road name', async () => {
    const json: Json = stepsRouteJson();
    json.routes[0].legs[0].steps[1] = {
      distance: 250,
      duration: 30,
      name: '',
      ref: '',
      maneuver: { type: 'turn', modifier: 'left', location: [78.48, 17.3959] },
    };
    globalThis.fetch = jest.fn().mockResolvedValue(respond(json));
    await build();

    const route = await service.calculateRoute(ORIGIN, DESTINATION);

    const turn = route.instructions![1];
    expect(turn.text).toBe('Turn left');
    expect(turn.roadName).toBeUndefined();
  });

  it('handles a missing modifier', async () => {
    const json: Json = stepsRouteJson();
    json.routes[0].legs[0].steps[1] = {
      distance: 250,
      duration: 30,
      name: '',
      ref: 'NH 44',
      maneuver: { type: 'turn', location: [78.48, 17.3959] },
    };
    globalThis.fetch = jest.fn().mockResolvedValue(respond(json));
    await build();

    const route = await service.calculateRoute(ORIGIN, DESTINATION);

    const turn = route.instructions![1];
    expect(turn.text).toBe('Turn onto NH 44');
    expect(turn.modifier).toBeUndefined();
  });

  it('maps an unknown maneuver type to unknown', async () => {
    const json: Json = stepsRouteJson();
    json.routes[0].legs[0].steps[1] = {
      distance: 250,
      duration: 30,
      name: 'Mystery Rd',
      maneuver: { type: 'quickhop', location: [78.48, 17.3959] },
    };
    globalThis.fetch = jest.fn().mockResolvedValue(respond(json));
    await build();

    const route = await service.calculateRoute(ORIGIN, DESTINATION);

    expect(route.instructions![1]).toMatchObject({
      type: 'unknown',
    });
    expect(route.instructions![1].text).toContain('Mystery Rd');
  });

  it('skips steps without a valid location on a malformed response', async () => {
    const json: Json = stepsRouteJson();
    delete json.routes[0].legs[0].steps[1].maneuver.location;
    globalThis.fetch = jest.fn().mockResolvedValue(respond(json));
    await build();

    const route = await service.calculateRoute(ORIGIN, DESTINATION);

    expect(route.instructions).toHaveLength(2);
    expect(route.instructions!.some((i) => i.id === 'step-1')).toBe(false);
  });

  it('returns empty instructions when the provider sends no steps', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(osmOk());
    await build();

    const route = await service.calculateRoute(ORIGIN, DESTINATION);

    expect(route.instructions).toEqual([]);
  });

  it('serves a cached route for a repeat origin/destination pair', async () => {
    const fetchMock = jest.fn().mockResolvedValue(osmOk());
    globalThis.fetch = fetchMock;
    await build();

    await service.calculateRoute(ORIGIN, DESTINATION);
    await service.calculateRoute(ORIGIN, DESTINATION);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refetches once the cache TTL expires', async () => {
    config.navigationRouteCacheTtlSeconds = 0;
    const fetchMock = jest
      .fn()
      .mockImplementation(() => Promise.resolve(osmOk()));
    globalThis.fetch = fetchMock;
    await build();

    await service.calculateRoute(ORIGIN, DESTINATION);
    await service.calculateRoute(ORIGIN, DESTINATION);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws ROUTE_NOT_FOUND when the router returns a non-Ok code', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 'NoRoute', routes: [] }), {
        status: 200,
      }),
    );
    await build();

    await expect(
      service.calculateRoute(ORIGIN, DESTINATION),
    ).rejects.toMatchObject<ApiException>({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      errorCode: ErrorCodes.ROUTE_NOT_FOUND,
    });
  });

  it('throws ROUTE_NOT_FOUND when no geometry is returned', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 'Ok', routes: [] }), {
        status: 200,
      }),
    );
    await build();

    await expect(
      service.calculateRoute(ORIGIN, DESTINATION),
    ).rejects.toMatchObject({
      errorCode: ErrorCodes.ROUTE_NOT_FOUND,
    });
  });

  it('throws ROUTING_UNAVAILABLE when the provider errors', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await build();

    await expect(
      service.calculateRoute(ORIGIN, DESTINATION),
    ).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      errorCode: ErrorCodes.ROUTING_UNAVAILABLE,
    });
  });

  it('throws ROUTING_UNAVAILABLE on non-2xx status', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(new Response('upstream down', { status: 502 }));
    await build();

    await expect(
      service.calculateRoute(ORIGIN, DESTINATION),
    ).rejects.toMatchObject({
      errorCode: ErrorCodes.ROUTING_UNAVAILABLE,
    });
  });

  it('throws ROUTING_PROVIDER_UNSUPPORTED for an unknown provider', async () => {
    config = { ...config, routingProvider: 'graphhopper' };
    await build();

    await expect(
      service.calculateRoute(ORIGIN, DESTINATION),
    ).rejects.toMatchObject({
      errorCode: ErrorCodes.ROUTING_PROVIDER_UNSUPPORTED,
    });
  });
});
