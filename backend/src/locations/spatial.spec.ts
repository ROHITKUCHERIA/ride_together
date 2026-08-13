import {
  distanceBetweenMeters,
  nearestRider,
  ridersWithinRadius,
  detectGroupSplit,
} from './spatial';

const A = { id: 'a', latitude: 15.49, longitude: 73.82 };
const B = { id: 'b', latitude: 15.5, longitude: 73.82 }; // ~1.1 km north
const C = { id: 'c', latitude: 15.55, longitude: 73.85 }; // ~7 km NE

describe('spatial helpers', () => {
  it('computes a plausible distance between two nearby points', () => {
    const d = distanceBetweenMeters(A, B);
    expect(d).toBeGreaterThan(900);
    expect(d).toBeLessThan(1_300);
  });

  it('returns zero distance for identical points', () => {
    expect(distanceBetweenMeters(A, { ...A })).toBe(0);
  });

  it('finds the nearest rider', () => {
    const n = nearestRider(A, [B, C]);
    expect(n?.rider.id).toBe('b');
    expect(n?.distanceMeters).toBeLessThan(1_300);
  });

  it('returns null when there are no riders', () => {
    expect(nearestRider(A, [])).toBeNull();
  });

  it('filters riders within a radius', () => {
    const inside = ridersWithinRadius(A, [B, C], 2_000);
    expect(inside.map((r) => r.id)).toEqual(['b']);
  });

  it('detects a split group', () => {
    const result = detectGroupSplit(A, [B, C], {
      spreadingThresholdMeters: 2_000,
      splitThresholdMeters: 5_000,
    });
    expect(result.health).toBe('split');
    expect(result.splitRiders.map((r) => r.id)).toEqual(['c']);
    expect(result.farthest?.rider.id).toBe('c');
  });

  it('detects a spreading group', () => {
    const result = detectGroupSplit(A, [B, C], {
      spreadingThresholdMeters: 2_000,
      splitThresholdMeters: 10_000,
    });
    expect(result.health).toBe('spreading');
    expect(result.splitRiders).toEqual([]);
  });

  it('detects a together group', () => {
    const result = detectGroupSplit(A, [B], {
      spreadingThresholdMeters: 2_000,
      splitThresholdMeters: 5_000,
    });
    expect(result.health).toBe('together');
  });
});
