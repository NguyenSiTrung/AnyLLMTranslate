import { describe, it, expect } from 'vitest';
import {
  applyThinkingModeToRequest,
  geminiReasoningEffortForMode,
  geminiSupportsThinkingNone,
  isGeminiOpenAiCompatBaseUrl,
  isThinkingKwargsRejected,
  normalizeThinkingEffort,
  normalizeThinkingMode,
} from '@/lib/thinkingMode';
import type { ChatCompletionRequest } from '@/types/translation';

const baseRequest: ChatCompletionRequest = {
  model: 'nvidia/nemotron-3-nano-30b-a3b',
  messages: [{ role: 'user', content: 'hi' }],
  temperature: 0.3,
  max_tokens: 4096,
};

const geminiBase = 'https://generativelanguage.googleapis.com/v1beta/openai';

describe('normalizeThinkingMode / normalizeThinkingEffort', () => {
  it('accepts known values and defaults unknown to auto/medium', () => {
    expect(normalizeThinkingMode('auto')).toBe('auto');
    expect(normalizeThinkingMode('on')).toBe('on');
    expect(normalizeThinkingMode('off')).toBe('off');
    expect(normalizeThinkingMode(undefined)).toBe('auto');
    expect(normalizeThinkingMode('maybe')).toBe('auto');
    expect(normalizeThinkingMode(null)).toBe('auto');

    expect(normalizeThinkingEffort('minimal')).toBe('minimal');
    expect(normalizeThinkingEffort('low')).toBe('low');
    expect(normalizeThinkingEffort('medium')).toBe('medium');
    expect(normalizeThinkingEffort('high')).toBe('high');
    expect(normalizeThinkingEffort(undefined)).toBe('medium');
    expect(normalizeThinkingEffort('max')).toBe('medium');
  });
});

describe('isGeminiOpenAiCompatBaseUrl', () => {
  it('detects Google AI Studio OpenAI-compat hosts', () => {
    expect(isGeminiOpenAiCompatBaseUrl(geminiBase)).toBe(true);
    expect(isGeminiOpenAiCompatBaseUrl(`${geminiBase}/`)).toBe(true);
    expect(
      isGeminiOpenAiCompatBaseUrl('https://generativelanguage.googleapis.com/v1beta/openai/'),
    ).toBe(true);
    expect(isGeminiOpenAiCompatBaseUrl('https://api.openai.com/v1')).toBe(false);
    expect(isGeminiOpenAiCompatBaseUrl('https://openrouter.ai/api/v1')).toBe(false);
    expect(isGeminiOpenAiCompatBaseUrl('')).toBe(false);
  });
});

describe('geminiSupportsThinkingNone / geminiReasoningEffortForMode', () => {
  it('allows none only where supported; maps off/on to reasoning_effort per family', () => {
    expect(geminiSupportsThinkingNone('gemini-2.5-flash')).toBe(true);
    expect(geminiSupportsThinkingNone('gemini-2.5-flash-lite')).toBe(true);
    expect(geminiSupportsThinkingNone('models/gemini-2.5-flash')).toBe(true);

    expect(geminiSupportsThinkingNone('gemini-2.5-pro')).toBe(false);
    expect(geminiSupportsThinkingNone('gemini-3.6-flash')).toBe(false);
    expect(geminiSupportsThinkingNone('gemini-3-flash')).toBe(false);
    expect(geminiSupportsThinkingNone('gemini-3.1-pro')).toBe(false);
    expect(geminiReasoningEffortForMode('off', 'gemini-2.5-flash')).toBe('none');
    expect(geminiReasoningEffortForMode('off', 'gemini-3.6-flash')).toBe('minimal');
    expect(geminiReasoningEffortForMode('off', 'gemini-2.5-pro')).toBe('minimal');
    expect(geminiReasoningEffortForMode('on', 'gemini-2.5-flash')).toBe('medium');
    expect(geminiReasoningEffortForMode('on', 'gemini-3.6-flash')).toBe('medium');
    expect(geminiReasoningEffortForMode('on', 'gemini-3.6-flash', 'low')).toBe('low');
    expect(geminiReasoningEffortForMode('on', 'gemini-3.6-flash', 'high')).toBe('high');
    expect(geminiReasoningEffortForMode('on', 'gemini-2.5-flash', 'minimal')).toBe('minimal');
  });
});

