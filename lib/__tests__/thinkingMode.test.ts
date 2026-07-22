import { describe, it, expect } from 'vitest';
import {
  applyThinkingModeToRequest,
  isThinkingKwargsRejected,
  normalizeThinkingMode,
} from '@/lib/thinkingMode';
import type { ChatCompletionRequest } from '@/types/translation';

const baseRequest: ChatCompletionRequest = {
  model: 'nvidia/nemotron-3-nano-30b-a3b',
  messages: [{ role: 'user', content: 'hi' }],
  temperature: 0.3,
  max_tokens: 4096,
};

describe('normalizeThinkingMode', () => {
  it('accepts auto/on/off and defaults unknown to auto', () => {
    expect(normalizeThinkingMode('auto')).toBe('auto');
    expect(normalizeThinkingMode('on')).toBe('on');
    expect(normalizeThinkingMode('off')).toBe('off');
    expect(normalizeThinkingMode(undefined)).toBe('auto');
    expect(normalizeThinkingMode('maybe')).toBe('auto');
    expect(normalizeThinkingMode(null)).toBe('auto');
  });
});

describe('applyThinkingModeToRequest', () => {
  it('omits chat_template_kwargs for auto or undefined', () => {
    expect(applyThinkingModeToRequest(baseRequest, 'auto')).toBe(baseRequest);
    expect(applyThinkingModeToRequest(baseRequest, undefined)).toBe(baseRequest);
    expect(applyThinkingModeToRequest(baseRequest, 'auto').chat_template_kwargs).toBeUndefined();
  });

  it('sets enable_thinking true/false for on/off', () => {
    expect(applyThinkingModeToRequest(baseRequest, 'on').chat_template_kwargs).toEqual({
      enable_thinking: true,
    });
    expect(applyThinkingModeToRequest(baseRequest, 'off').chat_template_kwargs).toEqual({
      enable_thinking: false,
    });
  });

  it('preserves existing chat_template_kwargs keys', () => {
    const withExtra: ChatCompletionRequest = {
      ...baseRequest,
      chat_template_kwargs: { low_effort: true },
    };
    expect(applyThinkingModeToRequest(withExtra, 'off').chat_template_kwargs).toEqual({
      low_effort: true,
      enable_thinking: false,
    });
  });
});

describe('isThinkingKwargsRejected', () => {
  it('detects known rejection phrases', () => {
    expect(isThinkingKwargsRejected('Unknown field: chat_template_kwargs')).toBe(true);
    expect(isThinkingKwargsRejected('extra field enable_thinking not permitted')).toBe(true);
    expect(isThinkingKwargsRejected('Invalid enable thinking flag')).toBe(true);
    expect(isThinkingKwargsRejected('rate limit exceeded')).toBe(false);
  });
});
