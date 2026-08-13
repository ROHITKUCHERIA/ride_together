/** Strict validation of an inbound GPS location update. */

export interface LocationUpdateInput {
  tripId: unknown;
  latitude: unknown;
  longitude: unknown;
  accuracy: unknown;
  speed?: unknown;
  heading?: unknown;
  timestamp: unknown;
}

export interface ValidLocationUpdate {
  tripId: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  timestamp: number;
}

export type LocationValidationResult =
  | { ok: true; value: ValidLocationUpdate }
  | { ok: false; code: string; message: string };

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function validateLocationUpdate(
  input: LocationUpdateInput,
  limits: { maxAgeMs: number; maxFutureMs: number },
  now = Date.now(),
): LocationValidationResult {
  if (!input || typeof input !== 'object') {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'Invalid payload.' };
  }

  const { tripId, latitude, longitude, accuracy, speed, heading, timestamp } =
    input;

  if (typeof tripId !== 'string' || tripId.trim() === '') {
    return { ok: false, code: 'INVALID_TRIP', message: 'tripId is required.' };
  }

  if (!isFiniteNumber(latitude) || latitude < -90 || latitude > 90) {
    return {
      ok: false,
      code: 'INVALID_LATITUDE',
      message: 'latitude must be a number between -90 and 90.',
    };
  }

  if (!isFiniteNumber(longitude) || longitude < -180 || longitude > 180) {
    return {
      ok: false,
      code: 'INVALID_LONGITUDE',
      message: 'longitude must be a number between -180 and 180.',
    };
  }

  if (!isFiniteNumber(accuracy) || accuracy < 0) {
    return {
      ok: false,
      code: 'INVALID_ACCURACY',
      message: 'accuracy must be a non-negative number.',
    };
  }

  let speedValue: number | null = null;
  if (speed !== undefined && speed !== null) {
    if (!isFiniteNumber(speed) || speed < 0) {
      return {
        ok: false,
        code: 'INVALID_SPEED',
        message: 'speed must be a non-negative number.',
      };
    }
    speedValue = speed;
  }

  let headingValue: number | null = null;
  if (heading !== undefined && heading !== null) {
    if (!isFiniteNumber(heading) || heading < 0 || heading > 360) {
      return {
        ok: false,
        code: 'INVALID_HEADING',
        message: 'heading must be between 0 and 360.',
      };
    }
    headingValue = heading;
  }

  if (!isFiniteNumber(timestamp)) {
    return {
      ok: false,
      code: 'INVALID_TIMESTAMP',
      message: 'timestamp must be a valid epoch millisecond value.',
    };
  }

  const ts = timestamp;
  if (ts > now + limits.maxFutureMs) {
    return {
      ok: false,
      code: 'FUTURE_TIMESTAMP',
      message: 'timestamp is too far in the future.',
    };
  }
  if (now - ts > limits.maxAgeMs) {
    return {
      ok: false,
      code: 'STALE_TIMESTAMP',
      message: 'timestamp is too old.',
    };
  }

  return {
    ok: true,
    value: {
      tripId: tripId.trim(),
      latitude,
      longitude,
      accuracy,
      speed: speedValue,
      heading: headingValue,
      timestamp: ts,
    },
  };
}
