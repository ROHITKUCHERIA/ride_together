import { RedisRouteCache } from './redis-route-cache.service';
import type { RedisService } from './redis.service';
import type { NormalizedRoute } from '../navigation/interfaces/routing-response.interface';

const ROUTE: NormalizedRoute = {
  coordinates: [{ latitude: 17.385, longitude: 78.4867 }],
  distanceMeters: 4200,
  durationSeconds: 900,
};

interface FakeRedis {
  enabled: boolean;
  data: Map<string, string>;
  get: jest.Mock;
  set: jest.Mock;
  delete: jest.Mock;
}

function fakeRedis(): FakeRedis {
  const data = new Map<string, string>();
  return {
    enabled: true,
    data,
    get: jest.fn(async (k: string) => data.get(k) ?? null),
    set: jest.fn(async (k: string, v: string) => {
      data.set(k, v);
    }),
    setNx: jest.fn(async () => true),
    delete: jest.fn(async (k: string) => {
      data.delete(k);
    }),
  };
}

describe('RedisRouteCache', () => {
  it('serves from memory when Redis is enabled (memory is a read-through cache)', async () => {
    const redis = fakeRedis();
    const cache = new RedisRouteCache(redis as unknown as RedisService);
    await cache.set('k', ROUTE, 300);

    expect(redis.set).toHaveBeenCalled();

    // Immediate reads are served from the local read-through cache.
    await expect(cache.get('k')).resolves.toEqual(ROUTE);
    expect(redis.get).not.toHaveBeenCalled();

    // A cache miss hits Redis, which still holds the JSON payload.
    const directly = await cache.get('redis-only-key-that-never-exists');
    expect(directly).toBeNull();
    expect(redis.get).toHaveBeenCalled();
  });

  it('serves from memory when Redis is disabled', async () => {
    const redis = fakeRedis();
    redis.enabled = false;
    const cache = new RedisRouteCache(redis as unknown as RedisService);
    await cache.set('k', ROUTE, 0);
    // TTL 0 in memory → expires → not found.
    await expect(cache.get('k')).resolves.toBeNull();
    await cache.set('k', ROUTE, 300);
    await expect(cache.get('k')).resolves.toEqual(ROUTE);
  });

  it('tolerates Redis failures at runtime', async () => {
    const redis = fakeRedis();
    redis.get = jest.fn(async () => {
      throw new Error('connection refused');
    });
    const cache = new RedisRouteCache(redis as unknown as RedisService);
    await expect(cache.get('k')).resolves.toBeNull();
    expect(redis.get).toHaveBeenCalled();
  });

  it('deletes from both backends', async () => {
    const redis = fakeRedis();
    const cache = new RedisRouteCache(redis as unknown as RedisService);
    await cache.set('k', ROUTE, 300);
    await cache.delete('k');
    expect(redis.delete).toHaveBeenCalled();
    await expect(cache.get('k')).resolves.toBeNull();
  });
});
