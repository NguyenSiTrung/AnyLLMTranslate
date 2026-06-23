/**
 * Tests for the generic retry-with-backoff helper.
 * Operates on THROWN errors. The 4xx fail-fast predicate mirrors
 * fetchWithRetry (services/openaiCompatible.ts:384).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry } from '@/lib/subtitleRetry';
import { ApiError } from '@/services/openaiCompatible';

class TransientError extends Error {}
const alwaysRetry = () => true;
const noRetryOn4xx = (e: unknown): boolean =>
  !(e instanceof ApiError && e.statusCode >= 400 && e.statusCode < 500);

describe('withRetry', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns the value on first success (no retries)', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 10, shouldRetry: alwaysRetry });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries up to maxRetries then rethrows when shouldRetry is true', async () => {
    const fn = vi.fn().mockRejectedValue(new TransientError('boom'));
    const p = withRetry(fn, { maxRetries: 2, baseDelayMs: 10, shouldRetry: alwaysRetry });
    // Attach the handler synchronously to avoid an unhandled-rejection window
    // between fn() rejecting and our assertion running.
    const assertion = expect(p).rejects.toThrow('boom');
    // Advance through the backoff delays (10, 20) as they fire.
    await vi.runAllTimersAsync();
    await assertion;
    // 1 initial + 2 retries = 3 attempts.
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry when shouldRetry returns false (4xx fail-fast)', async () => {
    const err = new ApiError('Bad Request', 400);
    const fn = vi.fn().mockRejectedValue(err);
    await expect(
      withRetry(fn, { maxRetries: 5, baseDelayMs: 10, shouldRetry: noRetryOn4xx }),
    ).rejects.toThrow('Bad Request');
    expect(fn).toHaveBeenCalledTimes(1); // no retry
  });

  it('retries on 5xx (shouldRetry returns true) and recovers', async () => {
    const err = new ApiError('Server Error', 503);
    const fn = vi.fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce('recovered');
    const p = withRetry(fn, { maxRetries: 3, baseDelayMs: 10, shouldRetry: noRetryOn4xx });
    // Flush the backoff timer; the promise then settles to 'recovered'.
    await vi.advanceTimersByTimeAsync(10);
    await expect(p).resolves.toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('uses exponential backoff: baseDelayMs * 2^(attempt-1)', async () => {
    const fn = vi.fn().mockRejectedValue(new TransientError('x'));
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const p = withRetry(fn, { maxRetries: 2, baseDelayMs: 100, shouldRetry: alwaysRetry });
    // Attach the handler synchronously to avoid an unhandled-rejection window.
    const assertion = expect(p).rejects.toThrow('x');
    await vi.runAllTimersAsync();
    await assertion;
    // Two backoff delays scheduled: 100 (attempt 1 -> retry 1), 200 (attempt 2 -> retry 2).
    const delays = setTimeoutSpy.mock.calls
      .map((c) => c[1])
      .filter((d): d is number => typeof d === 'number' && d >= 100);
    expect(delays).toContain(100);
    expect(delays).toContain(200);
    setTimeoutSpy.mockRestore();
  });
});
