import { RerouteCooldownService } from './reroute-cooldown.service';
import type { RedisService } from './redis.service';

function disabledRedis(): RedisService {
  return { enabled: false } as unknown as RedisService;
}

interface RedisStub {
  enabled: boolean;
  keys: Map<string, string>;
  setNx: jest.Mock;
  get: jest.Mock;
  delete: jest.Mock;
}

function redisStub(): RedisStub {
  const keys = new Map<string, string>();
  return {
    enabled: true,
    setNx: jest.fn(async (k: string, v: string) => {
      if (keys.has(k)) return false;
      keys.set(k, v);
      return true;
    }),
    get: jest.fn(async (k: string) => keys.get(k) ?? null),
    delete: jest.fn(async (k: string) => {
      keys.delete(k);
    }),
    keys,
  };
}

describe('RerouteCooldownService (in-memory fallback)', () => {
  let service: RerouteCooldownService;

  beforeEach(() => {
    service = new RerouteCooldownService(disabledRedis());
  });

  it('allows the first reroute and rejects a second within the window', async () => {
    await expect(
      service.tryAcquire('trip1', 'user1', 'req-1', 15),
    ).resolves.toBe(true);
    await expect(
      service.tryAcquire('trip1', 'user1', 'req-2', 15),
    ).resolves.toBe(false);
  });

  it('allows the identical requestId through (idempotent retry)', async () => {
    await service.tryAcquire('trip1', 'user1', 'req-1', 15);
    await expect(
      service.tryAcquire('trip1', 'user1', 'req-1', 15),
    ).resolves.toBe(true);
  });

  it('releases and allows a fresh attempt', async () => {
    await service.tryAcquire('trip1', 'user1', 'req-1', 15);
    await service.release('trip1', 'user1', 'req-1');
    await expect(
      service.tryAcquire('trip1', 'user1', 'req-2', 15),
    ).resolves.toBe(true);
  });

  it('does not release someone else’s lock', async () => {
    await service.tryAcquire('trip1', 'user1', 'req-1', 15);
    await service.release('trip1', 'user1', 'req-other');
    await expect(
      service.tryAcquire('trip1', 'user1', 'req-2', 15),
    ).resolves.toBe(false);
  });

  it('keeps riders on different trips independent', async () => {
    await service.tryAcquire('trip1', 'user1', 'req-1', 15);
    await expect(
      service.tryAcquire('trip2', 'user1', 'req-2', 15),
    ).resolves.toBe(true);
  });

  it('frees the lock once the cooldown expires', async () => {
    await service.tryAcquire('trip1', 'user1', 'req-1', 15);
    // Sweep with a time far in the future.
    (service as unknown as { sweepMemory(now: number): void }).sweepMemory(
      Date.now() + 30_000,
    );
    await expect(
      service.tryAcquire('trip1', 'user1', 'req-2', 15),
    ).resolves.toBe(true);
  });
});

describe('RerouteCooldownService (Redis mode)', () => {
  it('writes a short-lived NX key and rejects a concurrent rider', async () => {
    const redis = redisStub();
    const service = new RerouteCooldownService(
      redis as unknown as RedisService,
    );

    await expect(service.tryAcquire('t', 'u', 'req-1', 15)).resolves.toBe(true);
    await expect(service.tryAcquire('t', 'u', 'req-2', 15)).resolves.toBe(
      false,
    );
    expect(redis.setNx).toHaveBeenCalledTimes(2);
  });

  it('releases only the matching lock owner', async () => {
    const redis = redisStub();
    const service = new RerouteCooldownService(
      redis as unknown as RedisService,
    );

    await service.tryAcquire('t', 'u', 'req-1', 15);
    await service.release('t', 'u', 'req-wrong');
    expect(redis.delete).not.toHaveBeenCalled();

    await service.release('t', 'u', 'req-1');
    expect(redis.delete).toHaveBeenCalledTimes(1);
  });
});
