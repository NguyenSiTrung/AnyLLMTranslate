import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAICompatibleService } from '../openaiCompatible';
import type { ProviderConfig } from '../../types/config';

const mockConfig: ProviderConfig = {
  preset: 'ollama',
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
  preset: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'sk-test-key',
  model: 'gpt-4o-mini',
  displayName: 'OpenAI',
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

    it('handles network errors', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const service = new OpenAICompatibleService(mockConfig);
      const result = await service.translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
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
      expect(url).toContain('api.openai.com');
    });
  });
});
