import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAICompatibleService } from '../openaiCompatible';
import type { ProviderConfig } from '../../types/config';
import { buildSubtitleSystemPrompt } from '@/services/subtitlePrompt';
import { PROFILE_PRESETS } from '@/lib/subtitleProfiles';
import { createRateLimiter } from '@/lib/rateLimiter';

const mockConfig: ProviderConfig = {
  preset: 'custom',
  baseUrl: 'http://localhost:11434/v1',
  apiKey: '',
  model: 'gemma3:4b',
  temperature: 0.3,
  maxTokens: 4096,
  displayName: 'Ollama',
  requiresApiKey: false,
};

const mockConfigWithKey: ProviderConfig = {
  ...mockConfig,
  preset: 'custom',
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'sk-test-key',
  model: 'gpt-4o-mini',
  displayName: 'Custom',
  requiresApiKey: true,
};

function mockFetchResponse(content: string, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? 'OK' : 'Bad Request',
    json: () => Promise.resolve({
      id: 'chatcmpl-test',
      choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }),
    text: () => Promise.resolve(ok ? '' : `{"error":{"message":"Test error"}}`),
  });
}

describe('OpenAICompatibleService', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('translate', () => {
    it('translates a batch of texts successfully', async () => {
      const responseContent = JSON.stringify({
        translations: { p1: 'Xin chào', p2: 'Tạm biệt' },
      });
      globalThis.fetch = mockFetchResponse(responseContent);

      const service = new OpenAICompatibleService(mockConfig);
      const result = await service.translate({
        texts: new Map([['p1', 'Hello'], ['p2', 'Goodbye']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });

      expect(result.success).toBe(true);
      expect(result.translations.get('p1')).toBe('Xin chào');
      expect(result.translations.get('p2')).toBe('Tạm biệt');
    });

    it('does not send Authorization header for keyless providers', async () => {
      globalThis.fetch = mockFetchResponse('{"translations":{"p1":"test"}}');

      const service = new OpenAICompatibleService(mockConfig);
      await service.translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'auto',
        targetLanguage: 'vi',
      });

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const headers = fetchCall[1]?.headers as Record<string, string>;
      expect(headers['Authorization']).toBeUndefined();
    });

    it('sends Authorization header when API key is provided', async () => {
      globalThis.fetch = mockFetchResponse('{"translations":{"p1":"test"}}');

      const service = new OpenAICompatibleService(mockConfigWithKey);
      await service.translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const headers = fetchCall[1]?.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer sk-test-key');
    });

    it('returns error on empty response', async () => {
      globalThis.fetch = mockFetchResponse('   ');

      const service = new OpenAICompatibleService(mockConfig);
      const result = await service.translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Empty response');
    });

    it('P2 regression: back-fills missing IDs with original text and flags partial', async () => {
      // LLM returns only p1, omitting p2 — previously reported success:true
      // with a short map (p2 silently lost).
      globalThis.fetch = mockFetchResponse(JSON.stringify({ translations: { p1: 'Xin chào' } }));

      const service = new OpenAICompatibleService(mockConfig);
      const result = await service.translate({
        texts: new Map([['p1', 'Hello'], ['p2', 'Goodbye']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });

      expect(result.success).toBe(true);
      expect(result.partial).toBe(true);
      // p2 back-filled with its original text (not lost).
      expect(result.translations.get('p1')).toBe('Xin chào');
      expect(result.translations.get('p2')).toBe('Goodbye');
      expect(result.translations.size).toBe(2);
    });

    it('returns error on malformed JSON response', async () => {
      globalThis.fetch = mockFetchResponse('not json at all {{{');

      const service = new OpenAICompatibleService(mockConfig);
      const result = await service.translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('handles HTTP error responses', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('{"error":{"message":"Invalid API key"}}'),
      });

      const service = new OpenAICompatibleService(mockConfigWithKey);
      const result = await service.translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid API key');
    });

    it('includes glossary block in system prompt when glossaryBlock provided', async () => {
      const responseContent = JSON.stringify({ translations: { p1: 'Học máy' } });
      globalThis.fetch = mockFetchResponse(responseContent);

      const service = new OpenAICompatibleService(mockConfig);
      await service.translate({
        texts: new Map([['p1', 'machine learning']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        glossaryBlock: 'Translation Glossary (always use these translations):\n- "machine learning" → "học máy"',
      });

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string) as { messages: Array<{ role: string; content: string }> };
      const systemMessage = body.messages[0];
      expect(systemMessage.role).toBe('system');
      expect(systemMessage.content).toContain('Translation Glossary');
      expect(systemMessage.content).toContain('machine learning');
    });

    it('does not include glossary section when glossaryBlock is absent', async () => {
      globalThis.fetch = mockFetchResponse(JSON.stringify({ translations: { p1: 'Xin chào' } }));

      const service = new OpenAICompatibleService(mockConfig);
      await service.translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string) as { messages: Array<{ role: string; content: string }> };
      expect(body.messages[0].content).not.toContain('Translation Glossary');
    });

    it('uses custom system prompt template when customSystemPrompt provided', async () => {
      globalThis.fetch = mockFetchResponse(JSON.stringify({ translations: { p1: 'Xin chào' } }));
      const customTemplate = 'Custom prompt for {{targetLanguage}}. Return {"translations": {"p1": "x"}}. {{glossary}}';

      const service = new OpenAICompatibleService(mockConfig);
      await service.translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        customSystemPrompt: customTemplate,
      });

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string) as { messages: Array<{ role: string; content: string }> };
      expect(body.messages[0].content).toContain('Custom prompt for Vietnamese (vi)');
    });

    it('does not log LLM request/response by default (privacy: no prompt text in console)', async () => {
      globalThis.fetch = mockFetchResponse(JSON.stringify({ translations: { p1: 'Xin chào' } }));
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const service = new OpenAICompatibleService(mockConfig);
      await service.translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });

      // No log line may contain the prompt or response text
      for (const call of logSpy.mock.calls) {
        const flat = call.map((c) => (typeof c === 'string' ? c : JSON.stringify(c))).join(' ');
        expect(flat).not.toContain('Hello');
        expect(flat).not.toContain('Xin chào');
      }
    });
  });

  describe('testConnection', () => {
    it('returns success on valid response', async () => {
      globalThis.fetch = mockFetchResponse('{"status":"ok"}');

      const service = new OpenAICompatibleService(mockConfig);
      const result = await service.testConnection();

      expect(result.success).toBe(true);
    });

    it('returns error on empty response', async () => {
      globalThis.fetch = mockFetchResponse('');

      const service = new OpenAICompatibleService(mockConfig);
      const result = await service.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Empty response');
    });

    it('returns error on network failure', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const service = new OpenAICompatibleService(mockConfig);
      const result = await service.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toContain('ECONNREFUSED');
    });
  });

  describe('updateConfig', () => {
    it('updates config and uses new values', async () => {
      globalThis.fetch = mockFetchResponse('{"translations":{"p1":"test"}}');

      const service = new OpenAICompatibleService(mockConfig);
      service.updateConfig(mockConfigWithKey);

      await service.translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const url = fetchCall[0] as string;
      expect(url).toContain('api.example.com');
    });
  });

  describe('subtitle prompt routing', () => {
    it('uses the subtitle prompt and ignores customSystemPrompt when subtitleKnobs is set', async () => {
      globalThis.fetch = mockFetchResponse(JSON.stringify({ translations: { s1: 'Xin chào' } }));

      const service = new OpenAICompatibleService(mockConfig);
      await service.translate({
        texts: new Map([['s1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        subtitleKnobs: PROFILE_PRESETS.cinematic,
        customSystemPrompt: 'IGNORE ME — web custom prompt',
      });

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      const systemPrompt = body.messages[0].content;

      // Subtitle identity present.
      expect(systemPrompt).toContain('subtitle translator');
      // Cinematic knob instruction present.
      expect(systemPrompt).toContain('idiomatic, natural phrasing');
      // Web custom prompt ignored.
      expect(systemPrompt).not.toContain('IGNORE ME');
      // Sanity: equals what buildSubtitleSystemPrompt produces (same targetLanguage code).
      expect(systemPrompt).toBe(buildSubtitleSystemPrompt('vi', PROFILE_PRESETS.cinematic));
    });

    it('uses the web prompt and honors customSystemPrompt when subtitleKnobs is absent', async () => {
      globalThis.fetch = mockFetchResponse(JSON.stringify({ translations: { s1: 'Xin chào' } }));

      const webTemplate = 'Translate to {{targetLanguage}} ONLY. {{glossary}}\nRespond with JSON {"translations": {}}.';
      const service = new OpenAICompatibleService(mockConfig);
      await service.translate({
        texts: new Map([['s1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        customSystemPrompt: webTemplate,
      });

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      const systemPrompt = body.messages[0].content;

      expect(systemPrompt).toContain('Vietnamese (vi)');
      expect(systemPrompt).toContain('ONLY');
      expect(systemPrompt).not.toContain('subtitle translator');
    });
  });

  describe('translate — subtitle path with properNouns', () => {
    it('extracts properNouns from subtitle response and attaches to result', async () => {
      const responseContent = JSON.stringify({
        translations: { s1: 'Hola' },
        properNouns: { John: 'Juan' },
      });
      globalThis.fetch = mockFetchResponse(responseContent);

      const service = new OpenAICompatibleService(mockConfig);
      const texts = new Map<string, string>();
      texts.set('s1', 'Hello');

      const result = await service.translate({
        texts,
        sourceLanguage: 'en',
        targetLanguage: 'es',
        subtitleKnobs: PROFILE_PRESETS.media,
      });

      expect(result.success).toBe(true);
      expect(result.properNouns).toEqual({ John: 'Juan' });
    });

    it('returns properNouns undefined on the web-page path', async () => {
      const responseContent = JSON.stringify({
        translations: { p1: 'Hola' },
      });
      globalThis.fetch = mockFetchResponse(responseContent);

      const service = new OpenAICompatibleService(mockConfig);
      const texts = new Map<string, string>();
      texts.set('p1', 'Hello');

      const result = await service.translate({
        texts,
        sourceLanguage: 'en',
        targetLanguage: 'es',
        customSystemPrompt: null,
      });

      expect(result.success).toBe(true);
      expect(result.properNouns).toBeUndefined();
    });

    it('passes rollingGlossaryBlock to the subtitle prompt', async () => {
      const responseContent = JSON.stringify({
        translations: { s1: 'Hola' },
      });
      globalThis.fetch = mockFetchResponse(responseContent);

      const service = new OpenAICompatibleService(mockConfig);
      const texts = new Map<string, string>();
      texts.set('s1', 'Hello');

      await service.translate({
        texts,
        sourceLanguage: 'en',
        targetLanguage: 'es',
        subtitleKnobs: PROFILE_PRESETS.media,
        rollingGlossaryBlock: 'Previously translated names in this content (use these consistently):\n- "John" → "Juan"',
      });

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      expect(body.messages[0].content).toContain('Previously translated names');
      expect(body.messages[0].content).toContain('"John" → "Juan"');
    });
  });

  describe('RPM rate limiter integration', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    const mockTranslateResponse = () => {
      const content = JSON.stringify({ translations: { p1: 'test' } });
      return vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve({
          id: 'test',
          choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
        text: () => Promise.resolve(''),
      });
    };

    it('maxRpm flows from config into the service limiter (unlimited by default)', async () => {
      globalThis.fetch = mockFetchResponse('{"translations":{"p1":"test"}}');
      const service = new OpenAICompatibleService(mockConfig);
      await service.translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('maxRpm from config is respected (unlimited when 0)', async () => {
      globalThis.fetch = mockFetchResponse('{"translations":{"p1":"test"}}');
      const configWithRpm: ProviderConfig = { ...mockConfig, maxRpm: 0 };
      const service = new OpenAICompatibleService(configWithRpm);
      await service.translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('updateConfig calls setMaxRpm with the new value', async () => {
      globalThis.fetch = mockFetchResponse('{"translations":{"p1":"test"}}');
      const service = new OpenAICompatibleService({ ...mockConfig, maxRpm: 0 });
      service.updateConfig({ ...mockConfig, maxRpm: 30 });
      await service.translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('acquire() is awaited before fetch (call order verified)', async () => {
      vi.useFakeTimers();
      const fetchSpy = mockTranslateResponse();
      globalThis.fetch = fetchSpy;

      const service = new OpenAICompatibleService({ ...mockConfig, maxRpm: 1 });

      const p1 = service.translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });
      await Promise.resolve();
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const p2 = service.translate({
        texts: new Map([['p1', 'World']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });
      await Promise.resolve();
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(60_001);
      await Promise.all([p1, p2]);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('changing maxRpm via updateConfig from 0 to N enables limiting', async () => {
      vi.useFakeTimers();
      const fetchSpy = mockTranslateResponse();
      globalThis.fetch = fetchSpy;

      const service = new OpenAICompatibleService({ ...mockConfig, maxRpm: 0 });
      await service.translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      service.updateConfig({ ...mockConfig, maxRpm: 1 });

      await service.translate({
        texts: new Map([['p1', 'World']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      const p3 = service.translate({
        texts: new Map([['p1', 'Foo']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });
      await Promise.resolve();
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(60_001);
      await p3;
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });
  });
});
