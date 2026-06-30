/**
 * Tests for provider connection tester.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  extractCompletionText,
  listProviderModels,
  normalizeProviderBaseUrl,
  parseProviderErrorBody,
  testConnection,
} from '@/services/providerTester';
import type { ProviderConfig } from '@/types/config';
import type { ConnectionTestProgress } from '@/services/providerTester';

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

describe('listProviderModels', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns model ids on success', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ id: 'a' }, { id: 'b' }] }), { status: 200 }),
    ) as typeof fetch;

    const result = await listProviderModels({
      baseUrl: 'http://localhost:11434/v1',
      apiKey: '',
    });

    expect(result.success).toBe(true);
    expect(result.models).toEqual(['a', 'b']);
  });

  it('returns error when listing fails', async () => {
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 403 })) as typeof fetch;

    const result = await listProviderModels({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-x',
    });

    expect(result.success).toBe(false);
    expect(result.models).toEqual([]);
    expect(result.error).toContain('403');
  });
});

describe('testConnection', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal('performance', { now: vi.fn(() => 100) });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns overall success when all 3 steps pass', async () => {
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : (url as URL).toString();

      if (urlStr.includes('/chat/completions')) {
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Xin chào' } }],
          }),
          { status: 200 },
        );
      }
      if (urlStr.includes('/models')) {
        return new Response(
          JSON.stringify({
            data: [{ id: 'gemma3:4b' }, { id: 'llama3' }],
          }),
          { status: 200 },
        );
      }
      return new Response('Not found', { status: 404 });
    }) as typeof fetch;

    const result = await testConnection(mockConfig);

    expect(result.overall).toBe(true);
    expect(result.steps).toHaveLength(3);
    expect(result.steps[0].name).toBe('ping');
    expect(result.steps[0].success).toBe(true);
    expect(result.steps[1].name).toBe('models');
    expect(result.steps[1].success).toBe(true);
    expect(result.steps[2].name).toBe('translation');
    expect(result.steps[2].success).toBe(true);
    expect(result.models).toEqual(['gemma3:4b', 'llama3']);
    expect(result.translationSample).toBe('Xin chào');
  });

  it('returns failure immediately when ping fails', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('Connection refused');
    }) as typeof fetch;

    const result = await testConnection(mockConfig);

    expect(result.overall).toBe(false);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].name).toBe('ping');
    expect(result.steps[0].success).toBe(false);
    expect(result.steps[0].error).toContain('Connection refused');
  });

  it('succeeds overall when models fail but ping and translation pass', async () => {
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : (url as URL).toString();
      if (urlStr.includes('/models')) {
        return new Response('Unauthorized', { status: 401 });
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
        { status: 200 },
      );
    }) as typeof fetch;

    const result = await testConnection(mockConfig);

    expect(result.overall).toBe(true);
    expect(result.steps).toHaveLength(3);
    expect(result.steps[1].name).toBe('models');
    expect(result.steps[1].success).toBe(false);
    expect(result.models).toEqual([]);
  });

  it('fails ping when HTTP 200 returns an empty completion', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: '' } }] }), { status: 200 }),
    ) as typeof fetch;

    const result = await testConnection(mockConfig);

    expect(result.overall).toBe(false);
    expect(result.steps[0].success).toBe(false);
    expect(result.steps[0].error).toContain('empty completion');
  });

  it('accepts reasoning-field completions from VLM models', () => {
    const text = extractCompletionText({
      choices: [{ message: { content: '', reasoning: 'OK' } }],
    });
    expect(text).toBe('OK');
  });

  it('strips /chat/completions suffix from pasted base URLs', () => {
    expect(normalizeProviderBaseUrl('https://integrate.api.nvidia.com/v1/chat/completions/'))
      .toBe('https://integrate.api.nvidia.com/v1');
  });

  it('parses JSON provider error bodies', () => {
    const msg = parseProviderErrorBody(
      '{"error":{"message":"model not found"}}',
      404,
    );
    expect(msg).toBe('model not found');
  });

  it('normalizes trailing slash on baseUrl to avoid double-slash 404', async () => {
    const capturedUrls: string[] = [];

    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : (url as URL).toString();
      capturedUrls.push(urlStr);
      if (urlStr.includes('/models')) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
        { status: 200 },
      );
    }) as typeof fetch;

    await testConnection({ ...mockConfig, baseUrl: 'http://localhost:11434/v1/' });

    expect(capturedUrls.some((u) => u.includes('/v1//'))).toBe(false);
    expect(capturedUrls.some((u) => u.endsWith('/v1/chat/completions'))).toBe(true);
    expect(capturedUrls.some((u) => u.endsWith('/v1/models'))).toBe(true);
  });

  it('includes API key in Authorization header when provided', async () => {
    const configWithKey = { ...mockConfig, apiKey: 'sk-test123' };
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.headers) {
        capturedHeaders = init.headers as Record<string, string>;
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
        { status: 200 },
      );
    }) as typeof fetch;

    await testConnection(configWithKey);

    expect(capturedHeaders['Authorization']).toBe('Bearer sk-test123');
  });

  it('calls progress callback for each step', async () => {
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : (url as URL).toString();
      if (urlStr.includes('/models')) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
        { status: 200 },
      );
    }) as typeof fetch;

    const progress: ConnectionTestProgress = vi.fn();
    await testConnection(mockConfig, progress);

    expect(progress).toHaveBeenCalledTimes(3);
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ name: 'ping' }), 0);
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ name: 'models' }), 1);
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ name: 'translation' }), 2);
  });

  it('handles HTTP error responses with message truncation', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response('A'.repeat(500), { status: 500 });
    }) as typeof fetch;

    const result = await testConnection(mockConfig);

    expect(result.overall).toBe(false);
    expect(result.steps[0].error).toContain('HTTP 500');
    // Provider error bodies are truncated to 300 chars (+ status prefix)
    expect((result.steps[0].error ?? '').length).toBeLessThan(320);
  });

  it('reports total latency as sum of all step latencies', async () => {
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : (url as URL).toString();
      if (urlStr.includes('/models')) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
        { status: 200 },
      );
    }) as typeof fetch;

    const result = await testConnection(mockConfig);

    expect(result.totalLatencyMs).toBeGreaterThanOrEqual(0);
    const summed = result.steps.reduce((s, step) => s + step.latencyMs, 0);
    expect(result.totalLatencyMs).toBe(summed);
  });
});
