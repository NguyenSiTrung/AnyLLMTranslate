import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleMessage, __resetSemaphoreForTest } from '../background';

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
    await new Promise((resolve) => setTimeout(resolve, 50));
    __resetSemaphoreForTest();
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
});

