/**
 * Tests: handleTranslateSubtitle — per-film proper-noun pre-scan integration.
 *
 * Sub-project 3. Asserts: pre-scan runs on cache miss, persists, is skipped on
 * cache hit, degrades gracefully on failure, and never touches the web path.
 *
 * Kept in a separate file from background.test.ts because these tests use
 * hoisted vi.mock() of the new modules (subtitleNameScanner, filmGlossaryStore),
 * which is cleaner isolated from the existing file's module-level chrome mock.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleMessage } from '../background';

// Storage backing shared by the chrome.storage.local stub.
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
  runtime: { sendMessage: vi.fn().mockResolvedValue(undefined), id: 'test-ext' },
  tabs: { onRemoved: { addListener: vi.fn() }, sendMessage: vi.fn() },
  alarms: {
    create: vi.fn(),
    get: vi.fn(),
    clear: vi.fn(),
    onAlarm: { addListener: vi.fn(), removeListener: vi.fn() },
  },
});

vi.mock('@/services/cacheManager', () => ({
  getCachedTranslation: vi.fn().mockResolvedValue(null),
  cacheTranslation: vi.fn().mockResolvedValue(undefined),
  evictCache: vi.fn(),
  clearCache: vi.fn(),
  flushLruUpdates: vi.fn(),
}));
vi.mock('@/services/statsCollector', () => ({
  incrementStats: vi.fn().mockResolvedValue(undefined),
  recordDailyStats: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/services/debugLog', () => ({
  invalidateDebugCache: vi.fn(),
  isDebugLoggingEnabled: vi.fn().mockReturnValue(false),
}));

// Mock the three new modules so we can assert call order without a real LLM.
// vi.hoisted() ensures the mock fns exist when the hoisted vi.mock() factories
// run (vi.mock is hoisted above all top-level const declarations).
const { preScanNamesMock, loadFilmGlossaryMock, saveFilmGlossaryMock } = vi.hoisted(() => ({
  preScanNamesMock: vi.fn(),
  loadFilmGlossaryMock: vi.fn(),
  saveFilmGlossaryMock: vi.fn(),
}));
vi.mock('@/services/subtitleNameScanner', () => ({ preScanNames: preScanNamesMock }));
vi.mock('@/services/filmGlossaryStore', () => ({
  loadFilmGlossary: loadFilmGlossaryMock,
  saveFilmGlossary: saveFilmGlossaryMock,
  FILM_GLOSSARY_STORAGE_KEY: 'anyllm-film-glossary',
}));

// Settings the background reads on startup.
mockStorage['anyllm-translate-settings'] = {
  provider: {
    preset: 'custom',
    baseUrl: 'http://localhost:11434/v1',
    apiKey: '',
    model: 'gemma3:4b',
    temperature: 0.3,
    maxTokens: 4096,
    displayName: 'Ollama',
    requiresApiKey: false,
  },
  sourceLanguage: 'en',
  targetLanguage: 'vi',
  glossary: [],
  cacheTTLDays: 7,
  customSystemPrompt: null,
};

const subtitleCues = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    startTime: i,
    endTime: i + 1,
    text: `line ${i}`,
  }));

const fakeSender = (tabId = 99) =>
  ({ tab: { id: tabId } }) as chrome.runtime.MessageSender;

/** Make fetch return a canned chunk-translation JSON (no properNouns needed). */
function mockFetchChunkTranslation() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          id: 'x',
          choices: [
            {
              message: {
                role: 'assistant',
                content: '{"translations": {"s1": "x"}}',
              },
              finish_reason: 'stop',
            },
          ],
        }),
      text: () => Promise.resolve(''),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  preScanNamesMock.mockReset();
  loadFilmGlossaryMock.mockReset();
  saveFilmGlossaryMock.mockReset();
});

describe('handleTranslateSubtitle — per-film pre-scan integration', () => {
  it('runs preScanNames on a storage miss and persists the result', async () => {
    loadFilmGlossaryMock.mockResolvedValue(undefined); // miss
    preScanNamesMock.mockResolvedValue({ Dumbledore: 'Phù thủy' });
    mockFetchChunkTranslation();

    const res = await handleMessage(
      {
        action: 'translateSubtitle',
        cues: subtitleCues(3),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        profile: 'cinematic',
      } as any,
      fakeSender(),
    );

    expect(res.success).toBe(true);
    expect(preScanNamesMock).toHaveBeenCalledTimes(1);
    expect(saveFilmGlossaryMock).toHaveBeenCalledTimes(1);
    // saveFilmGlossary(hash, glossary)
    expect(saveFilmGlossaryMock.mock.calls[0][1]).toEqual({ Dumbledore: 'Phù thủy' });
  });

  it('skips preScanNames on a storage hit (cache hit)', async () => {
    loadFilmGlossaryMock.mockResolvedValue({ Dumbledore: 'Phù thủy' }); // hit
    mockFetchChunkTranslation();

    const res = await handleMessage(
      {
        action: 'translateSubtitle',
        cues: subtitleCues(3),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        profile: 'cinematic',
      } as any,
      fakeSender(),
    );

    expect(res.success).toBe(true);
    expect(preScanNamesMock).not.toHaveBeenCalled();
    expect(saveFilmGlossaryMock).not.toHaveBeenCalled();
  });

  it('degrades gracefully when preScanNames throws (still success)', async () => {
    loadFilmGlossaryMock.mockResolvedValue(undefined);
    preScanNamesMock.mockRejectedValue(new Error('network down'));
    mockFetchChunkTranslation();

    const res = await handleMessage(
      {
        action: 'translateSubtitle',
        cues: subtitleCues(3),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        profile: 'cinematic',
      } as any,
      fakeSender(),
    );

    expect(res.success).toBe(true);
    // On failure we do not persist.
    expect(saveFilmGlossaryMock).not.toHaveBeenCalled();
  });

  it('does not touch film-glossary storage on the web translate path', async () => {
    mockFetchChunkTranslation();
    await handleMessage(
      {
        action: 'translate',
        pieces: [{ id: 'p1', text: 'hello' }],
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      } as any,
      fakeSender(),
    );
    expect(loadFilmGlossaryMock).not.toHaveBeenCalled();
    expect(preScanNamesMock).not.toHaveBeenCalled();
  });
});
