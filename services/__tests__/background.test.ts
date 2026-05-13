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
    it('forwards pageContext to service.translate() when provided', async () => {
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
      expect(body.messages[0].content).toContain('Page context for consistent terminology');
      expect(body.messages[0].content).toContain('Domain: youtube.com');
      expect(body.messages[0].content).toContain('Category: entertainment');
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
      expect(body.messages[0].content).not.toContain('Page context for consistent terminology');
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

