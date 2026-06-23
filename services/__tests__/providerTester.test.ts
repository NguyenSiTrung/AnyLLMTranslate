/**
 * Tests for provider connection tester.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { listProviderModels, testConnection } from '@/services/providerTester';
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

  it('continues when models fail but ping succeeds', async () => {
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

    expect(result.overall).toBe(false);
    expect(result.steps).toHaveLength(3);
    expect(result.steps[1].name).toBe('models');
    expect(result.steps[1].success).toBe(false);
    expect(result.models).toEqual([]);
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
    // Pings error message is truncated to 200 chars
    expect((result.steps[0].error ?? '').length).toBeLessThan(300);
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
