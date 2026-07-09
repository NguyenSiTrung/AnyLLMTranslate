import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleMessage,
  __resetSemaphoreForTest,
  __resetTranslationServiceForTest,
  __resetSettingsCacheForTest,
} from '../background';
import { getStatsV2, resetStats } from '../statsCollector';

const mockStorage: Record<string, unknown> = {};
/** Per-store maps so stats prune cannot delete translation cache keys (mirrors real multi-DB IDB). */
const idbStores = new Map<string, Map<string, unknown>>();

function storeMap(store?: { name?: string } | string): Map<string, unknown> {
  const name =
    typeof store === 'string'
      ? store
      : store && typeof store === 'object' && 'name' in store
        ? String(store.name)
        : '__default__';
  let m = idbStores.get(name);
  if (!m) {
    m = new Map();
    idbStores.set(name, m);
  }
  return m;
}

function clearAllIdb(): void {
  for (const m of idbStores.values()) m.clear();
}

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: mockStorage[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
      }),
      remove: vi.fn(async (key: string) => {
        delete mockStorage[key];
      }),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  runtime: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
  },
  tabs: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    onRemoved: { addListener: vi.fn() },
  },
  alarms: {
    create: vi.fn(),
    get: vi.fn(),
    clear: vi.fn(),
    onAlarm: { addListener: vi.fn(), removeListener: vi.fn() },
  },
});

vi.mock('idb-keyval', () => ({
  createStore: vi.fn((dbName: string, storeName: string) => ({
    name: `${dbName}::${storeName}`,
  })),
  get: vi.fn(async (key: string, store?: { name?: string }) => storeMap(store).get(key)),
  set: vi.fn(async (key: string, value: unknown, store?: { name?: string }) => {
    storeMap(store).set(key, value);
  }),
  del: vi.fn(async (key: string, store?: { name?: string }) => {
    storeMap(store).delete(key);
  }),
  entries: vi.fn(async (store?: { name?: string }) => [...storeMap(store).entries()]),
  clear: vi.fn(async (store?: { name?: string }) => {
    storeMap(store).clear();
  }),
}));

vi.mock('@/services/subtitleNameScanner', () => ({
  preScanNames: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/services/filmGlossaryStore', () => ({
  loadFilmGlossary: vi.fn().mockResolvedValue(undefined),
  saveFilmGlossary: vi.fn().mockResolvedValue(undefined),
  FILM_GLOSSARY_STORAGE_KEY: 'anyllm-film-glossary',
}));

function mockFetch(content: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () =>
        Promise.resolve({
          id: 'test',
          choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
        }),
      text: () => Promise.resolve(''),
    }),
  );
}

function baseProviderSettings(extra: Record<string, unknown> = {}) {
  return {
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
    selectionDictionaryEnabled: true,
    glossary: [],
    customSystemPrompt: null,
    ...extra,
  };
}

