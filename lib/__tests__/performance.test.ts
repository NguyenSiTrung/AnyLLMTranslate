/**
 * Tests for lib/performance.ts — performance utilities.
 * Covers: DOM write batching, debounce, throttle, measureAsync.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  scheduleDomWrite,
  cancelPendingWrites,
  getPendingWriteCount,
  debounce,
  throttle,
  measureAsync,
} from '@/lib/performance';

describe('lib/performance', () => {
  beforeEach(() => {
    cancelPendingWrites();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cancelPendingWrites();
    vi.useRealTimers();
  });

  describe('scheduleDomWrite', () => {
    it('queues a write operation', () => {
      const fn = vi.fn();
      scheduleDomWrite(fn);
      expect(getPendingWriteCount()).toBe(1);
      expect(fn).not.toHaveBeenCalled();
    });

    it('batches multiple writes', () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      scheduleDomWrite(fn1);
      scheduleDomWrite(fn2);
      expect(getPendingWriteCount()).toBe(2);
    });
  });

  describe('cancelPendingWrites', () => {
    it('clears all pending writes', () => {
      scheduleDomWrite(vi.fn());
      scheduleDomWrite(vi.fn());
      expect(getPendingWriteCount()).toBe(2);

      cancelPendingWrites();
      expect(getPendingWriteCount()).toBe(0);
    });

    it('handles empty queue gracefully', () => {
      expect(() => cancelPendingWrites()).not.toThrow();
    });
  });

  describe('debounce', () => {
    it('delays function execution', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 200);

      debounced();
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(200);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('resets timer on subsequent calls', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 200);

      debounced();
      vi.advanceTimersByTime(100);
      debounced(); // Reset timer
      vi.advanceTimersByTime(100);
      expect(fn).not.toHaveBeenCalled(); // Still waiting

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('passes arguments to the original function', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced('arg1', 'arg2');
      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });

  describe('throttle', () => {
    it('calls function immediately on first invocation', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 200);

      throttled();
      expect(fn).toHaveBeenCalledOnce();
    });

    it('prevents calls within throttle interval', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 200);

      throttled();
      throttled(); // Should be throttled
      throttled(); // Should be throttled

      expect(fn).toHaveBeenCalledOnce();
    });

    it('allows call after interval has passed', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 200);

      throttled();
      vi.advanceTimersByTime(200);
      throttled(); // Should go through

      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('measureAsync', () => {
    it('returns result and duration', async () => {
      const result = await measureAsync(async () => {
        return 42;
      });

      expect(result.result).toBe(42);
      expect(typeof result.durationMs).toBe('number');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('handles errors from async function', async () => {
      await expect(
        measureAsync(async () => {
          throw new Error('test error');
        }),
      ).rejects.toThrow('test error');
    });
  });
});
