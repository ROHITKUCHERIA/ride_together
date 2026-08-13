import { Test, TestingModule } from '@nestjs/testing';
import { TripLocationService } from './locations.service';
import { PrismaService } from '../prisma/prisma.service';
import { TripAccessService } from '../common/services/trip-access.service';
import { AppConfig } from '../config/app.config';
import { RiderStatus } from '../realtime/rider-status';

describe('TripLocationService', () => {
  let service: TripLocationService;
  let prisma: any;
  let access: { requireMember: jest.Mock };

  beforeEach(async () => {
    prisma = {
      currentLocation: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    access = { requireMember: jest.fn() };
    const config = {
      riderLiveThresholdMs: 15_000,
      riderDelayedThresholdMs: 60_000,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TripLocationService,
        { provide: PrismaService, useValue: prisma },
        { provide: TripAccessService, useValue: access },
        { provide: AppConfig, useValue: config },
      ],
    }).compile();

    service = module.get<TripLocationService>(TripLocationService);
  });

  it('getLocationsForTrip requires membership then returns mapped riders', async () => {
    access.requireMember.mockResolvedValue({ role: 'OWNER' });
    const lastUpdatedAt = new Date(Date.now() - 2_000);
    prisma.currentLocation.findMany.mockResolvedValue([
      {
        latitude: 15.49,
        longitude: 73.82,
        accuracy: 10,
        speed: 70,
        heading: 90,
        lastUpdatedAt,
        user: { id: 'u1', name: 'Rohit', avatarUrl: null },
      },
    ]);

    const result = await service.getLocationsForTrip('trip-1', 'u1');
    expect(access.requireMember).toHaveBeenCalledWith('trip-1', 'u1');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      userId: 'u1',
      name: 'Rohit',
      latitude: 15.49,
      status: RiderStatus.LIVE,
    });
    expect(result[0].lastUpdatedAt).toEqual(lastUpdatedAt.toISOString());
  });

  it('never exposes sensitive user fields', async () => {
    access.requireMember.mockResolvedValue({});
    prisma.currentLocation.findMany.mockResolvedValue([
      {
        latitude: 1,
        longitude: 1,
        accuracy: 1,
        speed: null,
        heading: null,
        lastUpdatedAt: new Date(),
        user: { id: 'u1', name: 'X', avatarUrl: null },
      },
    ]);
    const [r] = await service.getLocationsForTrip('trip-1', 'u1');
    expect((r as any).email).toBeUndefined();
  });

  it('computes OFFLINE for an old fix', async () => {
    access.requireMember.mockResolvedValue({});
    prisma.currentLocation.findMany.mockResolvedValue([
      {
        latitude: 1,
        longitude: 1,
        accuracy: 1,
        speed: null,
        heading: null,
        lastUpdatedAt: new Date(Date.now() - 120_000),
        user: { id: 'u1', name: 'X', avatarUrl: null },
      },
    ]);
    const [r] = await service.getLocationsForTrip('trip-1', 'u1');
    expect(r.status).toBe(RiderStatus.OFFLINE);
  });

  it('getRiderLocation returns null when absent', async () => {
    prisma.currentLocation.findUnique.mockResolvedValue(null);
    expect(await service.getRiderLocation('trip-1', 'u1')).toBeNull();
  });
});
