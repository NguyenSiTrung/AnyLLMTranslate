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

  it('honors Retry-After headers and exponential backoff with jitter', async () => {
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

    const retryAfterDate = new Date(Date.now() + 10000).toUTCString();
    const dateFetchTimes: number[] = [];
    const dateFetchMock = vi.fn().mockImplementation(() => {
      dateFetchTimes.push(Date.now());
      return Promise.resolve(make429Response(retryAfterDate));
    });
    globalThis.fetch = dateFetchMock;

    const dateService = new OpenAICompatibleService(makeConfig());
    const datePromise = startTranslate(dateService, new Map([['p1', 'Hello']]));
    await flushTimers();
    await expect(datePromise).rejects.toThrow(ApiError);

    const dateGap = dateFetchTimes[1] - dateFetchTimes[0];
    expect(dateGap).toBeGreaterThanOrEqual(9000);
    expect(dateGap).toBeLessThanOrEqual(10500);
    {
      // ── Exponential backoff (no Retry-After) ─────────────────────────────
      const backoffTimes: number[] = [];
      const backoffFetch = vi.fn().mockImplementation(() => {
        backoffTimes.push(Date.now());
        return Promise.resolve(make429Response());
      });
      globalThis.fetch = backoffFetch;

      const backoffService = new OpenAICompatibleService(makeConfig());
      const backoffPromise = startTranslate(backoffService, new Map([['p1', 'Hello']]));
      await flushTimers();
      await expect(backoffPromise).rejects.toThrow(ApiError);

      expect(backoffFetch).toHaveBeenCalledTimes(4);

      // First retry delay: base * 2^0 + jitter = 1000 + [0,500] -> [1000, 1500]
      const gap1 = backoffTimes[1] - backoffTimes[0];
      expect(gap1).toBeGreaterThanOrEqual(1000);
      expect(gap1).toBeLessThanOrEqual(1500);

      // Second retry delay: base * 2^1 + jitter = 2000 + [0,500] -> [2000, 2500]
      const gap2 = backoffTimes[2] - backoffTimes[1];
      expect(gap2).toBeGreaterThanOrEqual(2000);
      expect(gap2).toBeLessThanOrEqual(2500);

      // Third retry delay: base * 2^2 + jitter = 4000 + [0,500] -> [4000, 4500]
      const gap3 = backoffTimes[3] - backoffTimes[2];
      expect(gap3).toBeGreaterThanOrEqual(4000);
      expect(gap3).toBeLessThanOrEqual(4500);

      const capFetch = vi.fn().mockResolvedValue(make429Response());
      globalThis.fetch = capFetch;
      const capService = new OpenAICompatibleService(makeConfig());
      const capPromise = startTranslate(capService, new Map([['p1', 'Hello']]));
      await flushTimers();

      let thrown: unknown;
      try {
        await capPromise;
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(ApiError);
      expect((thrown as ApiError).statusCode).toBe(429);
      expect((thrown as ApiError).message).toContain('Rate limit exceeded');
      expect((thrown as ApiError).message).toContain('batch size');
      expect(capFetch).toHaveBeenCalledTimes(4);

      const immediateFetch = vi.fn().mockResolvedValue(make429Response());
      globalThis.fetch = immediateFetch;
      const immediateService = new OpenAICompatibleService(makeConfig());
      immediateService.setMax429Retries(0);
      const immediatePromise = startTranslate(
        immediateService,
        new Map([['p1', 'Hello']]),
      );
      await flushTimers();
      await expect(immediatePromise).rejects.toMatchObject({ name: 'ApiError', statusCode: 429 });
      expect(immediateFetch).toHaveBeenCalledTimes(1);
      immediateService.setMax429Retries(null);
    }
  });

  // ── Non-429 errors unaffected ────────────────────────────────────────────

  it('non-429 errors (500 / network / 401) use the existing retry path, not 429 backoff', async () => {
    // 500 → existing retry (1 initial + 1 retry = 2 calls)
    const fetch500 = vi.fn().mockResolvedValue(make500Response());
    globalThis.fetch = fetch500;
    const service = new OpenAICompatibleService(makeConfig());
    const p500 = startTranslate(service, new Map([['p1', 'Hello']]));
    await flushTimers();
    let thrown500: unknown;
    try {
      await p500;
    } catch (error) {
      thrown500 = error;
    }
    expect(thrown500).toBeInstanceOf(ApiError);
    expect((thrown500 as ApiError).statusCode).toBe(500);
    expect(fetch500).toHaveBeenCalledTimes(2);

    // network error → existing retry path (2 calls)
    const fetchNet = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    globalThis.fetch = fetchNet;
    const pNet = startTranslate(new OpenAICompatibleService(makeConfig()), new Map([['p1', 'Hello']]));
    await flushTimers();
    await expect(pNet).rejects.toThrow('ECONNREFUSED');
    expect(fetchNet).toHaveBeenCalledTimes(2);

    // 401 client error → not retried at all (1 call)
    const fetch401 = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: () => Promise.resolve('{"error":{"message":"Invalid API key"}}'),
      json: () => Promise.resolve({}),
      headers: new Headers(),
    } as unknown as Response);
    globalThis.fetch = fetch401;
    const p401 = startTranslate(new OpenAICompatibleService(makeConfig()), new Map([['p1', 'Hello']]));
    await flushTimers();
    let thrown401: unknown;
    try {
      await p401;
    } catch (error) {
      thrown401 = error;
    }
    expect(thrown401).toBeInstanceOf(ApiError);
    expect((thrown401 as ApiError).statusCode).toBe(401);
    expect(fetch401).toHaveBeenCalledTimes(1);
  });

  // ── Success after 429 retry ──────────────────────────────────────────────

  it('returns normally when a 429 retry succeeds (with or without Retry-After)', async () => {
    // With Retry-After: 1 failed + 1 success = 2 calls.
    const fetchWithRetryAfter = vi.fn()
      .mockResolvedValueOnce(make429Response('1'))
      .mockResolvedValueOnce(make200Response('{"translations":{"p1":"Xin chao"}}'));
    globalThis.fetch = fetchWithRetryAfter;
    const service = new OpenAICompatibleService(makeConfig());
    const promise = startTranslate(service, new Map([['p1', 'Hello']]));
    await flushTimers();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.translations.get('p1')).toBe('Xin chao');
    expect(fetchWithRetryAfter).toHaveBeenCalledTimes(2);

    // Without Retry-After: 2 failed + 1 success = 3 calls.
    const fetchNoRetryAfter = vi.fn()
      .mockResolvedValueOnce(make429Response())
      .mockResolvedValueOnce(make429Response())
      .mockResolvedValueOnce(make200Response('{"translations":{"p1":"Xin chao"}}'));
    globalThis.fetch = fetchNoRetryAfter;
    const promise2 = startTranslate(new OpenAICompatibleService(makeConfig()), new Map([['p1', 'Hello']]));
    await flushTimers();
    const result2 = await promise2;

    expect(result2.success).toBe(true);
    expect(result2.translations.get('p1')).toBe('Xin chao');
    expect(fetchNoRetryAfter).toHaveBeenCalledTimes(3);
  });

});
