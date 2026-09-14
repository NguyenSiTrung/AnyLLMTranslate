import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeAdaptiveBudgets,
  createAdaptiveBatchState,
  recordBatchLatency,
} from '@/lib/adaptiveBatching';
import { selectLookaheadCandidates, shouldRunLookahead } from '@/lib/lookaheadPrefetch';
import { runWithConcurrency } from '../concurrency';
import { createRateLimiter } from '../rateLimiter';
import { createCircuitBreaker } from '../circuitBreaker';
import {
  formatKeyRateLimitSummary,
  matchKeyRateLimitPreset,
  getKeyRateLimitPresetValues,
  KEY_RATE_LIMIT_PRESETS,
} from '@/lib/keyRateLimits';
import {
  DEFAULT_KEY_MAX_RPM,
  DEFAULT_KEY_CONCURRENCY_LIMIT,
  DEFAULT_KEY_INTERVAL_MS,
} from '@/types/config';

describe('adaptiveBatching', () => {
  it('records latency EMA and adapts budgets up/down with clamps', () => {
    const first = recordBatchLatency(createAdaptiveBatchState(), 1000);
    expect(first).toEqual({ avgLatencyMs: 1000, samples: 1 });
    const ema = recordBatchLatency(first, 2000, 0.5);
    expect(ema.avgLatencyMs).toBe(1500);
    expect(ema.samples).toBe(2);

    const base = {
      maxTextGroupLengthPerRequest: 4,
      maxTextLengthPerRequest: 2000,
    };
    expect(computeAdaptiveBudgets(base, createAdaptiveBatchState())).toEqual(base);

    const faster = computeAdaptiveBudgets(base, { avgLatencyMs: 1000, samples: 5 }, 2500);
    expect(faster.maxTextGroupLengthPerRequest).toBeGreaterThan(base.maxTextGroupLengthPerRequest);
    expect(faster.maxTextLengthPerRequest).toBeGreaterThan(base.maxTextLengthPerRequest);

    const slower = computeAdaptiveBudgets(base, { avgLatencyMs: 8000, samples: 5 }, 2500);
    expect(slower.maxTextGroupLengthPerRequest).toBeLessThan(base.maxTextGroupLengthPerRequest);
    expect(slower.maxTextLengthPerRequest).toBeLessThan(base.maxTextLengthPerRequest);

    const tiny = computeAdaptiveBudgets(base, { avgLatencyMs: 100_000, samples: 3 }, 2500);
    expect(tiny.maxTextGroupLengthPerRequest).toBeGreaterThanOrEqual(1);
    expect(tiny.maxTextLengthPerRequest).toBeGreaterThanOrEqual(400);

    const huge = computeAdaptiveBudgets(base, { avgLatencyMs: 10, samples: 3 }, 2500);
    expect(huge.maxTextGroupLengthPerRequest).toBeLessThanOrEqual(12);
    expect(huge.maxTextLengthPerRequest).toBeLessThanOrEqual(6000);
  });
});

describe('lookaheadPrefetch', () => {
  it('shouldRunLookahead gating and selectLookaheadCandidates below-fold picking', () => {
    expect(
      shouldRunLookahead({ systemicPause: true, pageOff: false, activeRequests: 0 }),
    ).toBe(false);
    expect(
      shouldRunLookahead({ systemicPause: false, pageOff: true, activeRequests: 0 }),
    ).toBe(false);
    expect(
      shouldRunLookahead({
        systemicPause: false,
        pageOff: false,
        activeRequests: 2,
        activeThreshold: 1,
      }),
    ).toBe(false);
    expect(
      shouldRunLookahead({
        systemicPause: false,
        pageOff: false,
        activeRequests: 1,
        activeThreshold: 1,
      }),
    ).toBe(true);

    // selectLookaheadCandidates picks below-fold pieces, caps count, empty when none
    const ids = selectLookaheadCandidates(
      [
        { id: 'vis', isTranslated: false, inFlight: false, top: 100 },
        { id: 'margin', isTranslated: false, inFlight: false, top: 900 }, // within 800+200
        { id: 'next1', isTranslated: false, inFlight: false, top: 1200 },
        { id: 'next2', isTranslated: false, inFlight: false, top: 1400 },
        { id: 'next3', isTranslated: false, inFlight: false, top: 1600 },
        { id: 'far', isTranslated: false, inFlight: false, top: 5000 },
        { id: 'done', isTranslated: true, inFlight: false, top: 1300 },
        { id: 'busy', isTranslated: false, inFlight: true, top: 1350 },
      ],
      { viewportHeight: 800, viewportMarginPx: 200, belowPx: 900, maxPieces: 2 },
    );
    // next1/next2 are in (1000, 1700); far is outside; margin is inside IO margin
    expect(ids).toEqual(['next1', 'next2']);

    expect(
      selectLookaheadCandidates(
        [{ id: 'a', isTranslated: false, inFlight: false, top: 50 }],
        { viewportHeight: 800 },
      ),
    ).toEqual([]);
  });
});

