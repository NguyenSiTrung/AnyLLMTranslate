/**
 * Integration tests: all translation paths route through the coordinator and
 * round-robin engages across two mocked keys (AC-6).
 *
 * Rather than mock the full background message router (heavy), these tests
 * exercise the ProviderPoolCoordinator directly with two stubbed member
 * services and assert that EACH delegated method (translate, testConnection,
 * detectPageCategory, classifyPdfParagraphs) round-robins across k1/k2 on
 * sequential calls. This proves the single-seam property: every translation
 * path that calls initService() gets the coordinator, and the coordinator
 * distributes requests across the pool.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProviderPoolCoordinator } from '../providerPool';
import type { TranslationService } from '../base';
import type { TranslationRequest, TranslationResult } from '@/types/translation';
import type { PageContext, ExtensionSettings } from '@/types/config';
import type { ClassifyPdfParagraphsResult } from '@/types/messages';
import { DEFAULT_SETTINGS } from '@/types/config';

/** A stub that tags every result with the keyId it dispatched from. */
function makeTaggingStub(keyId: string): TranslationService & { callCount: number } {
  let count = 0;
  return {
    callCount: 0,
    async translate(request: TranslationRequest): Promise<TranslationResult> {
      count++;
      this.callCount = count;
      // Tag the translation so we can see which key produced it.
      const translations = new Map<string, string>();
      for (const [id, text] of request.texts) {
        translations.set(id, `${text}|via-${keyId}`);
      }
      return { success: true, translations };
    },
    async testConnection() {
      count++;
      this.callCount = count;
      return { success: true };
    },
    async detectPageCategory(_pageContext: PageContext) {
      count++;
      this.callCount = count;
      return { success: true, category: `cat-${keyId}` };
    },
    async classifyPdfParagraphs(_paragraphs: Array<{ id: string; text: string }>) {
      count++;
      this.callCount = count;
      return { success: true, labels: { p1: keyId as 'prose' | 'figure' } } as ClassifyPdfParagraphsResult;
    },
  };
}

function twoKeySettings(): ExtensionSettings {
  return {
    ...DEFAULT_SETTINGS,
    providers: [
      {
        id: 'p1',
        displayName: 'P1',
        baseUrl: 'https://a/v1',
        model: 'm',
        requiresApiKey: true,
        temperature: 0.3,
        maxTokens: 4096,
        enabled: true,
        keys: [
          { id: 'k1', apiKey: 'sk-1', maxRpm: 0, enabled: true },
          { id: 'k2', apiKey: 'sk-2', maxRpm: 0, enabled: true },
        ],
      },
    ],
  };
}

