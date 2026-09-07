import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { TripNavigationService } from './trip-navigation.service';
import { TripAccessService } from '../common/services/trip-access.service';
import { AppConfig } from '../config/app.config';
import { RoutingService } from './routing.service';
import { RerouteCooldownService } from '../cache/reroute-cooldown.service';
import { NavigationSessionsService } from '../realtime/navigation-sessions.service';
import { ApiException } from '../common/filters/all-exceptions.filter';
import { ErrorCodes } from '../common/constants/error-codes';
import type { NormalizedRoute } from './interfaces/routing-response.interface';

const ROUTE_FIXTURE: NormalizedRoute = {
  coordinates: [
    { latitude: 17.385, longitude: 78.4867 },
    { latitude: 17.4065, longitude: 78.4772 },
  ],
  distanceMeters: 4200,
  durationSeconds: 900,
};

describe('TripNavigationService', () => {
  let service: TripNavigationService;
  let sessions: Record<string, jest.Mock>;
  let routing: { calculateRoute: jest.Mock };
  let cooldown: { tryAcquire: jest.Mock; release: jest.Mock };
  let access: { requireMember: jest.Mock };

  beforeEach(async () => {
    sessions = {
      getGroupSnapshot: jest.fn(),
      startSession: jest.fn(),
      updateSession: jest.fn(),
      stopSession: jest.fn(),
    };
    routing = { calculateRoute: jest.fn() };
    cooldown = {
      tryAcquire: jest.fn().mockResolvedValue(true),
      release: jest.fn(),
    };
    access = { requireMember: jest.fn().mockResolvedValue({ trip: {} }) };
    const config = { navigationRerouteCooldownSeconds: 15 };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TripNavigationService,
        { provide: NavigationSessionsService, useValue: sessions },
        { provide: RoutingService, useValue: routing },
        { provide: RerouteCooldownService, useValue: cooldown },
        { provide: AppConfig, useValue: config },
        { provide: TripAccessService, useValue: access },
      ],
    }).compile();

    service = module.get<TripNavigationService>(TripNavigationService);
  });

  describe('tryReroute', () => {
    it('acquires the cooldown, computes the route, and returns the requestId', async () => {
      routing.calculateRoute.mockResolvedValue(ROUTE_FIXTURE);

      const result = await service.tryReroute('trip1', 'user1', {
        origin: ROUTE_FIXTURE.coordinates[0],
        destination: ROUTE_FIXTURE.coordinates[1],
        requestId: 'req-123',
      });

      expect(access.requireMember).toHaveBeenCalledWith('trip1', 'user1');
      expect(cooldown.tryAcquire).toHaveBeenCalledWith(
        'trip1',
        'user1',
        'req-123',
        15,
      );
      expect(result).toEqual({ requestId: 'req-123', route: ROUTE_FIXTURE });
      // Lock is NOT released on a successful reroute.
      expect(cooldown.release).not.toHaveBeenCalled();
    });

    it('rejects with the cooldown error when a reroute is already in progress', async () => {
      cooldown.tryAcquire.mockResolvedValue(false);

      await expect(
        service.tryReroute('trip1', 'user1', {
          origin: ROUTE_FIXTURE.coordinates[0],
          destination: ROUTE_FIXTURE.coordinates[1],
          requestId: 'req-123',
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
        errorCode: ErrorCodes.REROUTE_COOLDOWN,
      });

      expect(routing.calculateRoute).not.toHaveBeenCalled();
    });

    it('releases the cooldown lock when the route calculation fails', async () => {
      routing.calculateRoute.mockRejectedValue(
        new ApiException(
          HttpStatus.SERVICE_UNAVAILABLE,
          'OSRM unavailable',
          ErrorCodes.ROUTE_NOT_FOUND,
        ),
      );

      await expect(
        service.tryReroute('trip1', 'user1', {
          origin: ROUTE_FIXTURE.coordinates[0],
          destination: ROUTE_FIXTURE.coordinates[1],
          requestId: 'req-123',
        }),
      ).rejects.toMatchObject({ status: HttpStatus.SERVICE_UNAVAILABLE });

      expect(cooldown.release).toHaveBeenCalledWith(
        'trip1',
        'user1',
        'req-123',
      );
    });
  });

  describe('session delegation', () => {
    it('delegates snapshot, start, update and stop to the sessions service', async () => {
      sessions.getGroupSnapshot.mockResolvedValue('snapshot');
      sessions.startSession.mockResolvedValue('started');
      sessions.updateSession.mockResolvedValue('updated');
      sessions.stopSession.mockResolvedValue(undefined);

      await expect(service.getGroupSnapshot('trip1', 'user1')).resolves.toBe(
        'snapshot',
      );
      await expect(
        service.startSession('trip1', 'user1', { mode: 'group' }),
      ).resolves.toBe('started');
      await expect(
        service.updateSession('trip1', 'user1', { status: 'navigating' }),
      ).resolves.toBe('updated');
      await expect(
        service.stopSession('trip1', 'user1'),
      ).resolves.toBeUndefined();

      expect(sessions.getGroupSnapshot).toHaveBeenCalledWith('trip1', 'user1');
      expect(sessions.startSession).toHaveBeenCalledWith('trip1', 'user1', {
        mode: 'group',
      });
      expect(sessions.updateSession).toHaveBeenCalledWith('trip1', 'user1', {
        status: 'navigating',
      });
      expect(sessions.stopSession).toHaveBeenCalledWith('trip1', 'user1');
    });
  });
});
