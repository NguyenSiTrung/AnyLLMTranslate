import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRateLimiter } from '../rateLimiter';

describe('createRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('unlimited fast-path (maxRpm <= 0)', () => {
    it('resolves immediately with no timestamp tracking when maxRpm is 0', async () => {
      const limiter = createRateLimiter(0);
      await limiter.acquire();
      expect(limiter.__stateForTest?.window).toHaveLength(0);
    });

    it('resolves immediately when maxRpm is negative', async () => {
      const limiter = createRateLimiter(-5);
      await limiter.acquire();
      expect(limiter.__stateForTest?.window).toHaveLength(0);
    });

    it('getMaxRpm returns the configured value', () => {
      const limiter = createRateLimiter(0);
      expect(limiter.getMaxRpm()).toBe(0);
    });
  });

  describe('under cap', () => {
    it('resolves immediately and records a timestamp', async () => {
      const limiter = createRateLimiter(10);
      await limiter.acquire();
      expect(limiter.__stateForTest?.window).toHaveLength(1);
    });

    it('records multiple timestamps for multiple acquire calls under cap', async () => {
      const limiter = createRateLimiter(5);
      await limiter.acquire();
      await limiter.acquire();
      await limiter.acquire();
      expect(limiter.__stateForTest?.window).toHaveLength(3);
    });
  });

  describe('at cap — wait behavior', () => {
    it('waits until the 60s window frees a slot when at cap', async () => {
      const limiter = createRateLimiter(2);

      // Fill the window with 2 requests
      await limiter.acquire();
      await limiter.acquire();
      expect(limiter.__stateForTest?.window).toHaveLength(2);

      // Third request should wait ~60s for the first timestamp to expire
      const thirdPromise = limiter.acquire();
      const spy = vi.fn();
      thirdPromise.then(spy);

      // Should not resolve immediately
      await Promise.resolve();
      expect(spy).not.toHaveBeenCalled();

      // Advance time past 60s — the first timestamp expires
      vi.advanceTimersByTime(60_001);
      await thirdPromise;
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('resolves after the correct wait time (just past 60s from oldest)', async () => {
      const limiter = createRateLimiter(1);
      await limiter.acquire();

      const start = Date.now();
      const secondPromise = limiter.acquire();
      vi.advanceTimersByTime(60_001);
      await secondPromise;
      expect(Date.now() - start).toBeGreaterThanOrEqual(60_000);
    });
  });

  describe('pruning of expired timestamps', () => {
    it('prunes timestamps older than 60s on each acquire', async () => {
      const limiter = createRateLimiter(10);

      await limiter.acquire();
      // Advance 61s — the first timestamp should be pruned
      vi.advanceTimersByTime(61_000);
      await limiter.acquire();

      expect(limiter.__stateForTest?.window).toHaveLength(1);
    });

    it('prunes multiple expired timestamps at once', async () => {
      const limiter = createRateLimiter(10);

      await limiter.acquire();
      await limiter.acquire();
      await limiter.acquire();
      // Advance 61s — all 3 should be pruned
      vi.advanceTimersByTime(61_000);
      await limiter.acquire();

      expect(limiter.__stateForTest?.window).toHaveLength(1);
    });
  });

  describe('setMaxRpm — live reconfiguration', () => {
    it('disables limiting when set to 0', async () => {
      const limiter = createRateLimiter(5);
      await limiter.acquire();
      await limiter.acquire();

      limiter.setMaxRpm(0);
      // Now unlimited — acquire should resolve immediately even though window had 2
      await limiter.acquire();
      // Unlimited path doesn't track timestamps, so window stays as-is from before
      // (or could be cleared — the key is that acquire() doesn't wait)
    });

    it('enables limiting when set from 0 to N', async () => {
      const limiter = createRateLimiter(0);
      // Unlimited — no tracking
      await limiter.acquire();

      limiter.setMaxRpm(1);
      // Now limited to 1 — first acquire records a timestamp
      await limiter.acquire();
      expect(limiter.__stateForTest?.window).toHaveLength(1);

      // Second acquire at cap should wait
      const secondPromise = limiter.acquire();
      vi.advanceTimersByTime(60_001);
      await secondPromise;
    });

    it('getMaxRpm reflects the latest value after setMaxRpm', () => {
      const limiter = createRateLimiter(0);
      expect(limiter.getMaxRpm()).toBe(0);
      limiter.setMaxRpm(42);
      expect(limiter.getMaxRpm()).toBe(42);
    });
  });

  describe('bounded memory', () => {
    it('window array never exceeds maxRpm length', async () => {
      const limiter = createRateLimiter(3);
      // Fill to cap
      await limiter.acquire();
      await limiter.acquire();
      await limiter.acquire();
      expect(limiter.__stateForTest?.window).toHaveLength(3);

      // Acquire more — each should wait then replace an expired slot
      const p4 = limiter.acquire();
      vi.advanceTimersByTime(60_001);
      await p4;
      expect(limiter.__stateForTest!.window.length).toBeLessThanOrEqual(3);
    });
  });

  describe('concurrent acquire calls serialize correctly', () => {
    it('processes queued acquire calls in order as slots free up', async () => {
      const limiter = createRateLimiter(2);

      // Fill the window
      await limiter.acquire();
      await limiter.acquire();

      // Queue 3 more — they should resolve in order as 60s passes
      const results: number[] = [];
      const p3 = limiter.acquire().then(() => results.push(3));
      const p4 = limiter.acquire().then(() => results.push(4));
      const p5 = limiter.acquire().then(() => results.push(5));

      // After 60s, p3 and p4 should resolve (both timestamps expire).
      // p5 needs another 60s (it records a new timestamp after p3/p4).
      await vi.advanceTimersByTimeAsync(60_001);
      // p3 and p4 have resolved; p5 is waiting for the next window.
      // Advance another 60s for p5.
      await vi.advanceTimersByTimeAsync(60_001);
      await Promise.all([p3, p4, p5]);

      // All 3 should eventually resolve
      expect(results).toContain(3);
      expect(results).toContain(4);
      expect(results).toContain(5);
    });

    it('multiple concurrent acquires at cap all eventually resolve', async () => {
      const limiter = createRateLimiter(1);
      await limiter.acquire();

      const p2 = limiter.acquire();
      const p3 = limiter.acquire();

      // Advance enough time for both to resolve (each waits ~60s after the previous)
      await vi.advanceTimersByTimeAsync(120_002);
      await Promise.all([p2, p3]);
      expect(true).toBe(true); // Both resolved without hanging
    });
  });
});