describe('ProviderPoolCoordinator — single-seam integration (AC-6)', () => {
  let clockNow: number;
  let k1Stub: ReturnType<typeof makeTaggingStub>;
  let k2Stub: ReturnType<typeof makeTaggingStub>;

  beforeEach(() => {
    clockNow = 5_000_000;
    k1Stub = makeTaggingStub('k1');
    k2Stub = makeTaggingStub('k2');
  });

  function buildCoordinator(): ProviderPoolCoordinator {
    const coord = new ProviderPoolCoordinator({
      clock: () => clockNow,
      serviceFactory: (_config, identity) =>
        identity.keyId === 'k1' ? k1Stub : k2Stub,
    });
    coord.rebuild(twoKeySettings());
    return coord;
  }

  it('page-translate path: round-robins k1 → k2 → k1', async () => {
    const coord = buildCoordinator();
    const mk = () =>
      ({
        texts: new Map([['p1', 'hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      }) as TranslationRequest;

    const r1 = await coord.translate(mk());
    const r2 = await coord.translate(mk());
    const r3 = await coord.translate(mk());

    expect(r1.translations.get('p1')).toBe('hello|via-k1');
    expect(r2.translations.get('p1')).toBe('hello|via-k2');
    expect(r3.translations.get('p1')).toBe('hello|via-k1');
  });

  it('testConnection path: round-robins across keys', async () => {
    const coord = buildCoordinator();
    await coord.testConnection();
    await coord.testConnection();
    await coord.testConnection();
    expect(k1Stub.callCount).toBe(2);
    expect(k2Stub.callCount).toBe(1);
  });

  it('detectPageCategory path: round-robins across keys', async () => {
    const coord = buildCoordinator();
    const ctx: PageContext = { title: 't', description: 'd', domain: 'x.com' };
    const r1 = await coord.detectPageCategory(ctx);
    const r2 = await coord.detectPageCategory(ctx);
    expect(r1.category).toBe('cat-k1');
    expect(r2.category).toBe('cat-k2');
  });

  it('classifyPdfParagraphs path: round-robins across keys', async () => {
    const coord = buildCoordinator();
    const paras = [{ id: 'p1', text: 'hi' }];
    const r1 = await coord.classifyPdfParagraphs(paras);
    const r2 = await coord.classifyPdfParagraphs(paras);
    expect(r1.labels?.p1).toBe('k1');
    expect(r2.labels?.p1).toBe('k2');
  });

  it('mixed calls share the same rotation cursor (cross-path round-robin)', async () => {
    // A realistic mix: translate, then a category detect, then another translate.
    // The cursor advances per logical request regardless of method, so the pool
    // distributes load evenly across ALL translation paths combined.
    const coord = buildCoordinator();
    await coord.translate({ texts: new Map([['p1', 'a']]), sourceLanguage: 'en', targetLanguage: 'vi' }); // k1
    await coord.detectPageCategory({ title: 't', description: '', domain: '' }); // k2
    await coord.translate({ texts: new Map([['p2', 'b']]), sourceLanguage: 'en', targetLanguage: 'vi' }); // k1

    expect(k1Stub.callCount).toBe(2);
    expect(k2Stub.callCount).toBe(1);
  });

  it('failover still works under the integrated path: k1 429 → k2 success', async () => {
    const coord = buildCoordinator();
    // Make k1 throw on its FIRST call only by overriding translate.
    const origK1Translate = k1Stub.translate.bind(k1Stub);
    let k1FirstCall = true;
    k1Stub.translate = async (req) => {
      if (k1FirstCall) {
        k1FirstCall = false;
        throw new (class extends Error {
          statusCode = 429;
          name = 'ApiError';
        })('rate limited');
      }
      return origK1Translate(req);
    };

    const result = await coord.translate({
      texts: new Map([['p1', 'hello']]),
      sourceLanguage: 'en',
      targetLanguage: 'vi',
    });

    // k1 was tried (and failed), k2 succeeded.
    expect(result.success).toBe(true);
    expect(result.translations.get('p1')).toBe('hello|via-k2');
  });

  it('a coordinator with one enabled key behaves like a single-provider (no rotation skew)', async () => {
    // Backward-compat: a migrated single-provider user has exactly one key, so
    // every call dispatches to it. No round-robin alternation, no failover target.
    const settings: ExtensionSettings = {
      ...DEFAULT_SETTINGS,
      providers: [
        {
          id: 'p1',
          displayName: 'P1',
          baseUrl: 'https://a/v1',
          model: 'm',
          requiresApiKey: true,
          temperature: 0.3,
          maxTokens: 4096,
          enabled: true,
          keys: [{ id: 'k1', apiKey: 'sk-1', maxRpm: 0, enabled: true }],
        },
      ],
    };
    const coord = new ProviderPoolCoordinator({
      clock: () => clockNow,
      serviceFactory: () => k1Stub,
    });
    coord.rebuild(settings);

    await coord.translate({ texts: new Map([['p1', 'a']]), sourceLanguage: 'en', targetLanguage: 'vi' });
    await coord.translate({ texts: new Map([['p2', 'b']]), sourceLanguage: 'en', targetLanguage: 'vi' });

    expect(k1Stub.callCount).toBe(2);
    expect(k2Stub.callCount).toBe(0);
  });
});

/**
 * AC1 / NFR-1: the integration test that would have caught the original bug.
 *
 * Uses the REAL {@link OpenAICompatibleService} (via the default factory — no
 * throwing stub) with a mocked `global.fetch` keyed on the request URL. Key 1's
 * endpoint returns 429; key 2's returns 200. The assertions:
 *  - the FIRST request fails over from k1 (429 → breaker opens) to k2 and
 *    succeeds;
 *  - k1's breaker is open immediately after (getKeyStatus);
 *  - the NEXT request skips k1 (it's open) and goes straight to k2.
 *
 * Before the FR-1 fix, `translate()` swallowed the 429 into `{success:false}`
 * and the pool called `recordSuccess()` + returned the failure — circuit
 * breaker never opened, no failover. This test asserts the production contract.
 */
describe('AC1/NFR-1: real OpenAICompatibleService failover (mocked fetch)', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  /**
   * Mock fetch that returns 429 when the request carries k1's API key
   * (Authorization: Bearer sk-1) and 200-JSON otherwise. In a real multi-key
   * pool, the keys differ by credential, not endpoint URL — so we discriminate
   * on the Authorization header, exactly as the production service sends it.
   */
  function failingK1Fetch() {
    return vi.fn(async (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const auth = new Headers(init?.headers).get('Authorization') ?? '';
      if (auth.includes('sk-1')) {
        return new Response('{"error":{"message":"rate limited"}}', {
          status: 429,
          statusText: 'Too Many Requests',
        });
      }
      // Any other key (k2) → success.
      return new Response(JSON.stringify({
        id: 'chatcmpl-test',
        choices: [
          {
            message: { role: 'assistant', content: '{"translations":{"p1":"Xin chào"}}' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }), {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'application/json' },
      });
    });
  }

  /** Two keys under one provider (same endpoint, different credentials) — the
   *  realistic multi-key setup. */
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
            { id: 'k1', apiKey: 'sk-1', maxRpm: 0, enabled: true },
            { id: 'k2', apiKey: 'sk-2', maxRpm: 0, enabled: true },
          ],
        },
      ],
    };
  }

  it('a real-service 429 from k1 opens the breaker and fails over to k2', async () => {
    globalThis.fetch = failingK1Fetch();
    const coord = new ProviderPoolCoordinator({ clock: () => 5_000_000 });
    coord.rebuild(twoKeyRealSettings());

    const result = await coord.translate({
      texts: new Map([['p1', 'Hello']]),
      sourceLanguage: 'en',
      targetLanguage: 'vi',
    });

    // Failover succeeded: result came from k2.
    expect(result.success).toBe(true);
    expect(result.translations.get('p1')).toBe('Xin chào');

    // k1's breaker is now OPEN (429 → rateLimit cooldown 60s, openUntil > now).
    const k1Status = coord.getKeyStatus('k1');
    expect(k1Status.open).toBe(true);
    expect(k1Status.openUntil).toBeGreaterThan(5_000_000);

    // k2 stayed healthy.
    expect(coord.getKeyStatus('k2').open).toBe(false);
  });

  it('the next request skips the open k1 and dispatches straight to k2', async () => {
    globalThis.fetch = failingK1Fetch();
    const coord = new ProviderPoolCoordinator({ clock: () => 5_000_000 });
    coord.rebuild(twoKeyRealSettings());

    // First request: k1 429 → failover to k2.
    await coord.translate({
      texts: new Map([['p1', 'Hello']]),
      sourceLanguage: 'en',
      targetLanguage: 'vi',
    });

    const fetchSpy = globalThis.fetch as ReturnType<typeof vi.fn>;
    const callsBefore = fetchSpy.mock.calls.length;

    // Second request: k1 is open, so the cursor should land on k2 only.
    const r2 = await coord.translate({
      texts: new Map([['p1', 'World']]),
      sourceLanguage: 'en',
      targetLanguage: 'vi',
    });
    expect(r2.success).toBe(true);
    expect(r2.translations.get('p1')).toBe('Xin chào');

    // Exactly one fetch this request (k1 was skipped — no wasted 429 call).
    expect(fetchSpy.mock.calls.length).toBe(callsBefore + 1);
    // And that single call carried k2's credential.
    const lastInit = fetchSpy.mock.calls[callsBefore][1] as { headers: Record<string, string> };
    expect(lastInit.headers['Authorization']).toContain('sk-2');
  });
});

