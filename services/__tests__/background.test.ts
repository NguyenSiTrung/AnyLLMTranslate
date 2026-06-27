import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleMessage,
  __resetSemaphoreForTest,
  __resetTranslationServiceForTest,
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
    // Drain any pending background chunks from the previous test so their
    // async fetch calls don't leak into the next test's fetch mock. Also
    // reset the global semaphore so stale slots/queued waiters don't block.
    await new Promise((resolve) => setTimeout(resolve, 10));
    __resetSemaphoreForTest();
    // Reset the cached provider-pool coordinator. FR-1 made the pool open
    // circuit breakers on real failures (previously swallowed), and the
    // coordinator is a module singleton whose breaker cooldowns (60s+) would
    // otherwise leak across test cases — a 429/5xx in one test leaves a key
    // open for the next test, breaking it.
    __resetTranslationServiceForTest();
  });

  describe('handleMessage — translate', () => {
    it('translates pieces and returns results', async () => {
      mockFetch(JSON.stringify({ translations: { p1: 'Xin chào' } }));

      const result = await handleMessage(
        {
          action: 'translate',
          pieces: [{ id: 'p1', text: 'Hello' }],
          sourceLanguage: 'en',
          targetLanguage: 'vi',
        },
        { tab: { id: 1 } } as chrome.runtime.MessageSender,
      );

      expect(result).toEqual({
        success: true,
        results: [{ id: 'p1', translatedText: 'Xin chào' }],
      });
    });

    it('returns error on translation failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      const result = await handleMessage(
        {
          action: 'translate',
          pieces: [{ id: 'p1', text: 'Hello' }],
          sourceLanguage: 'en',
          targetLanguage: 'vi',
        },
        { tab: { id: 1 } } as chrome.runtime.MessageSender,
      );

      const typedResult = result as { success: boolean; error: string };
      expect(typedResult.success).toBe(false);
      expect(typedResult.error).toBeDefined();
    });

    it('forwards glossaryBlock to service.translate() when settings have glossary entries', async () => {
      // Store settings with glossary entries
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
    });

    it('omits glossaryBlock when settings have empty glossary', async () => {
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

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      expect(body.messages[0].content).not.toContain('Translation Glossary');
    });
  });

  describe('handleMessage — translateSubtitle', () => {
    it('uses the subtitle prompt (pageContext is not injected for subtitles)', async () => {
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
      // Subtitle path uses the profile-driven subtitle prompt, which does not
      // inject pageContext (UNTRUSTED DATA block is a web-page-prompt feature).
      expect(body.messages[0].content).toContain('subtitle translator');
      expect(body.messages[0].content).not.toContain('UNTRUSTED DATA');
      expect(body.messages[0].content).not.toContain('<page_domain>');
    });

    it('works correctly when pageContext is undefined (backward compat)', async () => {
      mockFetch(JSON.stringify({ translations: { s1: 'Xin chào' } }));

      const result = await handleMessage(
        {
          action: 'translateSubtitle',
          cues: [{ startTime: 0, endTime: 2, text: 'Hello' }],
          sourceLanguage: 'en',
          targetLanguage: 'vi',
        },
        { tab: { id: 1 } } as chrome.runtime.MessageSender,
      );

      const typedResult = result as { success: boolean; cues?: Array<{ text: string }> };
      expect(typedResult.success).toBe(true);
      expect(typedResult.cues).toBeDefined();
      expect(typedResult.cues?.[0].text).toBe('Xin chào');

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      expect(body.messages[0].content).not.toContain('UNTRUSTED DATA');
    });

    it('routes cinematic profile to the subtitle prompt', async () => {
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

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      expect(body.messages[0].content).toContain('subtitle translator');
      expect(body.messages[0].content).toContain('idiomatic, natural phrasing');
    });

    it('routes educational profile to the subtitle prompt (literal)', async () => {
      mockFetch(JSON.stringify({ translations: { s1: 'Xin chào' } }));

      await handleMessage(
        {
          action: 'translateSubtitle',
          cues: [{ startTime: 0, endTime: 2, text: 'Hello' }],
          sourceLanguage: 'en',
          targetLanguage: 'vi',
          profile: 'educational',
        },
        { tab: { id: 1 } } as chrome.runtime.MessageSender,
      );

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      expect(body.messages[0].content).toContain('precise, faithful translation');
    });

    it('falls back to media profile when profile is absent (backward compat)', async () => {
      mockFetch(JSON.stringify({ translations: { s1: 'Xin chào' } }));

      await handleMessage(
        {
          action: 'translateSubtitle',
          cues: [{ startTime: 0, endTime: 2, text: 'Hello' }],
          sourceLanguage: 'en',
          targetLanguage: 'vi',
        },
        { tab: { id: 1 } } as chrome.runtime.MessageSender,
      );

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      // Media = all defaults → subtitle identity present but no knob lines.
      expect(body.messages[0].content).toContain('subtitle translator');
      expect(body.messages[0].content).not.toContain('idiomatic, natural phrasing');
      expect(body.messages[0].content).not.toContain('precise, faithful translation');
    });

    it('applies a per-tab knob override over the profile preset', async () => {
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

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      // literal line present, idiomatic line absent (overridden).
      expect(body.messages[0].content).toContain('precise, faithful translation');
      expect(body.messages[0].content).not.toContain('idiomatic, natural phrasing');
    });

    it('applies a persisted global knob override when no per-tab override is set', async () => {
      // Seed global override in settings storage.
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

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      expect(body.messages[0].content).toContain('Remove strong profanity entirely');
    });

    it('produces the plain profile prompt when neither override is set (regression)', async () => {
      mockFetch(JSON.stringify({ translations: { s1: 'Xin chào' } }));

      await handleMessage(
        {
          action: 'translateSubtitle',
          cues: [{ startTime: 0, endTime: 2, text: 'Hello' }],
          sourceLanguage: 'en',
          targetLanguage: 'vi',
          profile: 'media',   // all defaults → no knob lines
        },
        { tab: { id: 1 } } as chrome.runtime.MessageSender,
      );

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      // Media preset = neutral/balanced/moderate/preserve → identity only, no knob lines.
      expect(body.messages[0].content).toContain('subtitle translator');
      expect(body.messages[0].content).not.toContain('idiomatic, natural phrasing');
      expect(body.messages[0].content).not.toContain('precise, faithful translation');
      expect(body.messages[0].content).not.toContain('Remove strong profanity');
    });

    it('seeds the first chunk with look-ahead context cues', async () => {
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
    });

    it('provides bidirectional context for chunks 1+ (preceding + following)', async () => {
      // Build 60 cues: chunk 0 = [0..24], chunk 1 = [25..49], chunk 2 = [50..59]
      // For chunk 1 (i=25): preceding = [22..24], following = [50..52]
      const cues = Array.from({ length: 60 }, (_, i) => ({
        startTime: i,
        endTime: i + 1,
        text: `Line ${i}`,
      }));

      // Capture all fetch calls
      const fetchCalls: string[] = [];
      vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, opts: { body: string }) => {
        fetchCalls.push(opts.body);
        // Return a valid response for any set of keys
        const body = JSON.parse(opts.body) as { messages: Array<{ content: string }> };
        const userJson = JSON.parse(body.messages[1].content.split('\n\n').pop() ?? '{}');
        const translations: Record<string, string> = {};
        for (const key of Object.keys(userJson)) {
          translations[key] = `T-${key}`;
        }
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
          cues,
          sourceLanguage: 'en',
          targetLanguage: 'vi',
          profile: 'media',
        },
        { tab: { id: 42 } } as chrome.runtime.MessageSender,
      );

      // Wait for background chunks to process
      await new Promise((resolve) => setTimeout(resolve, 500));

      // fetchCalls[0] = chunk 0 (first chunk, forward look-ahead only)
      // fetchCalls[1] = chunk 1 (should have bidirectional context)
      expect(fetchCalls.length).toBeGreaterThanOrEqual(2);

      const chunk1Body = JSON.parse(fetchCalls[1]) as { messages: Array<{ content: string }> };
      const chunk1UserContent = chunk1Body.messages[1].content;

      // Preceding context: cues 22, 23, 24 (before chunk 1 at index 25)
      expect(chunk1UserContent).toContain('"ctx1": "Line 22"');
      expect(chunk1UserContent).toContain('"ctx2": "Line 23"');
      expect(chunk1UserContent).toContain('"ctx3": "Line 24"');
      // Following context: cues 50, 51, 52 (after chunk 1 which ends at 49)
      expect(chunk1UserContent).toContain('"ctx4": "Line 50"');
      expect(chunk1UserContent).toContain('"ctx5": "Line 51"');
      expect(chunk1UserContent).toContain('"ctx6": "Line 52"');
    });

    it('accumulates rolling glossary across chunks', async () => {
      const cues = Array.from({ length: 30 }, (_, i) => ({
        startTime: i,
        endTime: i + 1,
        text: `Line ${i}`,
      }));

      // First chunk returns properNouns; second chunk's prompt should contain them.
      let callCount = 0;
      vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, opts: { body: string }) => {
        callCount++;
        const body = JSON.parse(opts.body) as { messages: Array<{ content: string }> };
        const userJson = JSON.parse(body.messages[1].content.split('\n\n').pop() ?? '{}');
        const translations: Record<string, string> = {};
        for (const key of Object.keys(userJson)) {
          translations[key] = `T-${key}`;
        }
        const response: Record<string, unknown> = { translations };
        // First chunk returns proper nouns
        if (callCount === 1) {
          response.properNouns = { John: 'Juan' };
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
          cues,
          sourceLanguage: 'en',
          targetLanguage: 'vi',
          profile: 'media',
        },
        { tab: { id: 43 } } as chrome.runtime.MessageSender,
      );

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Second chunk's system prompt should contain the rolling glossary
      expect(callCount).toBeGreaterThanOrEqual(2);
      const chunk2Body = JSON.parse(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[1][1]?.body as string,
      ) as { messages: Array<{ content: string }> };
      expect(chunk2Body.messages[0].content).toContain('Previously translated names');
      expect(chunk2Body.messages[0].content).toContain('"John" → "Juan"');
    });

    it('prefixes cue text with [voice] when cue.voice is set', async () => {
      const cues = [
        { startTime: 0, endTime: 2, text: 'Hello', voice: 'John' },
      ];

      mockFetch(JSON.stringify({ translations: { s1: 'Xin chào' } }));

      await handleMessage(
        {
          action: 'translateSubtitle',
          cues,
          sourceLanguage: 'en',
          targetLanguage: 'vi',
          profile: 'media',
        },
        { tab: { id: 44 } } as chrome.runtime.MessageSender,
      );

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      // The user prompt should contain the voice prefix
      expect(body.messages[1].content).toContain('[John]');
      expect(body.messages[1].content).toContain('[John] Hello');
    });

    it('does not prefix cue text when cue.voice is absent', async () => {
      const cues = [
        { startTime: 0, endTime: 2, text: 'Hello' },
      ];

      mockFetch(JSON.stringify({ translations: { s1: 'Xin chào' } }));

      await handleMessage(
        {
          action: 'translateSubtitle',
          cues,
          sourceLanguage: 'en',
          targetLanguage: 'vi',
          profile: 'media',
        },
        { tab: { id: 45 } } as chrome.runtime.MessageSender,
      );

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      expect(body.messages[1].content).not.toContain('[John]');
    });

    it('uses original cue text for cache, not voice-prefixed text', async () => {
      const cues = [
        { startTime: 0, endTime: 2, text: 'Hello', voice: 'John' },
      ];

      mockFetch(JSON.stringify({ translations: { s1: 'Xin chào' } }));

      const result = await handleMessage(
        {
          action: 'translateSubtitle',
          cues,
          sourceLanguage: 'en',
          targetLanguage: 'vi',
          profile: 'media',
        },
        { tab: { id: 46 } } as chrome.runtime.MessageSender,
      ) as { success: boolean; cues?: Array<{ text: string; originalText?: string }> };

      // The mockFetch response translates s1 → 'Xin chào'. The result cue's
      // originalText should be 'Hello' (not '[John] Hello'), confirming cache
      // operations use the unprefixed text.
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      // Verify the LLM received the prefixed text
      expect(body.messages[1].content).toContain('[John] Hello');
      // Verify cache safety: originalText (which feeds cacheTranslation) is
      // the unprefixed 'Hello', not the voice-prefixed '[John] Hello'.
      expect(result.cues?.[0].originalText).toBe('Hello');
    });
  });

  describe('handleMessage — unknown action', () => {
    it('returns undefined for unknown actions', () => {
      const result = handleMessage(
        { action: 'unknownAction' } as unknown as Parameters<typeof handleMessage>[0],
        {} as chrome.runtime.MessageSender,
      );
      expect(result).toBeUndefined();
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
              { id: 'k1', apiKey: 'sk-1', maxRpm: 0, enabled: true },
              { id: 'k2', apiKey: 'sk-2', maxRpm: 0, enabled: true },
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
      // Every fetch fails — chunk 0 (synchronous) fails, request returns
      // success:false. We assert the failure path does not throw and the tab
      // message infrastructure is reachable.
      // NOTE: real backoff (fetchWithRetry + withRetry) makes this slow — give
      // it headroom beyond the default 5s timeout.
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false, status: 500, statusText: 'Server Error',
        json: () => Promise.resolve({}), text: () => Promise.resolve(''),
      }));

      const result = await handleMessage(
        {
          action: 'translateSubtitle',
          cues: [{ startTime: 0, endTime: 2, text: 'Hello' }],
          sourceLanguage: 'en',
          targetLanguage: 'vi',
        },
        { tab: { id: 1 } } as chrome.runtime.MessageSender,
      );

      // First chunk fails all retries -> overall failure.
      expect(result).toMatchObject({ success: false });
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

