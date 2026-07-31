/**
 * Tests: handleTranslate — cache split/merge behaviour (FR-1)
 *
 * Phase 2 of cache-hardening_20260415.
 * These tests verify that the page translation pipeline checks cache
 * for each piece, sends only uncached pieces to LLM, and merges results.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleMessage, __resetTranslationServiceForTest, __resetSettingsCacheForTest } from '../background';
import { ProviderPoolCoordinator } from '../providerPool';

// ── Shared mock state ───────────────────────────────────────────────────────
const mockStorage: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: mockStorage[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
      }),
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  runtime: { sendMessage: vi.fn().mockResolvedValue(undefined) },
  tabs: { onRemoved: { addListener: vi.fn() } },
  alarms: {
    create: vi.fn(),
    get: vi.fn(),
    clear: vi.fn(),
    onAlarm: { addListener: vi.fn(), removeListener: vi.fn() },
  },
});

// ── Module-level mocks (hoisted) ─────────────────────────────────────────────
vi.mock('@/services/cacheManager', () => ({
  getCachedTranslation: vi.fn(),
  cacheTranslation: vi.fn().mockResolvedValue(undefined),
  // FR-4: negative-cache functions default to no-op / miss so existing cache
  // split/merge tests are unaffected.
  getCachedFailure: vi.fn().mockResolvedValue(null),
  cacheFailure: vi.fn().mockResolvedValue(undefined),
  deleteCachedFailure: vi.fn().mockResolvedValue(undefined),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────
function mockFetchTranslation(responseBody: object) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          id: 'test',
          choices: [
            {
              message: { role: 'assistant', content: JSON.stringify(responseBody) },
              finish_reason: 'stop',
            },
          ],
        }),
      text: () => Promise.resolve(''),
    }),
  );
}

const buildMsg = (pieces: Array<{ id: string; text: string }>) => ({
  action: 'translate' as const,
  pieces,
  sourceLanguage: 'en',
  targetLanguage: 'vi',
});

const fakeSender = {} as chrome.runtime.MessageSender;

// ── Tests ────────────────────────────────────────────────────────────────────
describe('handleTranslate — cache split/merge (FR-1)', () => {
  let getCachedTranslation: ReturnType<typeof vi.fn>;
  let cacheTranslation: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    delete mockStorage['anyllm-translate-settings'];
    vi.clearAllMocks();
    // Reset the cached pool coordinator (FR-1 made breakers open on real
    // failures; the singleton's cooldowns would otherwise leak across tests).
    __resetTranslationServiceForTest();
    // FR-6: reset the decrypted-settings/signature cache too.
    __resetSettingsCacheForTest();
    const mod = await import('@/services/cacheManager');
    getCachedTranslation = mod.getCachedTranslation as ReturnType<typeof vi.fn>;
    cacheTranslation = mod.cacheTranslation as ReturnType<typeof vi.fn>;
  });

  it('splits/merges cache hits across all-cached, none-cached, and mixed scenarios', async () => {
    // Scenario 1: all pieces cached → skip LLM entirely.
    getCachedTranslation.mockImplementation(async (text: string) => {
      const map: Record<string, string> = {
        'Hello': 'Xin chào (cached)',
        'World': 'Thế giới (cached)',
      };
      return map[text] ?? null;
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const allCached = await handleMessage(
      buildMsg([
        { id: 'p1', text: 'Hello' },
        { id: 'p2', text: 'World' },
      ]),
      fakeSender,
    ) as { success: boolean; results: Array<{ id: string; translatedText: string }> };

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(allCached.success).toBe(true);
    expect(allCached.results).toEqual(
      expect.arrayContaining([
        { id: 'p1', translatedText: 'Xin chào (cached)' },
        { id: 'p2', translatedText: 'Thế giới (cached)' },
      ]),
    );

    // Scenario 2: none cached → all pieces sent to LLM and written back.
    getCachedTranslation.mockResolvedValue(null);
    mockFetchTranslation({ translations: { p1: 'Xin chào', p2: 'Thế giới' } });

    const noneCached = await handleMessage(
      buildMsg([
        { id: 'p1', text: 'Hello' },
        { id: 'p2', text: 'World' },
      ]),
      fakeSender,
    ) as { success: boolean; results: Array<{ id: string; translatedText: string }> };

    const fetchMockNone = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMockNone).toHaveBeenCalled();
    expect(noneCached.success).toBe(true);
    expect(noneCached.results).toEqual(
      expect.arrayContaining([
        { id: 'p1', translatedText: 'Xin chào' },
        { id: 'p2', translatedText: 'Thế giới' },
      ]),
    );
    // Write-back should happen for each uncached piece
    // FR-6: trailing modelId + fingerprint args (fingerprint may be set from defaults)
    expect(cacheTranslation).toHaveBeenCalledWith(
      'Hello',
      'Xin chào',
      'en',
      'vi',
      undefined,
      expect.anything(),
    );
    expect(cacheTranslation).toHaveBeenCalledWith(
      'World',
      'Thế giới',
      'en',
      'vi',
      undefined,
      expect.anything(),
    );

    // Scenario 3: mixed — only uncached pieces are sent to the LLM.
    getCachedTranslation.mockImplementation(async (text: string) =>
      text === 'Hello' ? 'Xin chào (cached)' : null,
    );
    mockFetchTranslation({ translations: { p2: 'Thế giới' } });

    const mixed = await handleMessage(
      buildMsg([
        { id: 'p1', text: 'Hello' },
        { id: 'p2', text: 'World' },
      ]),
      fakeSender,
    ) as { success: boolean; results: Array<{ id: string; translatedText: string }> };

    const fetchMockMixed = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMockMixed).toHaveBeenCalled();
    // The body should NOT contain 'Hello' since it was cached
    const body = JSON.parse((fetchMockMixed.mock.calls[0][1] as { body: string })?.body) as {
      messages: Array<{ content: string }>;
    };
    expect(body.messages[1].content).not.toContain('Hello');
    expect(body.messages[1].content).toContain('World');

    expect(mixed.success).toBe(true);
    expect(mixed.results).toEqual(
      expect.arrayContaining([
        { id: 'p1', translatedText: 'Xin chào (cached)' },
        { id: 'p2', translatedText: 'Thế giới' },
      ]),
    );
  });
});

describe('handleTranslate — empty-pool / all-open error surfacing', () => {
  let getCachedTranslation: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    delete mockStorage['anyllm-translate-settings'];
    vi.clearAllMocks();
    // FR-6: reset the cached decrypted settings + pool signature so a prior
    // test's pool config doesn't leak (the cache now persists across calls).
    __resetTranslationServiceForTest();
    __resetSettingsCacheForTest();
    const mod = await import('@/services/cacheManager');
    getCachedTranslation = mod.getCachedTranslation as ReturnType<typeof vi.fn>;
    getCachedTranslation.mockResolvedValue(null); // force LLM path
  });

  it('surfaces failures when pool is empty, all slots 401, or all slots 429', async () => {
    // Scenario 1: empty pool → { success: false } with no fetch attempted.
    mockStorage['anyllm-translate-settings'] = {
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
          keys: [{ id: 'k1', apiKey: 'sk-1', maxRpm: 0, concurrencyLimit: 0, interval: 0,enabled: false }],
        },
      ],
    };
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    let result = (await handleMessage(
      buildMsg([{ id: 'p1', text: 'Hello' }]),
      fakeSender,
    )) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();

    // Scenario 2: all slots return auth failures (all-open).
    __resetTranslationServiceForTest();
    __resetSettingsCacheForTest();
    mockStorage['anyllm-translate-settings'] = {
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
            { id: 'k1', apiKey: 'sk-1', maxRpm: 0, concurrencyLimit: 0, interval: 0,enabled: true },
            { id: 'k2', apiKey: 'sk-2', maxRpm: 0, concurrencyLimit: 0, interval: 0,enabled: true },
          ],
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve(JSON.stringify({ error: { message: 'Invalid API key' } })),
      }),
    );

    result = (await handleMessage(
      buildMsg([{ id: 'p1', text: 'Hello' }]),
      fakeSender,
    )) as { success: boolean; error?: string; retryAfter?: number };

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    // Auth opens for 1h — surface absolute openUntil so UI can countdown.
    expect(result.retryAfter).toBeTypeOf('number');
    expect(result.retryAfter!).toBeGreaterThan(Date.now());

    // Scenario 3: all slots are rate-limited (429 cooling).
    __resetTranslationServiceForTest();
    __resetSettingsCacheForTest();
    const { OpenAICompatibleService } = await import('@/services/openaiCompatible');
    OpenAICompatibleService.__set429DelaysForTest(true);
    try {
      mockStorage['anyllm-translate-settings'] = {
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
              { id: 'k1', apiKey: 'sk-1', maxRpm: 0, concurrencyLimit: 0, interval: 0, enabled: true },
            ],
          },
        ],
      };
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: new Headers(),
          text: () => Promise.resolve(JSON.stringify({ error: { message: 'Rate limited' } })),
        }),
      );

      result = (await handleMessage(
        buildMsg([{ id: 'p1', text: 'Hello' }]),
        fakeSender,
      )) as { success: boolean; error?: string; retryAfter?: number };

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/cooling|rate-limit/i);
      expect(result.retryAfter).toBeTypeOf('number');
      expect(result.retryAfter!).toBeGreaterThan(Date.now());
      // First rate-limit cooldown ladder is 60s.
      expect(result.retryAfter! - Date.now()).toBeLessThanOrEqual(60_000 + 5_000);
    } finally {
      OpenAICompatibleService.__set429DelaysForTest(false);
    }
  });
});

// FR-7 (fixes #9): the page path must NOT cache a partial back-fill. When the
// LLM omits an ID, the service back-fills it with the source text and flags
// `partial`. Caching source-as-translation would poison future lookups.
describe('handleTranslate — FR-7: do not cache partial back-fills', () => {
  let cacheTranslation: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    delete mockStorage['anyllm-translate-settings'];
    vi.clearAllMocks();
    __resetTranslationServiceForTest();
    const mod = await import('@/services/cacheManager');
    const getCached = mod.getCachedTranslation as ReturnType<typeof vi.fn>;
    getCached.mockResolvedValue(null); // cache miss for all pieces
    cacheTranslation = mod.cacheTranslation as ReturnType<typeof vi.fn>;
  });

  it('does not cache back-filled pieces but still caches translated pieces in a partial chunk', async () => {
    // Phase 1: LLM returns ONLY p1's translation and omits p2. The service
    // back-fills p2 with its own source text ("World") and sets partial=true.
    mockFetchTranslation({ translations: { p1: 'Xin chào' } });

    const result = (await handleMessage(
      buildMsg([
        { id: 'p1', text: 'Hello' },
        { id: 'p2', text: 'World' },
      ]),
      fakeSender,
    )) as { success: boolean; results?: Array<{ id: string; translatedText: string }> };

    expect(result.success).toBe(true);
    // p1 was translated (cached), p2 was back-filled with source (NOT cached).
    const cachedTexts = cacheTranslation.mock.calls.map(
      (c: unknown[]) => c[0] as string,
    );
    expect(cachedTexts).toContain('Hello'); // p1 cached
    expect(cachedTexts).not.toContain('World'); // p2 back-fill NOT cached

    // p2's result still carries the back-filled source so nothing is lost.
    const p2 = result.results?.find((r) => r.id === 'p2');
    expect(p2?.translatedText).toBe('World');

    // Phase 2: same partial response — assert the TRANSLATED piece (p1) IS
    // cached (exactly one cache write).
    cacheTranslation.mockClear();
    mockFetchTranslation({ translations: { p1: 'Xin chào' } });

    await handleMessage(
      buildMsg([
        { id: 'p1', text: 'Hello' },
        { id: 'p2', text: 'World' },
      ]),
      fakeSender,
    );

    const cacheCalls = cacheTranslation.mock.calls;
    // Exactly one cache write (p1 only — p2 back-fill skipped).
    expect(cacheCalls.length).toBe(1);
    expect((cacheCalls[0] as unknown[])[1]).toBe('Xin chào'); // translated text
  });
});

// FR-6 (fixes #7/#8, AC6): the hot translate path must NOT re-run the pool
// rebuild (or the AES-GCM decrypt loop) when settings are unchanged between
// calls. Signature-based dirty tracking skips rebuild; memoized decrypted
// settings skip the decrypt.
describe('handleTranslate — FR-6: hot-path dirty tracking', () => {
  beforeEach(async () => {
    delete mockStorage['anyllm-translate-settings'];
    vi.clearAllMocks();
    __resetTranslationServiceForTest();
    __resetSettingsCacheForTest();
    const mod = await import('@/services/cacheManager');
    const getCached = mod.getCachedTranslation as ReturnType<typeof vi.fn>;
    getCached.mockResolvedValue(null); // cache miss → forces the LLM/initService path
  });

  it('does NOT rebuild the pool on the second translate when settings are unchanged', async () => {
    mockFetchTranslation({ translations: { p1: 'Xin chào' } });

    const rebuildSpy = vi.spyOn(ProviderPoolCoordinator.prototype, 'rebuild');

    // First translate: pool is built (rebuild called once on first init).
    await handleMessage(buildMsg([{ id: 'p1', text: 'Hello' }]), fakeSender);
    const rebuildsAfterFirst = rebuildSpy.mock.calls.length;
    expect(rebuildsAfterFirst).toBeGreaterThanOrEqual(1);

    // Second translate: settings unchanged → rebuild must NOT be called again.
    await handleMessage(buildMsg([{ id: 'p1', text: 'World' }]), fakeSender);
    const rebuildsAfterSecond = rebuildSpy.mock.calls.length;
    expect(rebuildsAfterSecond).toBe(rebuildsAfterFirst);

    rebuildSpy.mockRestore();
  });

  it('rebuilds when a pool-relevant setting changes between translates', async () => {
    mockFetchTranslation({ translations: { p1: 'Xin chào' } });
    const rebuildSpy = vi.spyOn(ProviderPoolCoordinator.prototype, 'rebuild');

    // First translate with one provider.
    mockStorage['anyllm-translate-settings'] = {
      providers: [
        {
          id: 'p1', displayName: 'P1', baseUrl: 'https://a/v1', model: 'm',
          requiresApiKey: false, temperature: 0.3, maxTokens: 4096, enabled: true,
          keys: [{ id: 'k1', apiKey: '', maxRpm: 0, concurrencyLimit: 0, interval: 0,enabled: true }],
        },
      ],
    };
    await handleMessage(buildMsg([{ id: 'p1', text: 'Hello' }]), fakeSender);
    const rebuildsAfterFirst = rebuildSpy.mock.calls.length;

    // Change a pool-relevant field (maxRpm) → invalidate + rebuild.
    __resetSettingsCacheForTest(); // simulate onSettingsChange invalidation
    mockStorage['anyllm-translate-settings'] = {
      providers: [
        {
          id: 'p1', displayName: 'P1', baseUrl: 'https://a/v1', model: 'm',
          requiresApiKey: false, temperature: 0.3, maxTokens: 4096, enabled: true,
          keys: [{ id: 'k1', apiKey: '', maxRpm: 60, concurrencyLimit: 0, interval: 0,enabled: true }],
        },
      ],
    };
    await handleMessage(buildMsg([{ id: 'p1', text: 'World' }]), fakeSender);
    const rebuildsAfterSecond = rebuildSpy.mock.calls.length;
    expect(rebuildsAfterSecond).toBeGreaterThan(rebuildsAfterFirst);

    rebuildSpy.mockRestore();
  });
});

describe('handleTranslate — FR-4 negative-cache + forced-retry bypass', () => {
  let getCachedFailure: ReturnType<typeof vi.fn>;
  let deleteCachedFailure: ReturnType<typeof vi.fn>;
  let getCachedTranslation: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    delete mockStorage['anyllm-translate-settings'];
    // Enable the failure cache for this suite.
    mockStorage['anyllm-translate-settings'] = { enableFailureCache: true, failureCacheTtlMinutes: 120 };
    vi.clearAllMocks();
    __resetTranslationServiceForTest();
    __resetSettingsCacheForTest();
    const mod = await import('@/services/cacheManager');
    getCachedFailure = mod.getCachedFailure as ReturnType<typeof vi.fn>;
    deleteCachedFailure = mod.deleteCachedFailure as ReturnType<typeof vi.fn>;
    getCachedTranslation = mod.getCachedTranslation as ReturnType<typeof vi.fn>;
    // Success cache always misses so the failure cache is the deciding factor.
    getCachedTranslation.mockResolvedValue(null);
  });

  it('short-circuits to a failed result when a failure is cached (no skipFailureCache)', async () => {
    getCachedFailure.mockResolvedValue('Failed to parse translation response as JSON');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await handleMessage(
      buildMsg([{ id: 'p1', text: 'Hello' }]),
      fakeSender,
    ) as { success: boolean; failed?: Array<{ id: string; error: string }> };

    // Cached failure short-circuits — LLM is never called.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getCachedFailure).toHaveBeenCalledTimes(1);
    expect(result.failed).toEqual([{ id: 'p1', error: 'Failed to parse translation response as JSON' }]);
  });

  it('bypasses + clears the failure cache on a forced retry (skipFailureCache: true)', async () => {
    // Even though a failure is cached, the retry must ignore it.
    getCachedFailure.mockResolvedValue('Failed to parse translation response as JSON');
    // Provide a valid LLM response so the retry succeeds.
    mockFetchTranslation({ translations: { p1: 'Xin chào' } });

    const result = await handleMessage(
      { ...buildMsg([{ id: 'p1', text: 'Hello' }]), skipFailureCache: true },
      fakeSender,
    ) as { success: boolean; results?: Array<{ id: string; translatedText: string }>; failed?: unknown[] };

    // The failure cache is bypassed (not consulted) ...
    expect(getCachedFailure).not.toHaveBeenCalled();
    // ... and the stale entry is cleared so a fresh success isn't shadowed.
    // FR-6: delete also receives modelId + fingerprint
    expect(deleteCachedFailure).toHaveBeenCalledWith(
      'Hello',
      'en',
      'vi',
      undefined,
      expect.anything(),
    );
    // The LLM is actually called and the retry succeeds.
    expect(result.success).toBe(true);
    expect(result.results).toEqual([{ id: 'p1', translatedText: 'Xin chào' }]);
    expect(result.failed ?? []).toEqual([]);
  });
});

describe('handleTranslate — inArticleContext batch partitioning (FR-3)', () => {
  let getCachedTranslation: ReturnType<typeof vi.fn>;
  let getCachedFailure: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    delete mockStorage['anyllm-translate-settings'];
    vi.clearAllMocks();
    __resetTranslationServiceForTest();
    __resetSettingsCacheForTest();
    const mod = await import('@/services/cacheManager');
    getCachedTranslation = mod.getCachedTranslation as ReturnType<typeof vi.fn>;
    getCachedFailure = mod.getCachedFailure as ReturnType<typeof vi.fn>;
    getCachedTranslation.mockResolvedValue(null);
    getCachedFailure.mockResolvedValue(null);
  });

  it('partitions in-article and out-of-article pieces into separate LLM requests', async () => {
    const pieces = [
      { id: 'a1', text: 'Article intro paragraph.', inArticleContext: true },
      { id: 'a2', text: 'Article body paragraph.', inArticleContext: true },
      { id: 'a3', text: 'Article conclusion.', inArticleContext: true },
      { id: 's1', text: 'Sidebar link one', inArticleContext: false },
      { id: 's2', text: 'Sidebar link two', inArticleContext: false },
    ];

    // Use a single response covering all piece IDs
    mockFetchTranslation({
      translations: {
        a1: 'T-Article intro', a2: 'T-Article body', a3: 'T-Article conclusion',
        s1: 'T-Sidebar one', s2: 'T-Sidebar two',
      },
    });

    const result = await handleMessage(
      { action: 'translate' as const, pieces, sourceLanguage: 'en', targetLanguage: 'vi' },
      fakeSender,
    ) as { success: boolean; results: Array<{ id: string; translatedText: string }> };

    expect(result.success).toBe(true);
    expect(result.results.length).toBe(5);

    // Inspect fetch calls — each call's body contains the piece IDs sent
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalled();
    const calls = fetchMock.mock.calls;
    expect(calls.length).toBe(2); // two separate LLM requests

    // Extract piece IDs from each request body
    const getIdsFromCall = (call: unknown[]): string[] => {
      const init = call[1] as RequestInit;
      const body = JSON.parse(init.body as string);
      const userMsg = body.messages?.find((m: { role: string }) => m.role === 'user');
      if (!userMsg) return [];
      // User content is "Translate the following texts...\n\n{json}"
      const jsonStart = (userMsg.content as string).indexOf('{');
      if (jsonStart === -1) return [];
      const jsonStr = (userMsg.content as string).slice(jsonStart);
      return Object.keys(JSON.parse(jsonStr));
    };

    const firstCallIds = getIdsFromCall(calls[0]);
    const secondCallIds = getIdsFromCall(calls[1]);

    // One call should have only article IDs, the other only sidebar IDs
    const articleIds = ['a1', 'a2', 'a3'];
    const sidebarIds = ['s1', 's2'];

    const firstIsArticle = firstCallIds.includes('a1');
    if (firstIsArticle) {
      expect(firstCallIds).toEqual(expect.arrayContaining(articleIds));
      expect(firstCallIds).not.toContain('s1');
      expect(secondCallIds).toEqual(expect.arrayContaining(sidebarIds));
      expect(secondCallIds).not.toContain('a1');
    } else {
      expect(firstCallIds).toEqual(expect.arrayContaining(sidebarIds));
      expect(firstCallIds).not.toContain('a1');
      expect(secondCallIds).toEqual(expect.arrayContaining(articleIds));
      expect(secondCallIds).not.toContain('s1');
    }

    // Folded scenario: pieces with inArticleContext undefined go into the
    // out-of-article group (single batch).
    mockFetchTranslation({ translations: { p1: 'T-One', p2: 'T-Two' } });

    const undefinedResult = await handleMessage(
      {
        action: 'translate' as const,
        pieces: [
          { id: 'p1', text: 'Plain text one.' },
          { id: 'p2', text: 'Plain text two.' },
        ],
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      },
      fakeSender,
    ) as { success: boolean; results: Array<{ id: string; translatedText: string }> };

    expect(undefinedResult.success).toBe(true);
    // All pieces in one batch (out-of-article group, since flag is undefined)
    const fetchMockUndefined = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMockUndefined.mock.calls.length).toBe(1);
    expect(undefinedResult.results.length).toBe(2);
  });

  it('dedup is shared across both groups (same text in article + sidebar)', async () => {
    const pieces = [
      { id: 'a1', text: 'Shared text.', inArticleContext: true },
      { id: 's1', text: 'Shared text.', inArticleContext: false },
    ];

    mockFetchTranslation({ translations: { a1: 'T-Shared' } });

    const result = await handleMessage(
      { action: 'translate' as const, pieces, sourceLanguage: 'en', targetLanguage: 'vi' },
      fakeSender,
    ) as { success: boolean; results: Array<{ id: string; translatedText: string }> };

    expect(result.success).toBe(true);
    // Only 1 LLM call — dedup removed the duplicate before partitioning
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls.length).toBe(1);
    // Both pieces get translations (one from LLM, one re-hydrated from dedup)
    expect(result.results.length).toBe(2);
    expect(result.results.every((r) => r.translatedText === 'T-Shared')).toBe(true);
  });
});

// ── Parallel sub-batches (web-translate-v3 FR-7) ────────────────────────────
describe('handleTranslate — parallel sub-batches', () => {
  let getCachedTranslation: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    delete mockStorage['anyllm-translate-settings'];
    vi.clearAllMocks();
    __resetTranslationServiceForTest();
    __resetSettingsCacheForTest();
    const mod = await import('@/services/cacheManager');
    getCachedTranslation = mod.getCachedTranslation as ReturnType<typeof vi.fn>;
    getCachedTranslation.mockResolvedValue(null);
  });

  it('issues ≥2 concurrent LLM calls when multiple batches exist', async () => {
    // Force many small batches: max 1 piece + low char budget → one piece per request.
    // concurrencyLimit must be 0 (unlimited per-key) so sub-batch parallelism is
    // not serialized by the default safe-key throttle (concurrencyLimit: 1).
    // safeKeyThrottleMigrated: true prevents loadSettings from upgrading 0 → 1.
    mockStorage['anyllm-translate-settings'] = {
      maxTextGroupLengthPerRequest: 1,
      maxTextLengthPerRequest: 50,
      safeKeyThrottleMigrated: true,
      providers: [
        {
          id: 'p1',
          displayName: 'Test',
          baseUrl: 'https://api.example.com/v1',
          model: 'test-model',
          requiresApiKey: false,
          temperature: 0.3,
          maxTokens: 4096,
          requestTimeoutMs: 60000,
          enabled: true,
          keys: [
            {
              id: 'k1',
              apiKey: 'sk-test',
              maxRpm: 0,
              concurrencyLimit: 0,
              interval: 0,
              enabled: true,
            },
          ],
        },
      ],
    };

    let concurrent = 0;
    let maxConcurrent = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 40));
        concurrent--;

        // Echo ids from the user message as identity translations.
        const body = JSON.parse((init?.body as string) ?? '{}') as {
          messages: Array<{ role: string; content: string }>;
        };
        const userMsg = body.messages?.find((m) => m.role === 'user');
        const content = userMsg?.content ?? '';
        const jsonStart = content.indexOf('{');
        const ids =
          jsonStart >= 0
            ? Object.keys(JSON.parse(content.slice(jsonStart)) as Record<string, string>)
            : [];
        const translations: Record<string, string> = {};
        for (const id of ids) translations[id] = `T-${id}`;

        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'test',
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: JSON.stringify({ translations }),
                },
                finish_reason: 'stop',
              },
            ],
          }),
          text: async () => '',
        };
      }),
    );

    const pieces = [
      { id: 'p1', text: 'Paragraph one unique.' },
      { id: 'p2', text: 'Paragraph two unique.' },
      { id: 'p3', text: 'Paragraph three unique.' },
      { id: 'p4', text: 'Paragraph four unique.' },
    ];

    const result = (await handleMessage(
      { action: 'translate' as const, pieces, sourceLanguage: 'en', targetLanguage: 'vi' },
      fakeSender,
    )) as { success: boolean; results: Array<{ id: string }> };

    expect(result.success).toBe(true);
    expect(result.results.length).toBe(4);
    // With concurrency cap ≥2 and 4 serial-would-be batches, peak in-flight ≥ 2.
    expect(maxConcurrent).toBeGreaterThanOrEqual(2);
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(4);
  });
});
