/**
 * Connection tester applies thinkingMode and probes reasoning in the translation step.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { testConnection } from '@/services/providerTester';
import type { ProviderConfig } from '@/types/config';

function baseConfig(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    preset: 'custom',
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'sk-test',
    model: 'qwen-test',
    temperature: 0.3,
    maxTokens: 100,
    displayName: 'Test',
    requiresApiKey: true,
    thinkingMode: 'off',
    ...overrides,
  };
}

function okJson(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function failJson(status: number, text: string) {
  return {
    ok: false,
    status,
    json: async () => ({ error: text }),
    text: async () => text,
  };
}

describe('testConnection thinking probe', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends enable_thinking false when thinkingMode is off and reports disable-success', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/models') || u.includes('/models?')) {
        return okJson({ data: [{ id: 'qwen-test' }] });
      }
      // ping or translation
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        max_tokens?: number;
        enable_thinking?: boolean;
        chat_template_kwargs?: { enable_thinking?: boolean };
      };
      if (body.max_tokens === 1) {
        return okJson({ choices: [{ message: { content: 'Hi' } }] });
      }
      // Dual form: top-level (StepFun) + nested kwargs (NIM/vLLM).
      expect(body.enable_thinking).toBe(false);
      expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
      return okJson({
        choices: [{ message: { content: 'Xin chào, bạn khỏe không?' } }],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await testConnection(baseConfig({ thinkingMode: 'off' }));

    expect(result.overall).toBe(true);
    expect(result.thinking?.verdict).toBe('disable-success');
    expect(result.thinking?.thinkingDetected).toBe(false);
    expect(result.translationSample).toBe('Xin chào, bạn khỏe không?');
  });

  it('detects reasoning_content as disable-failed when mode is off', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/models')) return okJson({ data: [{ id: 'm' }] });
      const body = JSON.parse(String(init?.body ?? '{}')) as { max_tokens?: number };
      if (body.max_tokens === 1) return okJson({ choices: [{ message: { content: 'x' } }] });
      return okJson({
        choices: [
          {
            message: {
              content: 'Hello',
              reasoning_content: 'I should translate carefully',
            },
          },
        ],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await testConnection(baseConfig({ thinkingMode: 'off' }));
    expect(result.overall).toBe(true);
    expect(result.thinking?.verdict).toBe('disable-failed');
    expect(result.thinking?.sources).toContain('reasoning_content');
  });

  it('detects <think> tags as disable-failed and strips them from sample', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/models')) return okJson({ data: [{ id: 'm' }] });
      const body = JSON.parse(String(init?.body ?? '{}')) as { max_tokens?: number };
      if (body.max_tokens === 1) return okJson({ choices: [{ message: { content: 'x' } }] });
      return okJson({
        choices: [{ message: { content: '<think>plan</think>\nXin chào' } }],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await testConnection(baseConfig({ thinkingMode: 'off' }));
    expect(result.thinking?.verdict).toBe('disable-failed');
    expect(result.thinking?.sources).toContain('think_tags');
    expect(result.translationSample).toBe('Xin chào');
  });

  it('omits thinking fields when mode is auto', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/models')) return okJson({ data: [{ id: 'm' }] });
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        max_tokens?: number;
        enable_thinking?: unknown;
        chat_template_kwargs?: unknown;
        reasoning_effort?: unknown;
        thinking?: unknown;
      };
      if (body.max_tokens === 1) return okJson({ choices: [{ message: { content: 'x' } }] });
      expect(body.enable_thinking).toBeUndefined();
      expect(body.chat_template_kwargs).toBeUndefined();
      expect(body.reasoning_effort).toBeUndefined();
      expect(body.thinking).toBeUndefined();
      return okJson({ choices: [{ message: { content: 'Hi' } }] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await testConnection(baseConfig({ thinkingMode: 'auto' }));
    expect(result.thinking?.verdict).toBe('not-applicable');
    expect(result.thinking?.controlsSent).toBe(false);
  });

  it('sends DeepSeek thinking.type disabled when thinkingMode is off', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/models')) return okJson({ data: [{ id: 'deepseek-v4-flash' }] });
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        max_tokens?: number;
        thinking?: { type?: string };
        reasoning_effort?: string;
        enable_thinking?: unknown;
        chat_template_kwargs?: unknown;
      };
      if (body.max_tokens === 1) return okJson({ choices: [{ message: { content: 'x' } }] });
      expect(body.thinking).toEqual({ type: 'disabled' });
      expect(body.reasoning_effort).toBeUndefined();
      expect(body.enable_thinking).toBeUndefined();
      expect(body.chat_template_kwargs).toBeUndefined();
      return okJson({ choices: [{ message: { content: 'Xin chào' } }] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await testConnection(
      baseConfig({
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-v4-flash',
        thinkingMode: 'off',
      }),
    );
    expect(result.overall).toBe(true);
    expect(result.thinking?.verdict).toBe('disable-success');
    expect(result.thinking?.controlsSent).toBe(true);
  });

  it('sends DeepSeek thinking enabled + reasoning_effort when mode is on', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/models')) return okJson({ data: [{ id: 'deepseek-v4-pro' }] });
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        max_tokens?: number;
        thinking?: { type?: string };
        reasoning_effort?: string;
      };
      if (body.max_tokens === 1) return okJson({ choices: [{ message: { content: 'x' } }] });
      expect(body.thinking).toEqual({ type: 'enabled' });
      expect(body.reasoning_effort).toBe('max');
      return okJson({
        choices: [
          {
            message: {
              content: 'Hello',
              reasoning_content: 'thinking carefully',
            },
          },
        ],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await testConnection(
      baseConfig({
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-v4-pro',
        thinkingMode: 'on',
        thinkingEffort: 'max',
      }),
    );
    expect(result.overall).toBe(true);
    expect(result.thinking?.controlsSent).toBe(true);
    expect(result.thinking?.thinkingDetected).toBe(true);
  });

  it('retries without thinking controls when provider rejects them', async () => {
    let translationCalls = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/models')) return okJson({ data: [{ id: 'm' }] });
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        max_tokens?: number;
        enable_thinking?: unknown;
        chat_template_kwargs?: unknown;
      };
      if (body.max_tokens === 1) return okJson({ choices: [{ message: { content: 'x' } }] });
      translationCalls += 1;
      if (translationCalls === 1) {
        expect(body.chat_template_kwargs).toBeDefined();
        expect(body.enable_thinking).toBeDefined();
        return failJson(400, 'Unknown field: chat_template_kwargs');
      }
      expect(body.chat_template_kwargs).toBeUndefined();
      expect(body.enable_thinking).toBeUndefined();
      return okJson({ choices: [{ message: { content: 'OK' } }] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await testConnection(baseConfig({ thinkingMode: 'off' }));
    expect(result.overall).toBe(true);
    expect(result.thinking?.verdict).toBe('controls-rejected');
    expect(translationCalls).toBe(2);
  });

  it('fails translation step when HTTP 200 returns null/empty content', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/models')) return okJson({ data: [{ id: 'qwen3.8-max-preview' }] });
      const body = JSON.parse(String(init?.body ?? '{}')) as { max_tokens?: number };
      if (body.max_tokens === 1) {
        // Ping may still be 200 with empty body on broken proxy models.
        return okJson({
          choices: [{ message: { content: null } }],
          usage: { completion_tokens: 0 },
        });
      }
      return okJson({
        choices: [{ message: { role: 'assistant', content: null }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 36, completion_tokens: 0, total_tokens: 36 },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await testConnection(baseConfig({ model: 'qwen3.8-max-preview' }));
    expect(result.overall).toBe(false);
    const translation = result.steps.find((s) => s.name === 'translation');
    expect(translation?.success).toBe(false);
    expect(translation?.error).toMatch(/Empty response from LLM/i);
    expect(translation?.error).toMatch(/0 completion tokens/i);
  });

  it('explains empty content when reasoning burned the completion budget', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/models')) return okJson({ data: [{ id: 'step-3.7-flash' }] });
      const body = JSON.parse(String(init?.body ?? '{}')) as { max_tokens?: number };
      if (body.max_tokens === 1) {
        return okJson({ choices: [{ message: { content: '' } }] });
      }
      // Mirrors StepFun step_plan: content empty, reasoning filled, finish length.
      return okJson({
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
              reasoning: 'planning the translation…',
              reasoning_content: 'planning the translation…',
            },
            finish_reason: 'length',
          },
        ],
        usage: { prompt_tokens: 42, completion_tokens: 200, total_tokens: 242 },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await testConnection(
      baseConfig({
        model: 'step-3.7-flash',
        baseUrl: 'https://api.stepfun.ai/step_plan/v1',
        thinkingMode: 'auto',
      }),
    );
    expect(result.overall).toBe(false);
    const translation = result.steps.find((s) => s.name === 'translation');
    expect(translation?.success).toBe(false);
    expect(translation?.error).toMatch(/Empty response from LLM/i);
    expect(translation?.error).toMatch(/reasoning/i);
    expect(translation?.error).toMatch(/Thinking mode to Off/i);
  });

  it('uses at least 1024 max_tokens on the translation probe', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/models')) return okJson({ data: [{ id: 'm' }] });
      const body = JSON.parse(String(init?.body ?? '{}')) as { max_tokens?: number };
      if (body.max_tokens === 1) return okJson({ choices: [{ message: { content: 'x' } }] });
      expect(body.max_tokens).toBeGreaterThanOrEqual(1024);
      return okJson({ choices: [{ message: { content: 'Xin chào' } }] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await testConnection(baseConfig({ maxTokens: 100, thinkingMode: 'auto' }));
    expect(result.overall).toBe(true);
    expect(result.translationSample).toBe('Xin chào');
  });
});
