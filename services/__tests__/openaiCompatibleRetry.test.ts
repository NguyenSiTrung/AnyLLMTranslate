/**
 * Tests: 429-aware retry with backoff + jitter in OpenAICompatibleService.
 *
 * Phase 4 (Batching & Retry) of pdf-perf-ux_20260703. Uses the REAL service
 * with a mocked `fetch` that returns 429 responses — following the "contract
 * bug" integration-test pattern (cf. provider-pool-resilience). Fake timers
 * make the exponential-backoff delays deterministic.
 *
 * Contract:
 * - On HTTP 429, fetchWithRetry retries up to MAX_429_RETRIES times (3).
 * - Retry-After header (seconds or HTTP-date) is honored when present.
 * - Without Retry-After, exponential backoff (1000ms * 2^attempt) + jitter.
 * - After exhausting retries, throws ApiError(statusCode=429) with a friendly
 *   message.
 * - Non-429 errors (500, network) use the existing retry path unchanged.
 * - A successful response after a 429 retry returns normally.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenAICompatibleService, ApiError } from '../openaiCompatible';
import type { TranslationRequest } from '@/types/translation';
import type { ProviderConfig } from '@/types/config';

const originalFetch = globalThis.fetch;

/** Minimal valid ProviderConfig for service construction in tests. */
function makeConfig(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    preset: 'custom',
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'test-key',
    model: 'gpt-4',
    temperature: 0.3,
    maxTokens: 4096,
    displayName: 'Test',
    requiresApiKey: true,
    ...overrides,
  };
}

function makeRequest(texts: Map<string, string>): TranslationRequest {
  return {
    texts,
    sourceLanguage: 'en',
    targetLanguage: 'vi',
  };
}

/** Build a mock 429 Response, optionally with a Retry-After header. */
function make429Response(retryAfter?: string): Response {
  const headers = new Headers();
  if (retryAfter !== undefined) {
    headers.set('retry-after', retryAfter);
  }
  return {
    ok: false,
    status: 429,
    statusText: 'Too Many Requests',
    text: () => Promise.resolve(''),
    json: () => Promise.resolve({}),
    headers,
  } as unknown as Response;
}

/** Build a mock 500 Response. */
function make500Response(): Response {
  return {
    ok: false,
    status: 500,
    statusText: 'Internal Server Error',
    text: () => Promise.resolve(''),
    json: () => Promise.resolve({}),
    headers: new Headers(),
  } as unknown as Response;
}

/** Build a mock 200 Response with the given content. */
function make200Response(content: string): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () =>
      Promise.resolve({
        choices: [{ message: { content }, finish_reason: 'stop' }],
      }),
    text: () => Promise.resolve(''),
    headers: new Headers(),
  } as unknown as Response;
}

/** Advance fake timers enough to flush all pending retry delays. */
async function flushTimers(): Promise<void> {
  // Max total delay for 429: 1000*2^0 + 1000*2^1 + 1000*2^2 + jitter ≈ 8500ms.
  // For HTTP-date Retry-After tests we use 10s, so 120_000 covers everything.
  await vi.advanceTimersByTimeAsync(120_000);
}

/** Start a translate call and attach an early catch handler to prevent
 *  unhandled-rejection warnings while fake timers flush the retry delays. */
function startTranslate(
  service: OpenAICompatibleService,
  texts: Map<string, string>,
): Promise<{ success: boolean; translations: Map<string, string>; error?: string }> {
  const promise = service.translate(makeRequest(texts));
  promise.catch(() => {});
  return promise;
}

