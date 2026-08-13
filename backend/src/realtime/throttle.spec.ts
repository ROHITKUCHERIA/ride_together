import { LocationThrottle } from './throttle';

describe('LocationThrottle', () => {
  const NOW = 1_000_000;

  it('allows the first update', () => {
    const t = new LocationThrottle(3_000);
    expect(t.allow('a', NOW)).toBe(true);
  });

  it('rejects updates within the interval', () => {
    const t = new LocationThrottle(3_000);
    expect(t.allow('a', NOW)).toBe(true);
    expect(t.allow('a', NOW + 1_000)).toBe(false);
    expect(t.allow('a', NOW + 2_999)).toBe(false);
  });

  it('allows again after the interval elapses', () => {
    const t = new LocationThrottle(3_000);
    expect(t.allow('a', NOW)).toBe(true);
    expect(t.allow('a', NOW + 3_001)).toBe(true);
  });

  it('tracks different keys independently', () => {
    const t = new LocationThrottle(3_000);
    expect(t.allow('a', NOW)).toBe(true);
    expect(t.allow('b', NOW)).toBe(true);
  });

  it('does not advance the window on rejection (spam stays blocked)', () => {
    const t = new LocationThrottle(3_000);
    expect(t.allow('a', NOW)).toBe(true);
    expect(t.allow('a', NOW + 1_000)).toBe(false);
    expect(t.allow('a', NOW + 1_500)).toBe(false);
    expect(t.allow('a', NOW + 3_100)).toBe(true);
  });

  it('resets a key', () => {
    const t = new LocationThrottle(60_000);
    expect(t.allow('a', NOW)).toBe(true);
    t.reset('a');
    expect(t.allow('a', NOW)).toBe(true);
  });
});
