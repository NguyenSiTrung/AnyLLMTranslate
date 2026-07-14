/**
 * AC1 / NFR-1: real OpenAICompatibleService failover through the pool.
 *
 * Stub round-robin / single-key paths live in providerPool.test.ts — this file
 * only keeps the production-contract integration that would catch swallowed 429s.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProviderPoolCoordinator } from '../providerPool';
import { OpenAICompatibleService } from '../openaiCompatible';
import type { ExtensionSettings } from '@/types/config';
import { DEFAULT_SETTINGS } from '@/types/config';

describe('AC1/NFR-1: real OpenAICompatibleService failover (mocked fetch)', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    OpenAICompatibleService.__set429DelaysForTest(true);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    OpenAICompatibleService.__set429DelaysForTest(false);
  });

  function failingK1Fetch() {
    return vi.fn(async (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const auth = new Headers(init?.headers).get('Authorization') ?? '';
      if (auth.includes('sk-1')) {
        return new Response('{"error":{"message":"rate limited"}}', {
          status: 429,
          statusText: 'Too Many Requests',
        });
      }
      return new Response(
        JSON.stringify({
          id: 'chatcmpl-test',
          choices: [
            {
              message: { role: 'assistant', content: '{"translations":{"p1":"Xin chào"}}' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
        {
          status: 200,
          statusText: 'OK',
          headers: { 'Content-Type': 'application/json' },
        },
      );
    });
  }

  function twoKeyRealSettings(): ExtensionSettings {
    return {
      ...DEFAULT_SETTINGS,
      providers: [
        {
          id: 'p1',
          displayName: 'P1',
          baseUrl: 'https://shared-endpoint/v1',
          model: 'm',
          requiresApiKey: true,
          temperature: 0.3,
          maxTokens: 4096,
          enabled: true,
          keys: [
            { id: 'k1', apiKey: 'sk-1', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true },
            { id: 'k2', apiKey: 'sk-2', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true },
          ],
        },
      ],
    };
  }

  it('a real-service 429 from k1 opens the breaker, fails over to k2, and later skips k1', async () => {
    globalThis.fetch = failingK1Fetch();
    const coord = new ProviderPoolCoordinator({ clock: () => 5_000_000 });
    coord.rebuild(twoKeyRealSettings());

    const result = await coord.translate({
      texts: new Map([['p1', 'Hello']]),
      sourceLanguage: 'en',
      targetLanguage: 'vi',
    });

    expect(result.success).toBe(true);
    expect(result.translations.get('p1')).toBe('Xin chào');
    expect(coord.getKeyStatus('k1').open).toBe(true);
    expect(coord.getKeyStatus('k1').openUntil).toBeGreaterThan(5_000_000);
    expect(coord.getKeyStatus('k2').open).toBe(false);

    const fetchSpy = globalThis.fetch as ReturnType<typeof vi.fn>;
    const callsBefore = fetchSpy.mock.calls.length;

    const r2 = await coord.translate({
      texts: new Map([['p1', 'World']]),
      sourceLanguage: 'en',
      targetLanguage: 'vi',
    });
    expect(r2.success).toBe(true);
    expect(r2.translations.get('p1')).toBe('Xin chào');
    expect(fetchSpy.mock.calls.length).toBe(callsBefore + 1);
    const lastInit = fetchSpy.mock.calls[callsBefore]![1] as { headers: Record<string, string> };
    expect(lastInit.headers['Authorization']).toContain('sk-2');
  });
});