describe('applyThinkingModeToRequest', () => {
  it('omits thinking fields for auto or undefined', () => {
    expect(applyThinkingModeToRequest(baseRequest, 'auto')).toBe(baseRequest);
    expect(applyThinkingModeToRequest(baseRequest, undefined)).toBe(baseRequest);
    expect(applyThinkingModeToRequest(baseRequest, 'auto').chat_template_kwargs).toBeUndefined();
    expect(
      applyThinkingModeToRequest(
        { ...baseRequest, model: 'gemini-2.5-flash' },
        'auto',
        { baseUrl: geminiBase },
      ).reasoning_effort,
    ).toBeUndefined();
  });

  it('sets enable_thinking true/false and preserves existing chat_template_kwargs keys', () => {
    expect(applyThinkingModeToRequest(baseRequest, 'on').chat_template_kwargs).toEqual({
      enable_thinking: true,
    });
    expect(applyThinkingModeToRequest(baseRequest, 'off').chat_template_kwargs).toEqual({
      enable_thinking: false,
    });
    expect(applyThinkingModeToRequest(baseRequest, 'off').reasoning_effort).toBeUndefined();

    const withExtra: ChatCompletionRequest = {
      ...baseRequest,
      chat_template_kwargs: { low_effort: true },
    };
    expect(applyThinkingModeToRequest(withExtra, 'off').chat_template_kwargs).toEqual({
      low_effort: true,
      enable_thinking: false,
    });
  });

  it('uses reasoning_effort on Gemini and honors thinkingEffort when mode is on', () => {
    const req: ChatCompletionRequest = {
      ...baseRequest,
      model: 'gemini-2.5-flash',
    };
    expect(applyThinkingModeToRequest(req, 'off', { baseUrl: geminiBase })).toMatchObject({
      reasoning_effort: 'none',
    });
    expect(
      applyThinkingModeToRequest(req, 'off', { baseUrl: geminiBase }).chat_template_kwargs,
    ).toBeUndefined();
    expect(applyThinkingModeToRequest(req, 'on', { baseUrl: geminiBase })).toMatchObject({
      reasoning_effort: 'medium',
    });

    const g36: ChatCompletionRequest = {
      ...baseRequest,
      model: 'gemini-3.6-flash',
    };
    expect(
      applyThinkingModeToRequest(g36, 'on', {
        baseUrl: geminiBase,
        thinkingEffort: 'low',
      }).reasoning_effort,
    ).toBe('low');
    expect(
      applyThinkingModeToRequest(g36, 'on', {
        baseUrl: geminiBase,
        thinkingEffort: 'high',
      }).reasoning_effort,
    ).toBe('high');
    // Effort is ignored when mode is off
    expect(
      applyThinkingModeToRequest(g36, 'off', {
        baseUrl: geminiBase,
        thinkingEffort: 'high',
      }).reasoning_effort,
    ).toBe('minimal');
  });

  it('uses minimal for Gemini 3.x and 2.5 Pro when thinkingMode is off', () => {
    const g3: ChatCompletionRequest = { ...baseRequest, model: 'gemini-3.6-flash' };
    const pro: ChatCompletionRequest = { ...baseRequest, model: 'gemini-2.5-pro' };
    expect(applyThinkingModeToRequest(g3, 'off', { baseUrl: geminiBase }).reasoning_effort).toBe(
      'minimal',
    );
    expect(applyThinkingModeToRequest(pro, 'off', { baseUrl: geminiBase }).reasoning_effort).toBe(
      'minimal',
    );
  });
});

describe('isThinkingKwargsRejected', () => {
  it('detects known rejection phrases for NIM and Gemini', () => {
    expect(isThinkingKwargsRejected('Unknown field: chat_template_kwargs')).toBe(true);
    expect(isThinkingKwargsRejected('extra field enable_thinking not permitted')).toBe(true);
    expect(isThinkingKwargsRejected('Invalid enable thinking flag')).toBe(true);
    expect(isThinkingKwargsRejected('Unknown field: reasoning_effort')).toBe(true);
    expect(isThinkingKwargsRejected('Invalid reasoning effort value')).toBe(true);
    expect(isThinkingKwargsRejected('rate limit exceeded')).toBe(false);
  });
});
