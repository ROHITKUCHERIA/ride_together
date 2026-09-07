import { InMemoryRouteCache } from './in-memory-route-cache';
import { buildRouteCacheKey } from './route-cache.interface';
import type { NormalizedRoute } from '../navigation/interfaces/routing-response.interface';

const ROUTE: NormalizedRoute = {
  coordinates: [
    { latitude: 17.385, longitude: 78.4867 },
    { latitude: 17.4065, longitude: 78.4772 },
  ],
  distanceMeters: 4200,
  durationSeconds: 900,
};

describe('InMemoryRouteCache', () => {
  let cache: InMemoryRouteCache;

  beforeEach(() => {
    cache = new InMemoryRouteCache();
  });

  it('stores and returns a route within TTL', async () => {
    await cache.set('k', ROUTE, 300);
    await expect(cache.get('k')).resolves.toEqual(ROUTE);
  });

  it('expires entries after the TTL', async () => {
    await cache.set('k', ROUTE, 0);
    await expect(cache.get('k')).resolves.toBeNull();
  });

  it('returns null for unknown keys and clears', async () => {
    await expect(cache.get('missing')).resolves.toBeNull();
    await cache.set('a', ROUTE, 300);
    await cache.clear();
    await expect(cache.get('a')).resolves.toBeNull();
  });

  it('deletes a single key', async () => {
    await cache.set('a', ROUTE, 300);
    await cache.delete('a');
    await expect(cache.get('a')).resolves.toBeNull();
  });
});

describe('buildRouteCacheKey', () => {
  it('normalizes coordinates for a deterministic partitioned key', () => {
    const a = buildRouteCacheKey(
      78.4867121,
      17.3850123,
      78.4772345,
      17.4069876,
    );
    const b = buildRouteCacheKey(
      78.4867141,
      17.3850101,
      78.4772344,
      17.4069891,
    );
    expect(a).toBe(b);
    expect(a.startsWith('route:')).toBe(true);
    // Uses fixed 5-decimal precision.
    expect(a).toContain('78.48671');
    expect(a).toContain('78.47723');
  });
});
