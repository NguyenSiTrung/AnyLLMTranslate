/**
 * Tests for the bounded-concurrency runner (FR-8).
 */

import { describe, it, expect, vi } from 'vitest';
import { runWithConcurrency } from '../concurrency';

describe('runWithConcurrency', () => {
  it('preserves order, caps concurrency, and handles empty/oversize caps', async () => {
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
  });

  it('passes indexes, rejects concurrency < 1, and surfaces worker rejections', async () => {
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

  it('is fake-timer friendly via the injected delay', async () => {
    vi.useFakeTimers();
    try {
      const delay = vi.fn(async (_ms: number) => {});
      const worker = vi.fn(async (n: number) => n * 2);
      const results = await runWithConcurrency([1, 2, 3], worker, { concurrency: 2, delay });
      expect(results).toEqual([2, 4, 6]);
      expect(worker).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
