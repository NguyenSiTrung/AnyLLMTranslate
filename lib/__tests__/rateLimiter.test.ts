import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRateLimiter } from '../rateLimiter';

describe('createRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('unlimited path, cap wait, prune, live reconfigure, serializes concurrent acquires, and honors timeouts', async () => {
    const unlimited = createRateLimiter(0);
    await unlimited.acquire();
    expect(unlimited.__stateForTest?.window).toHaveLength(0);
    expect(unlimited.getMaxRpm()).toBe(0);
    await expect(createRateLimiter(-5).acquire()).resolves.toBeUndefined();

    const limiter = createRateLimiter(2);
    await limiter.acquire();
    await limiter.acquire();
    expect(limiter.__stateForTest?.window).toHaveLength(2);
    const thirdPromise = limiter.acquire();
    const spy = vi.fn();
    thirdPromise.then(spy);
    await Promise.resolve();
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_001);
    await thirdPromise;
    expect(spy).toHaveBeenCalledTimes(1);

    const prune = createRateLimiter(3);
    await prune.acquire();
    await prune.acquire();
    await prune.acquire();
    vi.advanceTimersByTime(61_000);
    await prune.acquire();
    expect(prune.__stateForTest?.window).toHaveLength(1);

    const reconfig = createRateLimiter(0);
    await reconfig.acquire();
    reconfig.setMaxRpm(1);
    expect(reconfig.getMaxRpm()).toBe(1);
    await reconfig.acquire();
    const second = reconfig.acquire();
    vi.advanceTimersByTime(60_001);
    await second;
    reconfig.setMaxRpm(0);
    await reconfig.acquire();

    // serializes concurrent acquires and honors acquire timeouts (FR-5)
    const limiter2 = createRateLimiter(1);
    await limiter2.acquire();
    const p2 = limiter2.acquire();
    const p3 = limiter2.acquire();
    await vi.advanceTimersByTimeAsync(120_002);
    await Promise.all([p2, p3]);

    const timed = createRateLimiter(1);
    await timed.acquire();
    const acquireP = timed.acquire(1_000);
    const handled = acquireP.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1_001);
    const caught = await handled;
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).name).toBe('RateLimitTimeoutError');

    const ok = createRateLimiter(1);
    await ok.acquire();
    const within = ok.acquire(120_000);
    await vi.advanceTimersByTimeAsync(60_001);
    await within;
    await expect(createRateLimiter(0).acquire(1)).resolves.toBeUndefined();
  });
});
