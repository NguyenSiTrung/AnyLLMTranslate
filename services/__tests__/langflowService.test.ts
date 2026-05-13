/**
 * Tests for LangflowService — request format, response parsing, error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LangflowService, resolveJsonPath } from '../langflowService';
import type { ProviderConfig } from '../../types/config';

const mockConfig: ProviderConfig = {
  preset: 'langflow',
  baseUrl: '',
  apiKey: 'lf-test-key-123',
  model: '',
  temperature: 0.3,
  maxTokens: 2000,
  displayName: 'Langflow',
  requiresApiKey: true,
  endpointUrl: 'https://langflow.example.com/api/v1/run/flow-123',
  componentId: 'ChatModel-ABC',
  responseTextPath: 'outputs[0].outputs[0].results.text.text',
};

function mockLangflowFetch(text: string, ok = true, status = 200) {
  const responseBody = ok
    ? { outputs: [{ outputs: [{ results: { text: { text } } }] }] }
    : { detail: text };

  return vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: () => Promise.resolve(responseBody),
    text: () => Promise.resolve(JSON.stringify(responseBody)),
  });
}

describe('resolveJsonPath', () => {
  it('resolves a simple nested path', () => {
    const obj = { a: { b: { c: 'hello' } } };
    expect(resolveJsonPath(obj, 'a.b.c')).toBe('hello');
  });

  it('resolves array index paths', () => {
    const obj = { outputs: [{ outputs: [{ results: { text: { text: 'response' } } }] }] };
    expect(resolveJsonPath(obj, 'outputs[0].outputs[0].results.text.text')).toBe('response');
  });

  it('returns undefined for missing intermediate keys', () => {
    const obj = { outputs: [] };
    expect(resolveJsonPath(obj, 'outputs[0].outputs[0].results.text.text')).toBeUndefined();
  });

  it('returns undefined for null input', () => {
    expect(resolveJsonPath(null, 'a.b')).toBeUndefined();
  });

  it('handles top-level key', () => {
    const obj = { text: 'hello' };
    expect(resolveJsonPath(obj, 'text')).toBe('hello');
  });
});

describe('LangflowService', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('translate', () => {
    it('sends correct Langflow request format', async () => {
      globalThis.fetch = mockLangflowFetch('{"translations":{"p1":"Xin chào"}}');

      const service = new LangflowService({ ...mockConfig });
      const result = await service.translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'Vietnamese',
      });

      expect(result.success).toBe(true);
      expect(result.translations.get('p1')).toBe('Xin chào');

      // Verify request format
      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const [url, options] = fetchCall;
      expect(url).toBe('https://langflow.example.com/api/v1/run/flow-123');
      expect(options?.method).toBe('POST');

      const body = JSON.parse(options?.body as string);
      expect(body.input_type).toBe('text');
      expect(body.output_type).toBe('text');
      expect(body.input_value).toContain('Hello');
      expect(body.tweaks['ChatModel-ABC']).toBeDefined();
      expect(body.tweaks['ChatModel-ABC'].stream).toBe(false);
      expect(body.tweaks['ChatModel-ABC'].remove_think_text).toBe(true);
      expect(body.tweaks['ChatModel-ABC'].temperature).toBe(0.3);
    });

    it('uses x-api-key header instead of Authorization Bearer', async () => {
      globalThis.fetch = mockLangflowFetch('{"translations":{"p1":"Test"}}');

      const service = new LangflowService({ ...mockConfig });
      await service.translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'Vietnamese',
      });

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const headers = fetchCall[1]?.headers as Record<string, string>;
      expect(headers['x-api-key']).toBe('lf-test-key-123');
      expect(headers['Authorization']).toBeUndefined();
    });

    it('returns error on empty response text', async () => {
      globalThis.fetch = mockLangflowFetch('');

      const service = new LangflowService({ ...mockConfig });
      const result = await service.translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'Vietnamese',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Empty response');
    });

    it('handles HTTP error responses', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve('{"detail":"Flow not found"}'),
      });

      const service = new LangflowService({ ...mockConfig });
      const result = await service.translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'Vietnamese',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Flow not found');
    });

    it('returns error when response path does not match', async () => {
      // Return a response with unexpected structure
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve({ unexpected: 'structure' }),
        text: () => Promise.resolve('{"unexpected":"structure"}'),
      });

      const service = new LangflowService({ ...mockConfig });
      const result = await service.translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'Vietnamese',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Could not extract response text');
    });
  });

  describe('testConnection', () => {
    it('returns success on valid response', async () => {
      globalThis.fetch = mockLangflowFetch('{"status":"ok"}');

      const service = new LangflowService({ ...mockConfig });
      const result = await service.testConnection();
      expect(result.success).toBe(true);
    });

    it('returns error on empty response', async () => {
      globalThis.fetch = mockLangflowFetch('');

      const service = new LangflowService({ ...mockConfig });
      const result = await service.testConnection();
      expect(result.success).toBe(false);
      expect(result.error).toContain('Empty response');
    });

    it('returns error on network failure', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const service = new LangflowService({ ...mockConfig });
      const result = await service.testConnection();
      expect(result.success).toBe(false);
      expect(result.error).toContain('ECONNREFUSED');
    });
  });

  describe('detectPageCategory', () => {
    it('detects page category via Langflow', async () => {
      globalThis.fetch = mockLangflowFetch('{"category":"Software Development"}');

      const service = new LangflowService({ ...mockConfig });
      const result = await service.detectPageCategory({
        title: 'React Documentation',
        description: 'Learn React',
        domain: 'react.dev',
      });

      expect(result.success).toBe(true);
      expect(result.category).toBe('Software Development');
    });
  });

  describe('updateConfig', () => {
    it('updates config and uses new values', async () => {
      globalThis.fetch = mockLangflowFetch('{"translations":{"p1":"test"}}');

      const service = new LangflowService({ ...mockConfig });
      service.updateConfig({
        ...mockConfig,
        endpointUrl: 'https://new-server.example.com/api/v1/run/new-flow',
        componentId: 'NewModel-XYZ',
      });

      await service.translate({
        texts: new Map([['p1', 'Hello']]),
        sourceLanguage: 'en',
        targetLanguage: 'Vietnamese',
      });

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const [url] = fetchCall;
      expect(url).toBe('https://new-server.example.com/api/v1/run/new-flow');

      const body = JSON.parse(fetchCall[1]?.body as string);
      expect(body.tweaks['NewModel-XYZ']).toBeDefined();
    });
  });

  describe('custom responseTextPath', () => {
    it('uses custom path for response extraction', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve({ result: { message: '{"status":"ok"}' } }),
        text: () => Promise.resolve('{"result":{"message":"{\\"status\\":\\"ok\\"}"}}'),
      });

      const service = new LangflowService({
        ...mockConfig,
        responseTextPath: 'result.message',
      });

      const result = await service.testConnection();
      expect(result.success).toBe(true);
    });
  });
});
