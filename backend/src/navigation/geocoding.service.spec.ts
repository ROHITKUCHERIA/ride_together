import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ErrorCodes } from '../common/constants/error-codes';
import { AppConfig } from '../config/app.config';
import { GeocodingService } from './geocoding.service';

describe('GeocodingService', () => {
  let service: GeocodingService;
  let config: {
    geocodingProvider: string;
    geocodingApiUrl: string;
    geocodingTimeoutMs: number;
  };
  const originalFetch = globalThis.fetch;

  async function build() {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GeocodingService, { provide: AppConfig, useValue: config }],
    }).compile();
    service = module.get<GeocodingService>(GeocodingService);
  }

  beforeEach(() => {
    config = {
      geocodingProvider: 'nominatim',
      geocodingApiUrl: 'https://nominatim.test',
      geocodingTimeoutMs: 1000,
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('normalizes Nominatim results', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            display_name: 'Hyderabad, Telangana, India',
            lat: '17.3850',
            lon: '78.4867',
          },
          { display_name: 'Bad row', lat: 'n/a', lon: 'n/a' },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    await build();

    const results = await service.search('Hyderabad', 5);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/search?format=jsonv2'),
      expect.objectContaining({
        headers: {
          Accept: 'application/json',
          'User-Agent': 'RideTogether/1.0',
        },
      }),
    );
    expect(results).toEqual([
      {
        name: 'Hyderabad, Telangana, India',
        latitude: 17.385,
        longitude: 78.4867,
      },
    ]);
  });

  it('throws GEOCODING_UNAVAILABLE when the provider errors', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('timeout'));
    await build();

    await expect(service.search('Anywhere', 5)).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      errorCode: ErrorCodes.GEOCODING_UNAVAILABLE,
    });
  });

  it('throws GEOCODING_PROVIDER_UNSUPPORTED for an unknown provider', async () => {
    config = { ...config, geocodingProvider: 'tomtom' };
    await build();

    await expect(service.search('Anywhere', 5)).rejects.toMatchObject({
      errorCode: ErrorCodes.GEOCODING_PROVIDER_UNSUPPORTED,
    });
  });
});