/**
 * Tests for the bounded-concurrency runner (FR-8).
 */


describe('runWithConcurrency', () => {
  it('preserves order, caps concurrency, handles empty/oversize caps, injected delay, indexes, rejects concurrency < 1, and surfaces worker rejections', async () => {
    const delayed = await runWithConcurrency(
      [0, 1, 2, 3],
      async (item) => {
        await new Promise((r) => setTimeout(r, (10 - item) * 10));
        return item * 10;
      },
      { concurrency: 4 },
    );
    expect(delayed).toEqual([0, 10, 20, 30]);

    let inFlight = 0;
    let maxInFlight = 0;
    const capped = await runWithConcurrency(
      [0, 1, 2, 3, 4, 5, 6, 7],
      async (item) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 20));
        inFlight -= 1;
        return item;
      },
      { concurrency: 3 },
    );
    expect(capped).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(maxInFlight).toBe(3);

    expect(await runWithConcurrency([10, 20], async (n) => n + 1, { concurrency: 10 })).toEqual([
      11, 21,
    ]);

    const worker = vi.fn();
    expect(await runWithConcurrency([], worker, { concurrency: 4 })).toEqual([]);
    expect(worker).not.toHaveBeenCalled();

    vi.useFakeTimers();
    try {
      const delay = vi.fn(async (_ms: number) => {});
      const delayWorker = vi.fn(async (n: number) => n * 2);
      const results = await runWithConcurrency([1, 2, 3], delayWorker, {
        concurrency: 2,
        delay,
      });
      expect(results).toEqual([2, 4, 6]);
      expect(delayWorker).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }

    const seen: number[] = [];
    await runWithConcurrency(
      ['a', 'b', 'c'],
      async (_item, index) => {
        seen.push(index);
      },
      { concurrency: 2 },
    );
    expect(seen.sort((x, y) => x - y)).toEqual([0, 1, 2]);

    await expect(runWithConcurrency([1], async (n) => n, { concurrency: 0 })).rejects.toThrow(
      /concurrency must be >= 1/,
    );
    await expect(
      runWithConcurrency(
        [0, 1, 2],
        async (n) => {
          if (n === 1) throw new Error('boom');
          return n;
        },
        { concurrency: 2 },
      ),
    ).rejects.toThrow('boom');
  });
});

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

const NOW = 1_000_000;

