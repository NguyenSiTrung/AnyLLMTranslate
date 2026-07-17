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

  it('success, maxRetries rethrow, 4xx fail-fast, 5xx recover, exponential backoff', async () => {
    const ok = vi.fn().mockResolvedValue('ok');
    expect(
      await withRetry(ok, { maxRetries: 3, baseDelayMs: 10, shouldRetry: alwaysRetry }),
    ).toBe('ok');
    expect(ok).toHaveBeenCalledTimes(1);

    const fail = vi.fn().mockRejectedValue(new TransientError('boom'));
    const failP = withRetry(fail, { maxRetries: 2, baseDelayMs: 10, shouldRetry: alwaysRetry });
    const failAssert = expect(failP).rejects.toThrow('boom');
    await vi.runAllTimersAsync();
    await failAssert;
    expect(fail).toHaveBeenCalledTimes(3);

    const badReq = vi.fn().mockRejectedValue(new ApiError('Bad Request', 400));
    await expect(
      withRetry(badReq, { maxRetries: 5, baseDelayMs: 10, shouldRetry: noRetryOn4xx }),
    ).rejects.toThrow('Bad Request');
    expect(badReq).toHaveBeenCalledTimes(1);

    const recover = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('Server Error', 503))
      .mockResolvedValueOnce('recovered');
    const recoverP = withRetry(recover, {
      maxRetries: 3,
      baseDelayMs: 10,
      shouldRetry: noRetryOn4xx,
    });
    await vi.advanceTimersByTimeAsync(10);
    await expect(recoverP).resolves.toBe('recovered');
    expect(recover).toHaveBeenCalledTimes(2);

    const backoff = vi.fn().mockRejectedValue(new TransientError('x'));
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const backoffP = withRetry(backoff, {
      maxRetries: 2,
      baseDelayMs: 100,
      shouldRetry: alwaysRetry,
    });
    const backoffAssert = expect(backoffP).rejects.toThrow('x');
    await vi.runAllTimersAsync();
    await backoffAssert;
    const delays = setTimeoutSpy.mock.calls
      .map((c) => c[1])
      .filter((d): d is number => typeof d === 'number' && d >= 100);
    expect(delays).toContain(100);
    expect(delays).toContain(200);
    setTimeoutSpy.mockRestore();
  });
});
