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

  it('covers generic and provider-dialect thinking controls, detection, and auto-mode behavior', async () => {
    // Generic: off → enable_thinking + kwargs; verdict disable-success.
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

    // reasoning_content detection.
    const reasoningFetch = vi.fn(async (url: string, init?: RequestInit) => {
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
    vi.stubGlobal('fetch', reasoningFetch);

    const reasoningResult = await testConnection(baseConfig({ thinkingMode: 'off' }));
    expect(reasoningResult.overall).toBe(true);
    expect(reasoningResult.thinking?.verdict).toBe('disable-failed');
    expect(reasoningResult.thinking?.sources).toContain('reasoning_content');

    // <think> tag detection.
    const tagFetch = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/models')) return okJson({ data: [{ id: 'm' }] });
      const body = JSON.parse(String(init?.body ?? '{}')) as { max_tokens?: number };
      if (body.max_tokens === 1) return okJson({ choices: [{ message: { content: 'x' } }] });
      return okJson({
        choices: [{ message: { content: '<think>plan</think>\nXin chào' } }],
      });
    });
    vi.stubGlobal('fetch', tagFetch);

    const tagResult = await testConnection(baseConfig({ thinkingMode: 'off' }));
    expect(tagResult.thinking?.verdict).toBe('disable-failed');
    expect(tagResult.thinking?.sources).toContain('think_tags');
    expect(tagResult.translationSample).toBe('Xin chào');

    // auto mode sends no controls.
    const autoFetch = vi.fn(async (url: string, init?: RequestInit) => {
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
    vi.stubGlobal('fetch', autoFetch);

    const autoResult = await testConnection(baseConfig({ thinkingMode: 'auto' }));
    expect(autoResult.thinking?.verdict).toBe('not-applicable');
    expect(autoResult.thinking?.controlsSent).toBe(false);

    // DeepSeek Official: off → thinking.type=disabled, no effort.
    const deepseekFetch = vi.fn(async (url: string, init?: RequestInit) => {
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
    vi.stubGlobal('fetch', deepseekFetch);

    let dsResult = await testConnection(
      baseConfig({
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-v4-flash',
        thinkingMode: 'off',
      }),
    );
    expect(dsResult.overall).toBe(true);
    expect(dsResult.thinking?.verdict).toBe('disable-success');
    expect(dsResult.thinking?.controlsSent).toBe(true);

    // DeepSeek Official: on → thinking.type=enabled + reasoning_effort.
    vi.unstubAllGlobals();
    const deepseekOnFetch = vi.fn(async (url: string, init?: RequestInit) => {
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
    vi.stubGlobal('fetch', deepseekOnFetch);

    dsResult = await testConnection(
      baseConfig({
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-v4-pro',
        thinkingMode: 'on',
        thinkingEffort: 'max',
      }),
    );
    expect(dsResult.overall).toBe(true);
    expect(dsResult.thinking?.controlsSent).toBe(true);
    expect(dsResult.thinking?.thinkingDetected).toBe(true);

    // OpenCode Zen: thinking.type=enabled + reasoning_effort low.
    const zenFetch = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/models')) return okJson({ data: [{ id: 'deepseek-v4-flash-free' }] });
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        max_tokens?: number;
        thinking?: { type?: string };
        reasoning_effort?: string;
        enable_thinking?: unknown;
      };
      if (body.max_tokens === 1) return okJson({ choices: [{ message: { content: 'x' } }] });
      expect(body.thinking).toEqual({ type: 'enabled' });
      expect(body.reasoning_effort).toBe('low');
      expect(body.enable_thinking).toBeUndefined();
      return okJson({ choices: [{ message: { content: 'Xin chào' } }] });
    });
    vi.stubGlobal('fetch', zenFetch);

    const zenResult = await testConnection(
      baseConfig({
        baseUrl: 'https://opencode.ai/zen/v1',
        model: 'deepseek-v4-flash-free',
        thinkingMode: 'on',
        thinkingEffort: 'low',
      }),
    );
    expect(zenResult.overall).toBe(true);
    expect(zenResult.thinking?.controlsSent).toBe(true);
  });

  it('retries without rejected thinking controls and validates probe budget/empty or reasoning-only responses', async () => {
    // Controls rejection: 400 → retry without controls; verdict controls-rejected.
    let translationCalls = 0;
    const rejectFetch = vi.fn(async (url: string, init?: RequestInit) => {
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
    vi.stubGlobal('fetch', rejectFetch);

    const rejected = await testConnection(baseConfig({ thinkingMode: 'off' }));
    expect(rejected.overall).toBe(true);
    expect(rejected.thinking?.verdict).toBe('controls-rejected');
    expect(translationCalls).toBe(2);

    // HTTP 200 with null content and 0 completion tokens.
    const nullFetch = vi.fn(async (url: string, init?: RequestInit) => {
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
    vi.stubGlobal('fetch', nullFetch);

    const nullResult = await testConnection(baseConfig({ model: 'qwen3.8-max-preview' }));
    expect(nullResult.overall).toBe(false);
    let translation = nullResult.steps.find((s) => s.name === 'translation');
    expect(translation?.success).toBe(false);
    expect(translation?.error).toMatch(/Empty response from LLM/i);
    expect(translation?.error).toMatch(/0 completion tokens/i);

    // Reasoning burned the completion budget — empty content with a reasoning
    // field and finish_reason length hints at disabling thinking.
    vi.unstubAllGlobals();
    const reasoningFetch = vi.fn(async (url: string, init?: RequestInit) => {
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
    vi.stubGlobal('fetch', reasoningFetch);

    const budgetResult = await testConnection(
      baseConfig({
        model: 'step-3.7-flash',
        baseUrl: 'https://api.stepfun.ai/step_plan/v1',
        thinkingMode: 'auto',
      }),
    );
    expect(budgetResult.overall).toBe(false);
    translation = budgetResult.steps.find((s) => s.name === 'translation');
    expect(translation?.success).toBe(false);
    expect(translation?.error).toMatch(/Empty response from LLM/i);
    expect(translation?.error).toMatch(/reasoning/i);
    expect(translation?.error).toMatch(/Thinking mode to Off/i);

    // Probe budget floor: maxTokens 100 still requests >= 1024 for the probe.
    const floorFetch = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/models')) return okJson({ data: [{ id: 'm' }] });
      const body = JSON.parse(String(init?.body ?? '{}')) as { max_tokens?: number };
      if (body.max_tokens === 1) return okJson({ choices: [{ message: { content: 'x' } }] });
      expect(body.max_tokens).toBeGreaterThanOrEqual(1024);
      return okJson({ choices: [{ message: { content: 'Xin chào' } }] });
    });
    vi.stubGlobal('fetch', floorFetch);

    const floorResult = await testConnection(baseConfig({ maxTokens: 100, thinkingMode: 'auto' }));
    expect(floorResult.overall).toBe(true);
    expect(floorResult.translationSample).toBe('Xin chào');
  });
});