describe('createCircuitBreaker', () => {
  let now: number;
  const clock = () => now;

  beforeEach(() => {
    now = NOW;
  });

  it('health, rateLimit escalation, auth, clientError, isolation, and classify', () => {
    const breaker = createCircuitBreaker({ clock });
    expect(breaker.isHealthy('k1', now)).toBe(true);
    expect(breaker.getState('k1').consecutiveFailures).toBe(0);
    breaker.recordFailure('k1', 'rateLimit', now);
    breaker.recordSuccess('k1');
    expect(breaker.getState('k1').consecutiveFailures).toBe(0);
    expect(breaker.isHealthy('k1', now)).toBe(true);

    breaker.recordFailure('k1', 'rateLimit', now);
    expect(breaker.getState('k1').openUntil).toBe(now + 60_000);
    expect(breaker.isHealthy('k1', now)).toBe(false);
    breaker.recordFailure('k1', 'rateLimit', now + 10_000);
    expect(breaker.getState('k1').openUntil).toBe(now + 10_000 + 120_000);
    breaker.recordFailure('k1', 'rateLimit', now + 20_000);
    expect(breaker.getState('k1').openUntil).toBe(now + 20_000 + 300_000);
    breaker.recordFailure('k1', 'rateLimit', now + 30_000);
    expect(breaker.getState('k1').openUntil).toBe(now + 30_000 + 300_000);
    expect(breaker.isHealthy('k1', now + 30_000 + 300_000)).toBe(true);
    breaker.recordSuccess('k1');
    breaker.recordFailure('k1', 'rateLimit', now + 30_000 + 300_000 + 5_000);
    expect(breaker.getState('k1').openUntil).toBe(now + 30_000 + 300_000 + 5_000 + 60_000);

    const auth = createCircuitBreaker({ clock });
    auth.recordFailure('k1', 'auth', now);
    expect(auth.getState('k1').openUntil).toBe(now + 60 * 60_000);
    expect(auth.getState('k1').credentialInvalid).toBe(true);
    auth.recordFailure('k1', 'auth', now + 1_000);
    expect(auth.getState('k1').openUntil).toBe(now + 1_000 + 60 * 60_000);
    auth.recordSuccess('k1');
    expect(auth.getState('k1').credentialInvalid).toBe(false);

    const client = createCircuitBreaker({ clock });
    client.recordFailure('k1', 'rateLimit', now);
    const before = client.getState('k1').consecutiveFailures;
    client.recordFailure('k1', 'clientError', now);
    expect(client.getState('k1').consecutiveFailures).toBe(before);
    const b2 = createCircuitBreaker({ clock });
    b2.recordFailure('k2', 'clientError', now);
    expect(b2.isHealthy('k2', now)).toBe(true);

    const iso = createCircuitBreaker({ clock });
    iso.recordFailure('k1', 'rateLimit', now);
    iso.recordFailure('k1', 'auth', now);
    expect(iso.isHealthy('k2', now)).toBe(true);
    expect(iso.getState('k2').credentialInvalid).toBe(false);
    expect(iso.classifyFailure(429)).toBe('rateLimit');
    expect(iso.classifyFailure(503)).toBe('serverError');
    expect(iso.classifyFailure(401)).toBe('auth');
    expect(iso.classifyFailure(404)).toBe('clientError');
    expect(iso.classifyFailure(undefined)).toBe('network');
    iso.__resetForTest();
    expect(iso.getState('k1').open).toBe(false);
    iso.openLong('k1', now + 999_999);
    expect(iso.isHealthy('k1', now)).toBe(false);
  });
});

/**
 * Unit tests for per-key rate limit summary + preset matching.
 */


describe('keyRateLimits', () => {
  it('formats summaries, matches presets, detects custom, and defines four preset values', () => {
    expect(
      formatKeyRateLimitSummary({ maxRpm: 20, concurrencyLimit: 1, interval: 500 }),
    ).toBe('20/min · 1 at once · 500 ms gap');
    expect(
      formatKeyRateLimitSummary({ maxRpm: 0, concurrencyLimit: 0, interval: 0 }),
    ).toBe('Unlimited rate · No concurrency cap · No gap');
    expect(
      formatKeyRateLimitSummary({ maxRpm: 30, concurrencyLimit: 0, interval: 100 }),
    ).toBe('30/min · No concurrency cap · 100 ms gap');

    expect(
      matchKeyRateLimitPreset({
        maxRpm: DEFAULT_KEY_MAX_RPM,
        concurrencyLimit: DEFAULT_KEY_CONCURRENCY_LIMIT,
        interval: DEFAULT_KEY_INTERVAL_MS,
      }),
    ).toBe('safe');
    expect(matchKeyRateLimitPreset(getKeyRateLimitPresetValues('balanced'))).toBe('balanced');
    expect(matchKeyRateLimitPreset(getKeyRateLimitPresetValues('aggressive'))).toBe('aggressive');
    expect(matchKeyRateLimitPreset(getKeyRateLimitPresetValues('unlimited'))).toBe('unlimited');
    expect(
      matchKeyRateLimitPreset({ maxRpm: 15, concurrencyLimit: 1, interval: 500 }),
    ).toBeNull();

    expect(KEY_RATE_LIMIT_PRESETS.map((p) => p.id)).toEqual([
      'safe',
      'balanced',
      'aggressive',
      'unlimited',
    ]);
    expect(getKeyRateLimitPresetValues('safe')).toEqual({
      maxRpm: 20,
      concurrencyLimit: 1,
      interval: 500,
    });
    expect(getKeyRateLimitPresetValues('balanced')).toEqual({
      maxRpm: 40,
      concurrencyLimit: 2,
      interval: 250,
    });
    expect(getKeyRateLimitPresetValues('aggressive')).toEqual({
      maxRpm: 60,
      concurrencyLimit: 4,
      interval: 100,
    });
    expect(getKeyRateLimitPresetValues('unlimited')).toEqual({
      maxRpm: 0,
      concurrencyLimit: 0,
      interval: 0,
    });
  });
});
