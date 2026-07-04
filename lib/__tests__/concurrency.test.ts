/**
 * Tests for the bounded-concurrency runner (FR-8).
 */

import { describe, it, expect, vi } from 'vitest';
import { runWithConcurrency } from '../concurrency';

describe('runWithConcurrency', () => {
  it('returns results in input order regardless of completion order', async () => {
    // Worker that resolves later for earlier items — order must still be 0..3.
    const worker = async (item: number) => {
      const delay = (10 - item) * 10; // item 0 slowest, item 3 fastest
      await new Promise((r) => setTimeout(r, delay));
      return item * 10;
    };
    const results = await runWithConcurrency([0, 1, 2, 3], worker, { concurrency: 4 });
    expect(results).toEqual([0, 10, 20, 30]);
  });

  it('never exceeds the concurrency cap', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const worker = async (item: number) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 20));
      inFlight -= 1;
      return item;
    };
    const results = await runWithConcurrency([0, 1, 2, 3, 4, 5, 6, 7], worker, {
      concurrency: 3,
    });
    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(maxInFlight).toBe(3); // should actually reach the cap
  });

  it('processes all items when cap > items', async () => {
    const worker = async (n: number) => n + 1;
    const results = await runWithConcurrency([10, 20], worker, { concurrency: 10 });
    expect(results).toEqual([11, 21]);
  });

  it('returns an empty array for empty input', async () => {
    const worker = vi.fn();
    const results = await runWithConcurrency([], worker, { concurrency: 4 });
    expect(results).toEqual([]);
    expect(worker).not.toHaveBeenCalled();
  });

  it('passes the index to the worker', async () => {
    const seen: number[] = [];
    await runWithConcurrency(
      ['a', 'b', 'c'],
      async (_item, index) => {
        seen.push(index);
      },
      { concurrency: 2 },
    );
    expect(seen.sort((x, y) => x - y)).toEqual([0, 1, 2]);
  });

  it('throws when concurrency < 1', async () => {
    await expect(
      runWithConcurrency([1], async (n) => n, { concurrency: 0 }),
    ).rejects.toThrow(/concurrency must be >= 1/);
  });

  it('preserves rejection at the corresponding position', async () => {
    const worker = async (n: number) => {
      if (n === 1) throw new Error('boom');
      return n;
    };
    // The whole batch rejects when any worker rejects; callers wanting
    // partial-success handle errors inside the worker (returning result objects).
    await expect(
      runWithConcurrency([0, 1, 2], worker, { concurrency: 2 }),
    ).rejects.toThrow('boom');
  });

  it('is fake-timer friendly via the injected delay', async () => {
    vi.useFakeTimers();
    try {
      const delay = vi.fn(async (_ms: number) => {
        // Advance immediately in tests — the helper just needs a yield point.
      });
      const worker = vi.fn(async (n: number) => n * 2);
      const promise = runWithConcurrency([1, 2, 3], worker, { concurrency: 2, delay });
      const results = await promise;
      expect(results).toEqual([2, 4, 6]);
      expect(worker).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
