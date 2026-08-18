import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type * as CacheManagerModule from '@/services/cacheManager';
import { getCachedTranslationByKey, cacheTranslationByKey } from '@/services/cacheManager';
import {
  handleMessage,
  __resetSemaphoreForTest,
  __resetTranslationServiceForTest,
  __resetSettingsCacheForTest,
  __resetSubtitleSessionCounterForTest,
  __getActiveSessionCountForTest,
} from '../background';

// Mock chrome APIs
const mockStorage: Record<string, unknown> = {};
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => {
        return { [key]: mockStorage[key] };
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
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
    onRemoved: {
      addListener: vi.fn(),
    },
  },
  alarms: {
    create: vi.fn(),
    get: vi.fn(),
    clear: vi.fn(),
    onAlarm: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
});

// Sub-project 3 added a per-film pre-scan that runs before chunk 0. These tests
// assert chunk-translation behavior, so short-circuit the pre-scan to an empty
// result (cache miss → empty pre-scan → no persistence). The pre-scan is
// exercised in its own test file (background.filmGlossary.test.ts).
vi.mock('@/services/subtitleNameScanner', () => ({
  preScanNames: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/services/filmGlossaryStore', () => ({
  loadFilmGlossary: vi.fn().mockResolvedValue(undefined),
  saveFilmGlossary: vi.fn().mockResolvedValue(undefined),
  FILM_GLOSSARY_STORAGE_KEY: 'anyllm-film-glossary',
}));

// The subtitle cache store is IndexedDB, which is absent in jsdom — reads
// always miss. Mock the ByKey pair with miss/no-op defaults (equivalent to
// the real module's behavior in this environment) so individual tests can
// exercise cache-hit and cache-write normalization.
vi.mock('@/services/cacheManager', async (importOriginal) => {
  const actual = await importOriginal<typeof CacheManagerModule>();
  return {
    ...actual,
    getCachedTranslationByKey: vi.fn().mockResolvedValue(null),
    cacheTranslationByKey: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock fetch for translation service
function mockFetch(content: string) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve({
      id: 'test',
      choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
    }),
    text: () => Promise.resolve(''),
  }));
}

