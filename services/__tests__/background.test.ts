import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleMessage } from '../background';

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
  beforeEach(() => {
    // Reset stored settings before each test
    delete mockStorage['anyllm-translate-settings'];
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

