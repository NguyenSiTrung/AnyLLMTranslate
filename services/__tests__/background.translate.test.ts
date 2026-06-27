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

  it('skips LLM entirely when all pieces are cached', async () => {
    // Arrange — cache returns hits for every piece
    getCachedTranslation.mockImplementation(async (text: string) => {
      const map: Record<string, string> = {
        'Hello': 'Xin chào (cached)',
        'World': 'Thế giới (cached)',
      };
      return map[text] ?? null;
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    // Act
    const result = await handleMessage(
      buildMsg([
        { id: 'p1', text: 'Hello' },
        { id: 'p2', text: 'World' },
      ]),
      fakeSender,
    ) as { success: boolean; results: Array<{ id: string; translatedText: string }> };

    // Assert
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.results).toEqual(
      expect.arrayContaining([
        { id: 'p1', translatedText: 'Xin chào (cached)' },
        { id: 'p2', translatedText: 'Thế giới (cached)' },
      ]),
    );
  });

  it('sends all pieces to LLM when none are cached and writes back', async () => {
    // Arrange — no cache hits
    getCachedTranslation.mockResolvedValue(null);
    mockFetchTranslation({ translations: { p1: 'Xin chào', p2: 'Thế giới' } });

    // Act
    const result = await handleMessage(
      buildMsg([
        { id: 'p1', text: 'Hello' },
        { id: 'p2', text: 'World' },
      ]),
      fakeSender,
    ) as { success: boolean; results: Array<{ id: string; translatedText: string }> };

    // Assert — LLM was called
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.results).toEqual(
      expect.arrayContaining([
        { id: 'p1', translatedText: 'Xin chào' },
        { id: 'p2', translatedText: 'Thế giới' },
      ]),
    );
    // Write-back should happen for each uncached piece
    expect(cacheTranslation).toHaveBeenCalledWith('Hello', 'Xin chào', 'en', 'vi');
    expect(cacheTranslation).toHaveBeenCalledWith('World', 'Thế giới', 'en', 'vi');
  });

  it('sends only uncached pieces to LLM when some are cached (mixed)', async () => {
    // Arrange — p1 cached, p2 not
    getCachedTranslation.mockImplementation(async (text: string) =>
      text === 'Hello' ? 'Xin chào (cached)' : null,
    );
    mockFetchTranslation({ translations: { p2: 'Thế giới' } });

    // Act
    const result = await handleMessage(
      buildMsg([
        { id: 'p1', text: 'Hello' },
        { id: 'p2', text: 'World' },
      ]),
      fakeSender,
    ) as { success: boolean; results: Array<{ id: string; translatedText: string }> };

    // Assert — LLM called but only for uncached piece
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalled();
    // The body should NOT contain 'Hello' since it was cached
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string })?.body) as {
      messages: Array<{ content: string }>;
    };
    expect(body.messages[1].content).not.toContain('Hello');
    expect(body.messages[1].content).toContain('World');

    expect(result.success).toBe(true);
    expect(result.results).toEqual(
      expect.arrayContaining([
        { id: 'p1', translatedText: 'Xin chào (cached)' },
        { id: 'p2', translatedText: 'Thế giới' },
      ]),
    );
  });

  it('preserves piece id mapping correctly in merged response', async () => {
    // Arrange — all uncached
    getCachedTranslation.mockResolvedValue(null);
    mockFetchTranslation({
      translations: { 'unique-id-abc': 'Dịch 1', 'unique-id-def': 'Dịch 2' },
    });

    // Act
    const result = await handleMessage(
      buildMsg([
        { id: 'unique-id-abc', text: 'Text A' },
        { id: 'unique-id-def', text: 'Text B' },
      ]),
      fakeSender,
    ) as { success: boolean; results: Array<{ id: string; translatedText: string }> };

    // Assert — IDs preserved
    const ids = result.results.map((r) => r.id);
    expect(ids).toContain('unique-id-abc');
    expect(ids).toContain('unique-id-def');
  });
});

// ── Web-page prompt regression guard ──────────────────────────────────────────
// Sub-project: subtitle profiles & profile-driven prompt. The subtitle path now
// routes to buildSubtitleSystemPrompt via subtitleKnobs. This guard verifies the
// WEB-PAGE translate path is unaffected: it still uses buildSystemPrompt and
// honors settings.customSystemPrompt, and never emits the subtitle identity.
describe('handleTranslate — web-page prompt unchanged by subtitle profiles', () => {
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

  it('uses buildSystemPrompt with customSystemPrompt and not the subtitle prompt', async () => {
    // Seed a custom web-page system prompt in settings.
    mockStorage['anyllm-translate-settings'] = {
      customSystemPrompt:
        'WEB CUSTOM MARKER {{targetLanguage}}. {{glossary}} Respond with JSON {"translations": {}}.',
    };
    mockFetchTranslation({ translations: { p1: 'Xin chào' } });

    await handleMessage(buildMsg([{ id: 'p1', text: 'Hello' }]), fakeSender);

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
      messages: Array<{ role: string; content: string }>;
    };
    const systemPrompt = body.messages[0].content;

    // Web custom prompt is honored.
    expect(systemPrompt).toContain('WEB CUSTOM MARKER');
    // Subtitle prompt must NOT leak into the web path.
    expect(systemPrompt).not.toContain('subtitle translator');
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

  it('surfaces a { success: false } result when the pool is empty (no fetch attempted)', async () => {
    // Seed settings with an empty providers pool (all keys disabled).
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
          keys: [{ id: 'k1', apiKey: 'sk-1', maxRpm: 0, enabled: false }],
        },
      ],
    };
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = (await handleMessage(
      buildMsg([{ id: 'p1', text: 'Hello' }]),
      fakeSender,
    )) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('surfaces an error when all slots return auth failures (all-open)', async () => {
    // Two keys, both 401 → the coordinator exhausts the pool and throws.
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
            { id: 'k1', apiKey: 'sk-1', maxRpm: 0, enabled: true },
            { id: 'k2', apiKey: 'sk-2', maxRpm: 0, enabled: true },
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

    const result = (await handleMessage(
      buildMsg([{ id: 'p1', text: 'Hello' }]),
      fakeSender,
    )) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
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

  it('does not write a back-filled (source==translated) piece to cache', async () => {
    // LLM returns ONLY p1's translation and omits p2. The service back-fills p2
    // with its own source text ("World") and sets partial=true.
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
  });

  it('caches normally-translated pieces even when the chunk is partial', async () => {
    // Same partial response, but assert the TRANSLATED piece (p1) IS cached.
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
          keys: [{ id: 'k1', apiKey: '', maxRpm: 0, enabled: true }],
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
          keys: [{ id: 'k1', apiKey: '', maxRpm: 60, enabled: true }],
        },
      ],
    };
    await handleMessage(buildMsg([{ id: 'p1', text: 'World' }]), fakeSender);
    const rebuildsAfterSecond = rebuildSpy.mock.calls.length;
    expect(rebuildsAfterSecond).toBeGreaterThan(rebuildsAfterFirst);

    rebuildSpy.mockRestore();
  });
});