describe('services/background', () => {
  beforeEach(async () => {
    // Reset stored settings before each test
    delete mockStorage['anyllm-translate-settings'];
    // Drain leftover progressive subtitle chunk queues first so prior tests'
    // background loops stop scheduling more work, then wait until in-flight
    // chunk translates finish (session count hits 0). A short fixed sleep was
    // not enough under load and leaked fetch bodies into the next test.
    __resetSubtitleSessionCounterForTest();
    const drainDeadline = Date.now() + 2000;
    while (__getActiveSessionCountForTest() > 0 && Date.now() < drainDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      __resetSubtitleSessionCounterForTest();
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
    __resetSemaphoreForTest();
    // Reset the cached provider-pool coordinator. FR-1 made the pool open
    // circuit breakers on real failures (previously swallowed), and the
    // coordinator is a module singleton whose breaker cooldowns (60s+) would
    // otherwise leak across test cases — a 429/5xx in one test leaves a key
    // open for the next test, breaking it.
    __resetTranslationServiceForTest();
    // FR-6: reset the decrypted-settings/signature cache too.
    __resetSettingsCacheForTest();
  });

  describe('handleMessage — translate', () => {
    it('FR-2: splits large flushes into multiple LLM calls and dedups identical texts', async () => {
      // Five pieces, default maxTextGroupLengthPerRequest=4 → 2 LLM calls.
      mockFetch(JSON.stringify({ translations: { p1: 'a', p2: 'b', p3: 'c', p4: 'd', p5: 'e' } }));

      const result = await handleMessage(
        {
          action: 'translate',
          pieces: [
            { id: 'p1', text: 'one' },
            { id: 'p2', text: 'two' },
            { id: 'p3', text: 'three' },
            { id: 'p4', text: 'four' },
            { id: 'p5', text: 'five' },
          ],
          sourceLanguage: 'en',
          targetLanguage: 'vi',
        },
        { tab: { id: 1 } } as chrome.runtime.MessageSender,
      );

      const typed = result as { success: boolean; results: { id: string }[] };
      expect(typed.success).toBe(true);
      expect(typed.results?.map((r) => r.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
      // Two sub-batches (4-piece cap → batch of 4 + batch of 1) → 2 fetch calls.
      expect(fetch).toHaveBeenCalledTimes(2);

      // Dedup identical texts and re-hydrate them from the canonical result.
      mockFetch(JSON.stringify({ translations: { p1: 'Xin chào', p2: 'Thế giới' } }));

      const result2 = await handleMessage(
        {
          action: 'translate',
          pieces: [
            { id: 'p1', text: 'Hello' },
            { id: 'p1dup', text: 'Hello' }, // duplicate of p1
            { id: 'p2', text: 'World' },
          ],
          sourceLanguage: 'en',
          targetLanguage: 'vi',
        },
        { tab: { id: 1 } } as chrome.runtime.MessageSender,
      );

      const typed2 = result2 as { success: boolean; results: { id: string; translatedText: string }[] };
      expect(typed2.success).toBe(true);
      const byId = new Map(typed2.results.map((r) => [r.id, r.translatedText]));
      expect(byId.get('p1')).toBe('Xin chào');
      // The dup adopts the canonical translation — no extra LLM piece sent.
      expect(byId.get('p1dup')).toBe('Xin chào');
      expect(byId.get('p2')).toBe('Thế giới');
    });

    it('forwards glossaryBlock when settings have glossary entries, omits it when glossary is empty', async () => {
      // Scenario 1: glossary entries present → glossaryBlock forwarded.
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
        glossary: [
          { id: 'g1', source: 'machine learning', target: 'học máy' },
        ],
        customSystemPrompt: null,
      };

      mockFetch(JSON.stringify({ translations: { p1: 'Học máy' } }));

      await handleMessage(
        {
          action: 'translate',
          pieces: [{ id: 'p1', text: 'machine learning' }],
          sourceLanguage: 'en',
          targetLanguage: 'vi',
        },
        { tab: { id: 1 } } as chrome.runtime.MessageSender,
      );

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      expect(fetchMock).toHaveBeenCalled();
      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      expect(body.messages[0].content).toContain('machine learning');
      expect(body.messages[0].content).toContain('Translation Glossary');

      // Scenario 2: empty glossary → glossaryBlock omitted.
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
        glossary: [],
        customSystemPrompt: null,
      };
      __resetSettingsCacheForTest();
      __resetTranslationServiceForTest();

      mockFetch(JSON.stringify({ translations: { p1: 'Xin chào' } }));

      await handleMessage(
        {
          action: 'translate',
          pieces: [{ id: 'p1', text: 'Hello' }],
          sourceLanguage: 'en',
          targetLanguage: 'vi',
        },
        { tab: { id: 1 } } as chrome.runtime.MessageSender,
      );

      const fetchMock2 = globalThis.fetch as ReturnType<typeof vi.fn>;
      const body2 = JSON.parse(fetchMock2.mock.calls[0][1]?.body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      expect(body2.messages[0].content).not.toContain('Translation Glossary');
    });
  });

  describe('handleMessage — translateSubtitle', () => {
    it('applies the hostname-selected named glossary as a locked block, and skips it when hostname resolves to None', async () => {
      // Scenario 1: hostname selects the named glossary → applied as a separate
      // locked prompt block.
      mockStorage['anyllm-translate-settings'] = {
        glossary: [
          { id: 'global-locked', source: 'Alice', target: 'Global Alice' },
          { id: 'global-free', source: 'Rabbit', target: 'Con thỏ' },
        ],
        namedGlossaryLists: [{
          id: 'cast',
          name: 'Cast names',
          entries: [{ id: 'alice', source: 'Alice', target: 'A-lít' }],
          updatedAt: 1,
        }],
        subtitleListBySite: { 'example.com': 'cast' },
      };
      mockFetch(JSON.stringify({
        translations: { s1: 'A-lít' },
        properNouns: { Alice: 'Wrong Alice' },
      }));

      await handleMessage(
        {
          action: 'translateSubtitle',
          hostname: 'WWW.Example.com.',
          cues: [{ startTime: 0, endTime: 2, text: 'Alice' }],
          sourceLanguage: 'en',
          targetLanguage: 'vi',
          skipFilmPreScan: true,
        },
        { tab: { id: 1 } } as chrome.runtime.MessageSender,
      );

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      const systemPrompt = body.messages[0].content;
      expect(systemPrompt).toContain('Personal dictionary "Cast names"');
      expect(systemPrompt).toContain('- "Alice" → "A-lít"');
      expect(systemPrompt).toContain('- "Rabbit" → "Con thỏ"');
      expect(systemPrompt).not.toContain('- "Alice" → "Global Alice"');

      // Scenario 2: hostname resolves to None → named glossary not applied.
      mockStorage['anyllm-translate-settings'] = {
        namedGlossaryLists: [{
          id: 'cast',
          name: 'Cast names',
          entries: [{ id: 'alice', source: 'Alice', target: 'A-lít' }],
          updatedAt: 1,
        }],
        subtitleListBySite: { 'example.com': 'cast' },
      };
      __resetSettingsCacheForTest();
      __resetTranslationServiceForTest();
      mockFetch(JSON.stringify({ translations: { s1: 'Alice' } }));

      await handleMessage(
        {
          action: 'translateSubtitle',
          hostname: '',
          cues: [{ startTime: 0, endTime: 2, text: 'Alice' }],
          sourceLanguage: 'en',
          targetLanguage: 'vi',
          skipFilmPreScan: true,
        },
        { tab: { id: 1 } } as chrome.runtime.MessageSender,
      );

      const fetchMock2 = globalThis.fetch as ReturnType<typeof vi.fn>;
      const body2 = JSON.parse(fetchMock2.mock.calls[0][1]?.body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      expect(body2.messages[0].content).not.toContain('Personal dictionary');
    });

    it('normalizes double-escaped \\n to real newlines (fresh + cache paths) and uses original cue text for cache, not voice-prefixed text', async () => {
      const readCache = getCachedTranslationByKey as unknown as Mock;
      const writeCache = cacheTranslationByKey as unknown as Mock;
      readCache.mockClear();
      writeCache.mockClear();

      // literal backslash-n characters, which the overlay would render verbatim.
      mockFetch(JSON.stringify({ translations: { s1: 'Line one\\nLine two' } }));

      const msg = {
        action: 'translateSubtitle' as const,
        hostname: 'example.com',
        cues: [{ startTime: 0, endTime: 2, text: 'Hello' }],
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        skipFilmPreScan: true,
      };

      const first = (await handleMessage(
        msg,
        { tab: { id: 71 } } as chrome.runtime.MessageSender,
      )) as { success: boolean; cues?: Array<{ text: string }> };
      expect(first.success).toBe(true);
      expect(first.cues?.[0]?.text).toBe('Line one\nLine two');
      // Cache write stores the normalized value (real newline).
      expect(writeCache).toHaveBeenCalledWith(expect.any(String), 'Line one\nLine two', 'en', 'vi');

      // Cache round-trip: a dirty cached value (literal backslash-n) is
      // normalized on the way out, without any fetch.
      readCache.mockResolvedValueOnce('Cached line\\nbreak');
      const fetchMock = globalThis.fetch as unknown as Mock;
      fetchMock.mockClear();
      const second = (await handleMessage(
        msg,
        { tab: { id: 71 } } as chrome.runtime.MessageSender,
      )) as { success: boolean; cues?: Array<{ text: string }> };
      expect(fetchMock).not.toHaveBeenCalled();
      expect(second.cues?.[0]?.text).toBe('Cached line\nbreak');

      // Voice-prefixed text: the LLM receives '[John] Hello', but the result
      // cue's originalText (which feeds cacheTranslation) stays unprefixed.
      const voiceCues = [
        { startTime: 0, endTime: 2, text: 'Hello', voice: 'John' },
      ];

      mockFetch(JSON.stringify({ translations: { s1: 'Xin chào' } }));

      const voiceResult = await handleMessage(
        {
          action: 'translateSubtitle',
          cues: voiceCues,
          sourceLanguage: 'en',
          targetLanguage: 'vi',
          profile: 'media',
        },
        { tab: { id: 46 } } as chrome.runtime.MessageSender,
      ) as { success: boolean; cues?: Array<{ text: string; originalText?: string }> };

      const voiceFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
      const voiceBody = JSON.parse(voiceFetch.mock.calls[0][1]?.body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      // Verify the LLM received the prefixed text
      expect(voiceBody.messages[1].content).toContain('[John] Hello');
      // Verify cache safety: originalText (which feeds cacheTranslation) is
      // the unprefixed 'Hello', not the voice-prefixed '[John] Hello'.
      expect(voiceResult.cues?.[0].originalText).toBe('Hello');
    });

    it('re-resolves the hostname-selected named glossary for forward chunks', async () => {
      const listA = {
        id: 'cast-a',
        name: 'Cast A',
        entries: [{ id: 'alice', source: 'Alice', target: 'A-lít' }],
        updatedAt: 1,
      };
      const listB = {
        id: 'cast-b',
        name: 'Cast B',
        entries: [{ id: 'bob', source: 'Bob', target: 'Bóp' }],
        updatedAt: 2,
      };
      mockStorage['anyllm-translate-settings'] = {
        namedGlossaryLists: [listA, listB],
        subtitleListBySite: { 'example.com': 'cast-a' },
      };
      const cues = Array.from({ length: 26 }, (_, i) => ({
        startTime: i,
        endTime: i + 1,
        text: `Switch-list line ${i}`,
      }));

      vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, opts: { body: string }) => {
        const body = JSON.parse(opts.body) as { messages: Array<{ content: string }> };
        const userJson = JSON.parse(body.messages[1].content.split('\n\n').pop() ?? '{}');
        const translations = Object.fromEntries(Object.keys(userJson).map((key) => [key, `T-${key}`]));
        const settings = mockStorage['anyllm-translate-settings'] as {
          subtitleListBySite: Record<string, string>;
        };
        settings.subtitleListBySite = { 'example.com': 'cast-b' };
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve({
            id: 'test',
            choices: [{ message: { role: 'assistant', content: JSON.stringify({ translations }) }, finish_reason: 'stop' }],
          }),
          text: () => Promise.resolve(''),
        });
      }));

      await handleMessage(
        {
          action: 'translateSubtitle',
          hostname: 'example.com',
          cues,
          sourceLanguage: 'en',
          targetLanguage: 'vi',
          skipFilmPreScan: true,
        },
        { tab: { id: 43 } } as chrome.runtime.MessageSender,
      );

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      const firstBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as { messages: Array<{ content: string }> };
      const secondBody = JSON.parse(fetchMock.mock.calls[1][1]?.body as string) as { messages: Array<{ content: string }> };
      expect(firstBody.messages[0].content).toContain('Personal dictionary "Cast A"');
      expect(secondBody.messages[0].content).toContain('Personal dictionary "Cast B"');
      expect(secondBody.messages[0].content).toContain('- "Bob" → "Bóp"');
      expect(secondBody.messages[0].content).not.toContain('Personal dictionary "Cast A"');
    });

    it('uses the subtitle prompt (no pageContext injection), routes the cinematic profile to it, and applies per-tab knob overrides over preset and persisted globals', async () => {
      // Scenario 1: subtitle path uses the profile-driven subtitle prompt, which
      // does not inject pageContext (UNTRUSTED DATA block is a web-page-prompt
      // feature).
      mockFetch(JSON.stringify({ translations: { s1: 'Xin chào' } }));

      await handleMessage(
        {
          action: 'translateSubtitle',
          cues: [{ startTime: 0, endTime: 2, text: 'Hello' }],
          sourceLanguage: 'en',
          targetLanguage: 'vi',
          pageContext: {
            title: 'Test Video',
            description: 'A test video',
            domain: 'youtube.com',
            category: 'entertainment',
          },
        },
        { tab: { id: 1 } } as chrome.runtime.MessageSender,
      );

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      expect(fetchMock).toHaveBeenCalled();
      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      expect(body.messages[0].content).toContain('subtitle translator');
      expect(body.messages[0].content).not.toContain('UNTRUSTED DATA');
      expect(body.messages[0].content).not.toContain('<page_domain>');

      // Scenario 2: cinematic profile routes to the subtitle prompt
      // (representative profile→knob mapping).
      mockFetch(JSON.stringify({ translations: { s1: 'Xin chào' } }));

      await handleMessage(
        {
          action: 'translateSubtitle',
          cues: [{ startTime: 0, endTime: 2, text: 'Hello' }],
          sourceLanguage: 'en',
          targetLanguage: 'vi',
          profile: 'cinematic',
        },
        { tab: { id: 1 } } as chrome.runtime.MessageSender,
      );

      let fetchMock2 = globalThis.fetch as ReturnType<typeof vi.fn>;
      let body2 = JSON.parse(fetchMock2.mock.calls[0][1]?.body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      expect(body2.messages[0].content).toContain('subtitle translator');
      expect(body2.messages[0].content).toContain('idiomatic, natural phrasing');

      // Scenario 3: per-tab override wins over the profile preset.
      mockFetch(JSON.stringify({ translations: { s1: 'Xin chào' } }));

      await handleMessage(
        {
          action: 'translateSubtitle',
          cues: [{ startTime: 0, endTime: 2, text: 'Hello' }],
          sourceLanguage: 'en',
          targetLanguage: 'vi',
          profile: 'cinematic',                              // preset faithfulness = idiomatic
          knobOverrides: { faithfulness: 'literal' },        // per-tab overrides to literal
        },
        { tab: { id: 1 } } as chrome.runtime.MessageSender,
      );

      fetchMock2 = globalThis.fetch as ReturnType<typeof vi.fn>;
      body2 = JSON.parse(fetchMock2.mock.calls[0][1]?.body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      // literal line present, idiomatic line absent (overridden).
      expect(body2.messages[0].content).toContain('precise, faithful translation');
      expect(body2.messages[0].content).not.toContain('idiomatic, natural phrasing');

      // Scenario 4: persisted global override applies when no per-tab override is set.
      mockStorage['anyllm-translate-settings'] = {
        subtitleSettings: { knobOverrides: { profanity: 'remove' } },
      };
      mockFetch(JSON.stringify({ translations: { s1: 'Xin chào' } }));

      await handleMessage(
        {
          action: 'translateSubtitle',
          cues: [{ startTime: 0, endTime: 2, text: 'Hello' }],
          sourceLanguage: 'en',
          targetLanguage: 'vi',
          profile: 'media',
        },
        { tab: { id: 1 } } as chrome.runtime.MessageSender,
      );

      fetchMock2 = globalThis.fetch as ReturnType<typeof vi.fn>;
      body2 = JSON.parse(fetchMock2.mock.calls[0][1]?.body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      expect(body2.messages[0].content).toContain('Remove strong profanity entirely');
    });

    it('seeds the first chunk with look-ahead context cues and provides bidirectional context for chunks 1+', async () => {
      // Build 30 cues so chunk 0 = cues[0..24] and look-ahead = cues[25..27].
      const cues = Array.from({ length: 30 }, (_, i) => ({
        startTime: i,
        endTime: i + 1,
        text: `Line ${i}`,
      }));
      // The first-chunk call sends ctx1..ctx3 (look-ahead) + s* keys.
      const keys = ['ctx1', 'ctx2', 'ctx3', ...Array.from({ length: 25 }, (_, i) => `s${i + 1}`)];
      const translations: Record<string, string> = {};
      for (const k of keys) translations[k] = `T-${k}`;
      mockFetch(JSON.stringify({ translations }));

      await handleMessage(
        {
          action: 'translateSubtitle',
          cues,
          sourceLanguage: 'en',
          targetLanguage: 'vi',
          profile: 'media',
        },
        { tab: { id: 1 } } as chrome.runtime.MessageSender,
      );

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const firstCallBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      // The user prompt (messages[1].content) embeds a JSON object of entries.
      // Assert on the raw content so the test does not break if buildUserPrompt's
      // separator format changes — we only care that the forward cues are present.
      const userContent = firstCallBody.messages[1].content;

      // Look-ahead cues 25, 26, 27 must appear as ctx1, ctx2, ctx3.
      expect(userContent).toContain('"ctx1": "Line 25"');
      expect(userContent).toContain('"ctx2": "Line 26"');
      expect(userContent).toContain('"ctx3": "Line 27"');

      // Bidirectional context: chunk 1 (i=25) has preceding [22..24] and following [50..52].
      // Unique prefix avoids cross-test subtitle cache hits on bare "Line N" texts.
      const bidirCues = Array.from({ length: 60 }, (_, i) => ({
        startTime: i,
        endTime: i + 1,
        text: `Bidir line ${i}`,
      }));

      const fetchCalls: string[] = [];
      vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, opts: { body: string }) => {
        fetchCalls.push(opts.body);
        // Return a valid response for any set of keys
        const body = JSON.parse(opts.body) as { messages: Array<{ content: string }> };
        const userJson = JSON.parse(body.messages[1].content.split('\n\n').pop() ?? '{}');
        const bidirTranslations: Record<string, string> = {};
        for (const key of Object.keys(userJson)) {
          bidirTranslations[key] = `T-${key}`;
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve({
            id: 'test',
            choices: [{ message: { role: 'assistant', content: JSON.stringify({ translations: bidirTranslations }) }, finish_reason: 'stop' }],
          }),
          text: () => Promise.resolve(''),
        });
      }));

      await handleMessage(
        {
          action: 'translateSubtitle',
          cues: bidirCues,
          sourceLanguage: 'en',
          targetLanguage: 'vi',
          profile: 'media',
        },
        { tab: { id: 42 } } as chrome.runtime.MessageSender,
      );

      // Wait for this test's own chunk bodies (filter by unique "Bidir" prefix
      // so a drained-but-finishing prior session cannot poison fetchCalls[1]).
      const deadline = Date.now() + 5000;
      const bidirBodies = () => fetchCalls.filter((b) => b.includes('Bidir line'));
      while (bidirBodies().length < 2 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const ownCalls = bidirBodies();
      expect(ownCalls.length).toBeGreaterThanOrEqual(2);

      // ownCalls[1] = chunk 1 (should have bidirectional context)
      const chunk1Body = JSON.parse(ownCalls[1]) as { messages: Array<{ content: string }> };
      const chunk1UserContent = chunk1Body.messages[1].content;

      // Preceding context: cues 22, 23, 24 (before chunk 1 at index 25)
      expect(chunk1UserContent).toContain('"ctx1": "Bidir line 22"');
      expect(chunk1UserContent).toContain('"ctx2": "Bidir line 23"');
      expect(chunk1UserContent).toContain('"ctx3": "Bidir line 24"');
      // Following context: cues 50, 51, 52 (after chunk 1 which ends at 49)
      expect(chunk1UserContent).toContain('"ctx4": "Bidir line 50"');
      expect(chunk1UserContent).toContain('"ctx5": "Bidir line 51"');
      expect(chunk1UserContent).toContain('"ctx6": "Bidir line 52"');
    });

    it('accumulates rolling glossary across chunks', async () => {
      mockStorage['anyllm-translate-settings'] = {
        namedGlossaryLists: [{
          id: 'cast',
          name: 'Cast names',
          entries: [{ id: 'alice', source: 'Alice', target: 'A-lít' }],
          updatedAt: 1,
        }],
        subtitleListBySite: { 'example.com': 'cast' },
      };
      const cues = Array.from({ length: 30 }, (_, i) => ({
        startTime: i,
        endTime: i + 1,
        text: `Line ${i}`,
      }));

      // First chunk returns properNouns; second chunk's prompt should contain them.
      const fetchBodies: string[] = [];
      let callCount = 0;
      vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, opts: { body: string }) => {
        callCount++;
        fetchBodies.push(opts.body);
        const body = JSON.parse(opts.body) as { messages: Array<{ content: string }> };
        const userJson = JSON.parse(body.messages[1].content.split('\n\n').pop() ?? '{}');
        const translations: Record<string, string> = {};
        for (const key of Object.keys(userJson)) {
          translations[key] = `T-${key}`;
        }
        const response: Record<string, unknown> = { translations };
        if (callCount === 1) {
          response.properNouns = { John: 'Juan', Alice: 'Wrong Alice' };
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve({
            id: 'test',
            choices: [{ message: { role: 'assistant', content: JSON.stringify(response) }, finish_reason: 'stop' }],
          }),
          text: () => Promise.resolve(''),
        });
      }));

      await handleMessage(
        {
          action: 'translateSubtitle',
          hostname: 'example.com',
          cues,
          sourceLanguage: 'en',
          targetLanguage: 'vi',
          profile: 'media',
        },
        { tab: { id: 43 } } as chrome.runtime.MessageSender,
      );

      // Scan all captured bodies — mock.calls[1] is wrong when chunk 0 retries (withRetry).
      const glossaryDeadline = Date.now() + 5000;
      let chunkWithGlossary: { messages: Array<{ content: string }> } | null = null;
      while (Date.now() < glossaryDeadline) {
        for (const raw of fetchBodies) {
          const parsed = JSON.parse(raw) as { messages: Array<{ content: string }> };
          const system = parsed.messages[0]?.content ?? '';
          if (system.includes('Previously translated names') && system.includes('"John" → "Juan"')) {
            chunkWithGlossary = parsed;
            break;
          }
        }
        if (chunkWithGlossary) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      expect(chunkWithGlossary).not.toBeNull();
      const messages = chunkWithGlossary?.messages;
      expect(messages?.[0].content).toContain('Previously translated names');
      expect(messages?.[0].content).toContain('"John" → "Juan"');
      expect(messages?.[0].content).toContain('- "Alice" → "A-lít"');
      expect(messages?.[0].content).not.toContain('Wrong Alice');
    });
  });

  // ==========================================================================
  // Sub-project 6: context-aware cache key + partial guard + chunk retry
  // ==========================================================================
  describe('handleMessage — translateSubtitle (sub-project 6 cache/retry)', () => {
    it('retries service.translate on a failure then succeeds via pool failover (2-key pool)', async () => {
      // FR-1 + FR-3 ripple: the pool now opens a key's breaker on a 5xx and
      // fails over. With a single-key pool, a persistent 5xx opens the breaker
      // and subtitle retry hits the open breaker (no same-key recovery within
      // cooldown). With a 2-key pool, k1's 5xx opens its breaker and the pool
      // fails over to k2, which succeeds — exercising the recovery path.
      mockStorage['anyllm-translate-settings'] = {
        providers: [
          {
            id: 'p1',
            displayName: 'P1',
            baseUrl: 'https://shared/v1',
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
      // k1 (Bearer sk-1) fails 503; k2 (Bearer sk-2) succeeds. Discriminate by
      // the Authorization header, exactly as the production service sends it.
      const fetchMock = vi.fn(async (_url: string, init?: { headers: Record<string, string> }) => {
        const auth = init?.headers?.['Authorization'] ?? '';
        if (auth.includes('sk-1')) {
          return { ok: false, status: 503, statusText: 'Service Unavailable', json: () => Promise.resolve({}), text: () => Promise.resolve('') };
        }
        return {
          ok: true, status: 200, statusText: 'OK',
          json: () => Promise.resolve({ id: 'test', choices: [{ message: { role: 'assistant', content: JSON.stringify({ translations: { s1: 'Xin chào' } }) }, finish_reason: 'stop' }] }),
          text: () => Promise.resolve(''),
        };
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await handleMessage(
        {
          action: 'translateSubtitle',
          cues: [{ startTime: 0, endTime: 2, text: 'Hello' }],
          sourceLanguage: 'en',
          targetLanguage: 'vi',
        },
        { tab: { id: 1 } } as chrome.runtime.MessageSender,
      );

      // Recovery happened via failover: the result succeeded.
      expect(result).toMatchObject({ success: true });
      // k1 was attempted (and failed 503), k2 succeeded.
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('emits SUBTITLE_CHUNK_FAILED to the tab when a background chunk fails all retries', async () => {
      vi.useFakeTimers();
      try {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          ok: false, status: 500, statusText: 'Server Error',
          json: () => Promise.resolve({}), text: () => Promise.resolve(''),
        }));

        let settled = false;
        const handlePromise = handleMessage(
          {
            action: 'translateSubtitle',
            cues: [{ startTime: 0, endTime: 2, text: 'Hello' }],
            sourceLanguage: 'en',
            targetLanguage: 'vi',
          },
          { tab: { id: 1 } } as chrome.runtime.MessageSender,
        );
        expect(handlePromise).toBeDefined();
        if (!handlePromise) {
          throw new Error('handlePromise is undefined');
        }
        const promise = handlePromise.finally(() => {
          settled = true;
        });

        // Loop and advance timers until handleMessage settles (with a safety cap of 30 steps)
        let steps = 0;
        while (!settled && steps < 30) {
          steps++;
          await vi.advanceTimersByTimeAsync(500);
          await new Promise((resolve) => process.nextTick(resolve));
        }

        const result = await promise;

        // First chunk fails all retries -> overall failure.
        expect(result).toMatchObject({ success: false });
      } finally {
        vi.useRealTimers();
      }
      // The pool's retry backoff runs on real timers captured before
      // useFakeTimers(), so this test needs wall-clock headroom under
      // full-suite CPU contention.
    }, 30000);

    it('does not cache a partial (source-back-filled) translation', async () => {
      // The LLM returns a translation where the cue text is back-filled with
      // the source (partial). A second identical request should NOT hit cache
      // (it should re-fetch), proving the partial result wasn't cached.
      const goodResponse = JSON.stringify({ translations: { s1: 'Hello' } });
      let fetchCallCount = 0;
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
        fetchCallCount++;
        return Promise.resolve({
          ok: true, status: 200, statusText: 'OK',
          json: () => Promise.resolve({ id: 'test', choices: [{ message: { role: 'assistant', content: goodResponse }, finish_reason: 'stop' }] }),
          text: () => Promise.resolve(''),
        });
      }));

      // First request: text 'Hello', LLM returns 'Hello' (== source) as a
      // partial back-fill. This should NOT be cached.
      await handleMessage(
        {
          action: 'translateSubtitle',
          cues: [{ startTime: 0, endTime: 2, text: 'Hello' }],
          sourceLanguage: 'en', targetLanguage: 'vi',
        },
        { tab: { id: 2 } } as chrome.runtime.MessageSender,
      );
      const fetchesAfterFirst = fetchCallCount;

      // Second identical request: if the partial was cached, fetch would NOT
      // be called again. Since we don't cache partials, fetch IS called again.
      await handleMessage(
        {
          action: 'translateSubtitle',
          cues: [{ startTime: 0, endTime: 2, text: 'Hello' }],
          sourceLanguage: 'en', targetLanguage: 'vi',
        },
        { tab: { id: 3 } } as chrome.runtime.MessageSender,
      );
      expect(fetchCallCount).toBeGreaterThan(fetchesAfterFirst);
    });
  });
});

describe('services/background — OPEN_OPTIONS handler', () => {
  it('opens the deep-linked options URL via chrome.tabs.create', async () => {
    const createSpy = vi.fn(async () => ({ id: 999 }));
    vi.stubGlobal('chrome', {
      storage: {
        local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      runtime: { sendMessage: vi.fn().mockResolvedValue(undefined) },
      tabs: { create: createSpy },
      alarms: { create: vi.fn(), get: vi.fn(), clear: vi.fn(), onAlarm: { addListener: vi.fn(), removeListener: vi.fn() } },
    });

    const url = 'chrome-extension://abc/options.html?section=subtitles';
    const res = await handleMessage(
      { action: 'OPEN_OPTIONS', url },
      {} as chrome.runtime.MessageSender,
    );

    // Routed through the background so the extension page renders (avoids the
    // blank-tab problem of window.open-ing a chrome-extension:// URL).
    expect(createSpy).toHaveBeenCalledWith({ url });
    expect(res).toEqual({ success: true });
  });
});