describe('handleTranslateSelection — dictionary mode', () => {
  beforeEach(async () => {
    delete mockStorage['anyllm-translate-settings'];
    for (const k of Object.keys(mockStorage)) {
      if (k.includes('stats') || k.includes('anyllm-translate-stats')) delete mockStorage[k];
    }
    clearAllIdb();
    await new Promise((r) => setTimeout(r, 10));
    __resetSemaphoreForTest();
    __resetTranslationServiceForTest();
    __resetSettingsCacheForTest();
  });

  it('returns dictionary payload when dictionaryMode is true and model returns JSON', async () => {
    mockStorage['anyllm-translate-settings'] = baseProviderSettings();
    const dictJson = JSON.stringify({
      phonetic: '/həˈloʊ/',
      definitions: [{ pos: 'excl.', meaning: 'xin chào', example: { source: 'Hello!', target: 'Xin chào!' } }],
      translation: 'xin chào',
      contextual_analysis: 'Lời chào thông dụng.',
    });
    mockFetch(dictJson);

    const result = (await handleMessage(
      {
        action: 'translateSelection',
        text: 'hello',
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        dictionaryMode: true,
        contextText: 'She said hello to me.',
      },
      { tab: { id: 1 } } as chrome.runtime.MessageSender,
    )) as {
      success: boolean;
      mode?: string;
      translatedText?: string;
      dictionary?: { phonetic?: string; translation?: string };
    };

    expect(result.success).toBe(true);
    expect(result.mode).toBe('dictionary');
    expect(result.translatedText).toBe('xin chào');
    expect(result.dictionary?.phonetic).toBe('/həˈloʊ/');
    expect(result.dictionary?.translation).toBe('xin chào');

    // Dictionary system prompt (not page prompt) should be used
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.messages[0].content).toContain('dictionary');
    expect(body.messages[0].content).toContain('She said hello to me.');
    expect(body.messages[1].content).toContain('hello');
  });

  it('plain path when dictionaryMode is omitted (hover/inline safety)', async () => {
    mockStorage['anyllm-translate-settings'] = baseProviderSettings();
    mockFetch(JSON.stringify({ translations: { selection: 'xin chào' } }));

    const result = (await handleMessage(
      {
        action: 'translateSelection',
        text: 'hello',
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      },
      { tab: { id: 1 } } as chrome.runtime.MessageSender,
    )) as { success: boolean; mode?: string; translatedText?: string; dictionary?: unknown };

    expect(result.success).toBe(true);
    expect(result.mode).toBe('sentence');
    expect(result.translatedText).toBe('xin chào');
    expect(result.dictionary).toBeUndefined();
  });

  it('falls back to sentence when settings.selectionDictionaryEnabled is false', async () => {
    mockStorage['anyllm-translate-settings'] = baseProviderSettings({
      selectionDictionaryEnabled: false,
    });
    mockFetch(JSON.stringify({ translations: { selection: 'xin chào' } }));

    const result = (await handleMessage(
      {
        action: 'translateSelection',
        text: 'hello',
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        dictionaryMode: true,
      },
      { tab: { id: 1 } } as chrome.runtime.MessageSender,
    )) as { success: boolean; mode?: string; dictionary?: unknown };

    expect(result.success).toBe(true);
    expect(result.mode).toBe('sentence');
    expect(result.dictionary).toBeUndefined();
  });

  it('fail-open: invalid JSON still returns translatedText', async () => {
    mockStorage['anyllm-translate-settings'] = baseProviderSettings();
    mockFetch('not valid json at all — just a freeform translation: chào');

    const result = (await handleMessage(
      {
        action: 'translateSelection',
        text: 'hello',
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        dictionaryMode: true,
      },
      { tab: { id: 1 } } as chrome.runtime.MessageSender,
    )) as { success: boolean; mode?: string; translatedText?: string; dictionary?: unknown };

    expect(result.success).toBe(true);
    expect(result.mode).toBe('sentence');
    expect(result.translatedText).toBeTruthy();
    expect(result.dictionary).toBeUndefined();
  });

  it('dictionary and plain cache keys do not collide', async () => {
    mockStorage['anyllm-translate-settings'] = baseProviderSettings();

    // First: plain sentence cache write
    mockFetch(JSON.stringify({ translations: { selection: 'plain-vi' } }));
    await handleMessage(
      {
        action: 'translateSelection',
        text: 'hello',
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      },
      { tab: { id: 1 } } as chrome.runtime.MessageSender,
    );

    // Second: dictionary mode should call LLM (not hit plain cache)
    const dictJson = JSON.stringify({
      phonetic: '/həˈloʊ/',
      translation: 'dict-vi',
      definitions: [{ pos: 'n.', meaning: 'lời chào' }],
    });
    mockFetch(dictJson);
    const dictResult = (await handleMessage(
      {
        action: 'translateSelection',
        text: 'hello',
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        dictionaryMode: true,
      },
      { tab: { id: 1 } } as chrome.runtime.MessageSender,
    )) as { mode?: string; translatedText?: string };

    expect(dictResult.mode).toBe('dictionary');
    expect(dictResult.translatedText).toBe('dict-vi');

    // Plain path still returns plain-vi from its own cache
    const plainAgain = (await handleMessage(
      {
        action: 'translateSelection',
        text: 'hello',
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      },
      { tab: { id: 1 } } as chrome.runtime.MessageSender,
    )) as { mode?: string; translatedText?: string };

    expect(plainAgain.mode).toBe('sentence');
    expect(plainAgain.translatedText).toBe('plain-vi');
  });

  it('records cacheHits (not apiCalls) on selection sentence cache hit', async () => {
    mockStorage['anyllm-translate-settings'] = baseProviderSettings();
    await resetStats();

    mockFetch(JSON.stringify({ translations: { selection: 'xin chào' } }));
    await handleMessage(
      {
        action: 'translateSelection',
        text: 'hello',
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      },
      { tab: { id: 1, url: 'https://news.example.com/a' } } as chrome.runtime.MessageSender,
    );

    await vi.waitFor(async () => {
      const stats = await getStatsV2();
      expect(stats.lifetime.apiCalls).toBe(1);
      expect(stats.lifetime.characters).toBe(5);
    });

    // Cache hit — no second LLM call
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const callsBefore = fetchMock.mock.calls.length;
    const result = (await handleMessage(
      {
        action: 'translateSelection',
        text: 'hello',
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      },
      { tab: { id: 1, url: 'https://news.example.com/a' } } as chrome.runtime.MessageSender,
    )) as { success: boolean; translatedText?: string; mode?: string };

    expect(result.success).toBe(true);
    expect(result.mode).toBe('sentence');
    expect(result.translatedText).toBe('xin chào');
    expect(fetchMock.mock.calls.length).toBe(callsBefore);

    await vi.waitFor(async () => {
      const stats = await getStatsV2();
      expect(stats.lifetime.cacheHits).toBe(1);
      expect(stats.lifetime.cacheCharacters).toBe(5);
      // Pure cache hit must not inflate LLM counters.
      expect(stats.lifetime.apiCalls).toBe(1);
      expect(stats.lifetime.characters).toBe(5);
      expect(stats.lifetime.selectionEvents).toBe(2);
    });
  });

  it('records cacheHits (not apiCalls) on selection dictionary cache hit', async () => {
    mockStorage['anyllm-translate-settings'] = baseProviderSettings();
    await resetStats();

    const dictJson = JSON.stringify({
      phonetic: '/həˈloʊ/',
      definitions: [{ pos: 'excl.', meaning: 'xin chào' }],
      translation: 'xin chào',
      contextual_analysis: 'Greeting.',
    });
    mockFetch(dictJson);
    await handleMessage(
      {
        action: 'translateSelection',
        text: 'hello',
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        dictionaryMode: true,
      },
      { tab: { id: 1, url: 'https://news.example.com/a' } } as chrome.runtime.MessageSender,
    );

    await vi.waitFor(async () => {
      const stats = await getStatsV2();
      expect(stats.lifetime.apiCalls).toBe(1);
    });

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const callsBefore = fetchMock.mock.calls.length;
    const result = (await handleMessage(
      {
        action: 'translateSelection',
        text: 'hello',
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        dictionaryMode: true,
      },
      { tab: { id: 1, url: 'https://news.example.com/a' } } as chrome.runtime.MessageSender,
    )) as { success: boolean; mode?: string; translatedText?: string };

    expect(result.success).toBe(true);
    expect(result.mode).toBe('dictionary');
    expect(result.translatedText).toBe('xin chào');
    expect(fetchMock.mock.calls.length).toBe(callsBefore);

    await vi.waitFor(async () => {
      const stats = await getStatsV2();
      expect(stats.lifetime.cacheHits).toBe(1);
      expect(stats.lifetime.cacheCharacters).toBe(5);
      expect(stats.lifetime.apiCalls).toBe(1);
      expect(stats.lifetime.characters).toBe(5);
    });
  });
});
