import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRateLimiter } from '../rateLimiter';

describe('createRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('unlimited fast-path resolves immediately (maxRpm <= 0)', async () => {
    const limiter = createRateLimiter(0);
    await limiter.acquire();
    expect(limiter.__stateForTest?.window).toHaveLength(0);
    expect(limiter.getMaxRpm()).toBe(0);
    await expect(createRateLimiter(-5).acquire()).resolves.toBeUndefined();
  });

  it('records timestamps under cap and waits when at cap', async () => {
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
  });

  it('prunes expired timestamps and bounds window length to maxRpm', async () => {
    const limiter = createRateLimiter(3);
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    expect(limiter.__stateForTest?.window).toHaveLength(3);

    vi.advanceTimersByTime(61_000);
    await limiter.acquire();
    expect(limiter.__stateForTest?.window).toHaveLength(1);

    const lim2 = createRateLimiter(3);
    await lim2.acquire();
    await lim2.acquire();
    await lim2.acquire();
    const p4 = lim2.acquire();
    vi.advanceTimersByTime(60_001);
    await p4;
    expect(lim2.__stateForTest?.window.length).toBeLessThanOrEqual(3);
  });

  it('supports live setMaxRpm reconfiguration', async () => {
    const limiter = createRateLimiter(0);
    await limiter.acquire();
    limiter.setMaxRpm(1);
    expect(limiter.getMaxRpm()).toBe(1);
    await limiter.acquire();
    expect(limiter.__stateForTest?.window).toHaveLength(1);
    const second = limiter.acquire();
    vi.advanceTimersByTime(60_001);
    await second;

    const lim2 = createRateLimiter(5);
    await lim2.acquire();
    lim2.setMaxRpm(0);
    await lim2.acquire(); // unlimited — no wait
  });

  it('serializes concurrent acquires as slots free', async () => {
    const limiter = createRateLimiter(1);
    await limiter.acquire();
    const p2 = limiter.acquire();
    const p3 = limiter.acquire();
    await vi.advanceTimersByTimeAsync(120_002);
    await Promise.all([p2, p3]);
  });

  describe('FR-5: acquire(timeoutMs) honors a deadline', () => {
    it('rejects with RateLimitTimeoutError when wait exceeds deadline', async () => {
      const limiter = createRateLimiter(1);
      await limiter.acquire();
      const acquireP = limiter.acquire(1_000);
      const handled = acquireP.catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(1_001);
      const caught = await handled;
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).name).toBe('RateLimitTimeoutError');
    });

    it('resolves when a slot frees within the deadline; unlimited ignores deadline', async () => {
      const limiter = createRateLimiter(1);
      await limiter.acquire();
      const acquireP = limiter.acquire(120_000);
      await vi.advanceTimersByTimeAsync(60_001);
      await acquireP;
      expect(limiter.__stateForTest?.window.length).toBeGreaterThanOrEqual(1);
      await expect(createRateLimiter(0).acquire(1)).resolves.toBeUndefined();
    });
  });
});
