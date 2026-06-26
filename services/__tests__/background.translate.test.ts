/**
 * Tests: handleTranslate — cache split/merge behaviour (FR-1)
 *
 * Phase 2 of cache-hardening_20260415.
 * These tests verify that the page translation pipeline checks cache
 * for each piece, sends only uncached pieces to LLM, and merges results.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleMessage } from '../background';

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
