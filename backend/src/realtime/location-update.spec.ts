import { validateLocationUpdate } from './location-update';

const LIMITS = { maxAgeMs: 300_000, maxFutureMs: 30_000 };
const NOW = 1_700_000_000_000;

const base = {
  tripId: 'trip-1',
  latitude: 15.49,
  longitude: 73.82,
  accuracy: 12,
  speed: 72,
  heading: 90,
  timestamp: NOW - 1_000,
};

function expectOk(input: Record<string, unknown>) {
  const r = validateLocationUpdate(input, LIMITS, NOW);
  if (!r.ok) throw new Error(`expected ok, got ${r.code}`);
  return r.value;
}

describe('validateLocationUpdate', () => {
  it('accepts a valid update', () => {
    const v = expectOk(base);
    expect(v.tripId).toBe('trip-1');
    expect(v.speed).toBe(72);
    expect(v.heading).toBe(90);
    expect(v.timestamp).toBe(NOW - 1_000);
  });

  it('accepts missing optional speed/heading', () => {
    const rest = { ...base };
    delete rest.speed;
    delete rest.heading;
    const v = expectOk(rest);
    expect(v.speed).toBeNull();
    expect(v.heading).toBeNull();
  });

  it('rejects latitude out of range', () => {
    expect(
      validateLocationUpdate({ ...base, latitude: 91 }, LIMITS, NOW).ok,
    ).toBe(false);
    expect(
      validateLocationUpdate({ ...base, latitude: -91 }, LIMITS, NOW).ok,
    ).toBe(false);
    expect(
      validateLocationUpdate({ ...base, latitude: 'abc' }, LIMITS, NOW).ok,
    ).toBe(false);
  });

  it('rejects longitude out of range', () => {
    expect(
      validateLocationUpdate({ ...base, longitude: 181 }, LIMITS, NOW).ok,
    ).toBe(false);
    expect(
      validateLocationUpdate({ ...base, longitude: -181 }, LIMITS, NOW).ok,
    ).toBe(false);
  });

  it('rejects negative accuracy', () => {
    expect(
      validateLocationUpdate({ ...base, accuracy: -1 }, LIMITS, NOW).ok,
    ).toBe(false);
  });

  it('rejects negative speed and out-of-range heading', () => {
    expect(validateLocationUpdate({ ...base, speed: -5 }, LIMITS, NOW).ok).toBe(
      false,
    );
    expect(
      validateLocationUpdate({ ...base, heading: 361 }, LIMITS, NOW).ok,
    ).toBe(false);
    expect(
      validateLocationUpdate({ ...base, heading: -1 }, LIMITS, NOW).ok,
    ).toBe(false);
  });

  it('rejects NaN / Infinity', () => {
    expect(
      validateLocationUpdate({ ...base, latitude: NaN }, LIMITS, NOW).ok,
    ).toBe(false);
    expect(
      validateLocationUpdate({ ...base, longitude: Infinity }, LIMITS, NOW).ok,
    ).toBe(false);
  });

  it('rejects missing tripId', () => {
    const rest = { ...base };
    delete rest.tripId;
    expect(validateLocationUpdate(rest, LIMITS, NOW).ok).toBe(false);
  });

  it('rejects future timestamps beyond the allowed window', () => {
    const r = validateLocationUpdate(
      { ...base, timestamp: NOW + 60_000 },
      LIMITS,
      NOW,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('FUTURE_TIMESTAMP');
  });

  it('rejects stale timestamps beyond the allowed age', () => {
    const r = validateLocationUpdate(
      { ...base, timestamp: NOW - 600_000 },
      LIMITS,
      NOW,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('STALE_TIMESTAMP');
  });

  it('accepts a non-integer valid timestamp', () => {
    const v = expectOk({ ...base, timestamp: NOW - 500 });
    expect(v.timestamp).toBe(NOW - 500);
  });
});