describe('OpenAICompatibleService — 429 retry with backoff + jitter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  // ── Retry-After header ──────────────────────────────────────────────────

  it('reads the Retry-After header (seconds) and waits at least that long before retrying', async () => {
    const fetchTimes: number[] = [];
    const fetchMock = vi.fn().mockImplementation(() => {
      fetchTimes.push(Date.now());
      return Promise.resolve(make429Response('2'));
    });
    globalThis.fetch = fetchMock;

    const service = new OpenAICompatibleService(makeConfig());
    const promise = startTranslate(service, new Map([['p1', 'Hello']]));
    await flushTimers();
    await expect(promise).rejects.toThrow(ApiError);

    // 4 fetch calls: 1 initial + 3 retries.
    expect(fetchMock).toHaveBeenCalledTimes(4);

    // Gap between first and second fetch should be >= 2000ms (Retry-After: 2s)
    // and <= 2500ms (2000 + 500 jitter).
    const gap = fetchTimes[1] - fetchTimes[0];
    expect(gap).toBeGreaterThanOrEqual(2000);
    expect(gap).toBeLessThanOrEqual(2500);
  });

  // ── Exponential backoff (no Retry-After) ─────────────────────────────────

  it('applies exponential backoff with jitter when Retry-After is absent', async () => {
    const fetchTimes: number[] = [];
    const fetchMock = vi.fn().mockImplementation(() => {
      fetchTimes.push(Date.now());
      return Promise.resolve(make429Response());
    });
    globalThis.fetch = fetchMock;

    const service = new OpenAICompatibleService(makeConfig());
    const promise = startTranslate(service, new Map([['p1', 'Hello']]));
    await flushTimers();
    await expect(promise).rejects.toThrow(ApiError);

    expect(fetchMock).toHaveBeenCalledTimes(4);

    // First retry delay: base * 2^0 + jitter = 1000 + [0,500] -> [1000, 1500]
    const gap1 = fetchTimes[1] - fetchTimes[0];
    expect(gap1).toBeGreaterThanOrEqual(1000);
    expect(gap1).toBeLessThanOrEqual(1500);

    // Second retry delay: base * 2^1 + jitter = 2000 + [0,500] -> [2000, 2500]
    const gap2 = fetchTimes[2] - fetchTimes[1];
    expect(gap2).toBeGreaterThanOrEqual(2000);
    expect(gap2).toBeLessThanOrEqual(2500);

    // Third retry delay: base * 2^2 + jitter = 4000 + [0,500] -> [4000, 4500]
    const gap3 = fetchTimes[3] - fetchTimes[2];
    expect(gap3).toBeGreaterThanOrEqual(4000);
    expect(gap3).toBeLessThanOrEqual(4500);
  });

  // ── Max-attempt cap ──────────────────────────────────────────────────────

  it('throws a friendly ApiError after exhausting the 3-retry cap', async () => {
    const fetchMock = vi.fn().mockResolvedValue(make429Response());
    globalThis.fetch = fetchMock;

    const service = new OpenAICompatibleService(makeConfig());
    const promise = startTranslate(service, new Map([['p1', 'Hello']]));
    await flushTimers();

    let thrown: unknown;
    try {
      await promise;
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ApiError);
    expect((thrown as ApiError).statusCode).toBe(429);
    expect((thrown as ApiError).message).toContain('Rate limit exceeded');
    expect((thrown as ApiError).message).toContain('batch size');
    // 1 initial + 3 retries = 4 total fetch calls.
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  // ── Non-429 errors unaffected ────────────────────────────────────────────

  it('500 errors use the existing retry path (PER_SERVICE_MAX_RETRIES=1), not 429 backoff', async () => {
    const fetchMock = vi.fn().mockResolvedValue(make500Response());
    globalThis.fetch = fetchMock;

    const service = new OpenAICompatibleService(makeConfig());
    const promise = startTranslate(service, new Map([['p1', 'Hello']]));
    await flushTimers();

    let thrown: unknown;
    try {
      await promise;
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ApiError);
    expect((thrown as ApiError).statusCode).toBe(500);
    // 1 initial + 1 retry = 2 total fetch calls (existing 5xx path).
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('network errors use the existing retry path, not 429 backoff', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    globalThis.fetch = fetchMock;

    const service = new OpenAICompatibleService(makeConfig());
    const promise = startTranslate(service, new Map([['p1', 'Hello']]));
    await flushTimers();

    await expect(promise).rejects.toThrow('ECONNREFUSED');
    // 1 initial + 1 retry = 2 total fetch calls (existing network-error path).
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('non-429 client errors (401) are not retried at all', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: () => Promise.resolve('{"error":{"message":"Invalid API key"}}'),
      json: () => Promise.resolve({}),
      headers: new Headers(),
    } as unknown as Response);
    globalThis.fetch = fetchMock;

    const service = new OpenAICompatibleService(makeConfig());
    const promise = startTranslate(service, new Map([['p1', 'Hello']]));
    await flushTimers();

    let thrown: unknown;
    try {
      await promise;
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ApiError);
    expect((thrown as ApiError).statusCode).toBe(401);
    // No retries for 401 — single fetch call.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // ── Success after 429 retry ──────────────────────────────────────────────

  it('returns normally when a 429 retry succeeds', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(make429Response('1'))
      .mockResolvedValueOnce(make200Response('{"translations":{"p1":"Xin chao"}}'));
    globalThis.fetch = fetchMock;

    const service = new OpenAICompatibleService(makeConfig());
    const promise = startTranslate(service, new Map([['p1', 'Hello']]));
    await flushTimers();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.translations.get('p1')).toBe('Xin chao');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns normally when a 429 retry (no Retry-After) succeeds', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(make429Response())
      .mockResolvedValueOnce(make429Response())
      .mockResolvedValueOnce(make200Response('{"translations":{"p1":"Xin chao"}}'));
    globalThis.fetch = fetchMock;

    const service = new OpenAICompatibleService(makeConfig());
    const promise = startTranslate(service, new Map([['p1', 'Hello']]));
    await flushTimers();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.translations.get('p1')).toBe('Xin chao');
    // 2 failed 429 attempts + 1 successful = 3 total fetch calls.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  // ── Jitter verification ─────────────────────────────────────────────────

  it('jitter is applied: delay >= base and <= base + max jitter', async () => {
    const fetchTimes: number[] = [];
    const fetchMock = vi.fn().mockImplementation(() => {
      fetchTimes.push(Date.now());
      return Promise.resolve(make429Response());
    });
    globalThis.fetch = fetchMock;

    const service = new OpenAICompatibleService(makeConfig());
    const promise = startTranslate(service, new Map([['p1', 'Hello']]));
    await flushTimers();
    await expect(promise).rejects.toThrow(ApiError);

    // For the first retry (rateLimitAttempts=0): base = 1000, jitter in [0, 500].
    // Delay = base + jitter in [1000, 1500].
    const firstDelay = fetchTimes[1] - fetchTimes[0];
    expect(firstDelay).toBeGreaterThanOrEqual(1000);
    expect(firstDelay).toBeLessThanOrEqual(1500);
  });

  // ── Retry-After as HTTP-date ─────────────────────────────────────────────

  it('parses Retry-After as an HTTP-date and computes the remaining wait', async () => {
    // Retry-After 10 seconds from now (as an HTTP-date). toUTCString()
    // truncates to whole seconds, so the actual delay may be up to ~1s
    // shorter than 10s. We use a generous range: [9000, 10500].
    const retryAfterDate = new Date(Date.now() + 10000).toUTCString();
    const fetchTimes: number[] = [];
    const fetchMock = vi.fn().mockImplementation(() => {
      fetchTimes.push(Date.now());
      return Promise.resolve(make429Response(retryAfterDate));
    });
    globalThis.fetch = fetchMock;

    const service = new OpenAICompatibleService(makeConfig());
    const promise = startTranslate(service, new Map([['p1', 'Hello']]));
    await flushTimers();
    await expect(promise).rejects.toThrow(ApiError);

    // The first retry should wait ~10s (minus up to ~1s from second-level
    // truncation in toUTCString, plus 0-500ms jitter).
    const gap = fetchTimes[1] - fetchTimes[0];
    expect(gap).toBeGreaterThanOrEqual(9000);
    expect(gap).toBeLessThanOrEqual(10500);
  });

  // ── ApiError carries statusCode for circuit breaker ─────────────────────

  it('the thrown ApiError carries statusCode=429 for the pool circuit breaker', async () => {
    const fetchMock = vi.fn().mockResolvedValue(make429Response());
    globalThis.fetch = fetchMock;

    const service = new OpenAICompatibleService(makeConfig());
    const promise = startTranslate(service, new Map([['p1', 'Hello']]));
    await flushTimers();

    try {
      await promise;
      expect.fail('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).statusCode).toBe(429);
      // Friendly message mentions rate limiting and actionable advice.
      const msg = (error as ApiError).message;
      expect(msg).toContain('Rate limit');
      expect(msg).toContain('batch size');
    }
  });
});
