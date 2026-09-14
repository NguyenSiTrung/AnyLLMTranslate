import { describe, expect, it } from 'vitest';
import {
  contentHasThinkTags,
  detectThinkingSignals,
  evaluateThinkingProbe,
  extractReasoningContent,
  stripThinkTags,
} from '@/lib/thinkingDetection';
import {
  applyThinkingModeToRequest,
  deepseekReasoningEffort,
  geminiReasoningEffortForMode,
  geminiSupportsThinkingNone,
  isDeepSeekModelId,
  isDeepSeekOfficialBaseUrl,
  isGeminiOpenAiCompatBaseUrl,
  isOpenCodeZenBaseUrl,
  isThinkingKwargsRejected,
  normalizeThinkingEffort,
  normalizeThinkingMode,
  usesDeepSeekThinkingApi,
} from '@/lib/thinkingMode';
import type { ChatCompletionRequest } from '@/types/translation';

describe('thinking detection', () => {
  it('detects and strips thinking signals and evaluates probe outcomes', () => {
    expect(contentHasThinkTags('<think>plan</think>Hello')).toBe(true);
    expect(contentHasThinkTags('<think>unclosed tail')).toBe(true);
    expect(contentHasThinkTags('plain translation')).toBe(false);
    expect(contentHasThinkTags('')).toBe(false);
    expect(contentHasThinkTags(null)).toBe(false);

    expect(stripThinkTags('<think>x</think>\nXin chào')).toBe('Xin chào');
    expect(stripThinkTags('<think>still thinking')).toBe('');
    expect(stripThinkTags('no tags')).toBe('no tags');

    expect(extractReasoningContent({ content: 'hi', reasoning_content: ' step ' })).toBe('step');
    expect(extractReasoningContent({ content: 'hi', reasoning: 'r' })).toBe('r');
    expect(extractReasoningContent({ content: 'hi', thinking: 't' })).toBe('t');
    expect(extractReasoningContent({ content: 'hi', reasoning_content: '  ' })).toBeUndefined();
    expect(extractReasoningContent(null)).toBeUndefined();
    expect(
      detectThinkingSignals({
        message: { content: 'ok', reasoning_content: 'why' },
      }),
    ).toEqual({ detected: true, sources: ['reasoning_content'] });

    expect(
      detectThinkingSignals({
        content: '<think>x</think>ok',
        message: { content: '<think>x</think>ok' },
      }),
    ).toEqual({ detected: true, sources: ['think_tags'] });

    expect(
      detectThinkingSignals({
        message: { content: '<think>x</think>ok', reasoning_content: 'why' },
      }),
    ).toEqual({ detected: true, sources: ['reasoning_content', 'think_tags'] });

    expect(detectThinkingSignals({ message: { content: 'Xin chào' } })).toEqual({
      detected: false,
      sources: [],
    });
    const r = evaluateThinkingProbe({
      mode: 'off',
      controlsSent: true,
      controlsRejected: false,
      thinkingDetected: false,
      sources: [],
    });
    expect(r.verdict).toBe('disable-success');
    expect(r.summary).toMatch(/disable OK/i);
    const tags = evaluateThinkingProbe({
      mode: 'off',
      controlsSent: true,
      controlsRejected: false,
      thinkingDetected: true,
      sources: ['think_tags'],
    });
    expect(tags.verdict).toBe('disable-failed');
    expect(tags.summary).toMatch(/think/i);

    const rc = evaluateThinkingProbe({
      mode: 'off',
      controlsSent: true,
      controlsRejected: false,
      thinkingDetected: true,
      sources: ['reasoning_content'],
    });
    expect(rc.verdict).toBe('disable-failed');
    expect(rc.summary).toMatch(/reasoning_content/);

    const r2 = evaluateThinkingProbe({
      mode: 'off',
      controlsSent: true,
      controlsRejected: true,
      thinkingDetected: false,
      sources: [],
    });
    expect(r2.verdict).toBe('controls-rejected');

    expect(
      evaluateThinkingProbe({
        mode: 'auto',
        controlsSent: false,
        controlsRejected: false,
        thinkingDetected: false,
        sources: [],
      }).verdict,
    ).toBe('not-applicable');

    expect(
      evaluateThinkingProbe({
        mode: 'on',
        controlsSent: true,
        controlsRejected: false,
        thinkingDetected: true,
        sources: ['think_tags'],
      }).verdict,
    ).toBe('not-applicable');
  });
});

const baseRequest: ChatCompletionRequest = {
  model: 'nvidia/nemotron-3-nano-30b-a3b',
  messages: [{ role: 'user', content: 'hi' }],
  temperature: 0.3,
  max_tokens: 4096,
};

const geminiBase = 'https://generativelanguage.googleapis.com/v1beta/openai';
const deepseekBase = 'https://api.deepseek.com';
const openCodeZenBase = 'https://opencode.ai/zen/v1';

describe('normalizeThinkingMode / normalizeThinkingEffort / provider dialect mapping', () => {
  it('normalizes thinking modes/efforts and detects supported hosts/models', () => {
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
    expect(normalizeThinkingEffort('max')).toBe('max');
    expect(normalizeThinkingEffort(undefined)).toBe('medium');
    expect(normalizeThinkingEffort('xhigh')).toBe('medium');

    expect(isGeminiOpenAiCompatBaseUrl(geminiBase)).toBe(true);
    expect(isGeminiOpenAiCompatBaseUrl(`${geminiBase}/`)).toBe(true);
    expect(
      isGeminiOpenAiCompatBaseUrl('https://generativelanguage.googleapis.com/v1beta/openai/'),
    ).toBe(true);
    expect(isGeminiOpenAiCompatBaseUrl('https://api.openai.com/v1')).toBe(false);
    expect(isGeminiOpenAiCompatBaseUrl('https://openrouter.ai/api/v1')).toBe(false);
    expect(isGeminiOpenAiCompatBaseUrl('')).toBe(false);

    expect(isDeepSeekOfficialBaseUrl(deepseekBase)).toBe(true);
    expect(isDeepSeekOfficialBaseUrl('https://api.deepseek.com/')).toBe(true);
    expect(isDeepSeekOfficialBaseUrl('https://api.deepseek.com/v1')).toBe(true);
    expect(isDeepSeekOfficialBaseUrl('https://openrouter.ai/api/v1')).toBe(false);
    expect(isDeepSeekOfficialBaseUrl('https://opencode.ai/zen/v1')).toBe(false);
    expect(isDeepSeekOfficialBaseUrl('')).toBe(false);

    expect(isOpenCodeZenBaseUrl(openCodeZenBase)).toBe(true);
    expect(isOpenCodeZenBaseUrl('https://opencode.ai/zen/v1/')).toBe(true);
    expect(isOpenCodeZenBaseUrl('https://opencode.ai/api/v1')).toBe(false);
    expect(isOpenCodeZenBaseUrl(deepseekBase)).toBe(false);
    expect(isOpenCodeZenBaseUrl('')).toBe(false);

    // Any DeepSeek family id — not pinned to v4.
    expect(isDeepSeekModelId('deepseek-v4-flash')).toBe(true);
    expect(isDeepSeekModelId('deepseek-v4-flash-free')).toBe(true);
    expect(isDeepSeekModelId('deepseek-chat')).toBe(true);
    expect(isDeepSeekModelId('DeepSeek-Reasoner')).toBe(true);
    expect(isDeepSeekModelId('big-pickle')).toBe(false);
    expect(isDeepSeekModelId('gemini-2.5-flash')).toBe(false);
    expect(isDeepSeekModelId('')).toBe(false);

    // Strategy gate: Official always; Zen only with DeepSeek model.
    expect(usesDeepSeekThinkingApi(deepseekBase, 'deepseek-v4-pro')).toBe(true);
    expect(usesDeepSeekThinkingApi(deepseekBase, 'anything')).toBe(true);
    expect(usesDeepSeekThinkingApi(openCodeZenBase, 'deepseek-v4-flash')).toBe(true);
    expect(usesDeepSeekThinkingApi(openCodeZenBase, 'deepseek-chat')).toBe(true);
    expect(usesDeepSeekThinkingApi(openCodeZenBase, 'big-pickle')).toBe(false);
    expect(usesDeepSeekThinkingApi(openCodeZenBase, 'grok-4.5')).toBe(false);
    expect(usesDeepSeekThinkingApi('https://openrouter.ai/api/v1', 'deepseek/deepseek-chat')).toBe(
      false,
    );
  });
});

describe('geminiSupportsThinkingNone / geminiReasoningEffortForMode', () => {
  it('maps provider-dialect request fields: Gemini reasoning fields and DeepSeek thinking.type + reasoning_effort', () => {
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

    expect(applyThinkingModeToRequest(baseRequest, 'auto')).toBe(baseRequest);
    expect(applyThinkingModeToRequest(baseRequest, undefined)).toBe(baseRequest);
    expect(applyThinkingModeToRequest(baseRequest, 'auto').chat_template_kwargs).toBeUndefined();
    expect(applyThinkingModeToRequest(baseRequest, 'auto').enable_thinking).toBeUndefined();
    expect(
      applyThinkingModeToRequest(
        { ...baseRequest, model: 'gemini-2.5-flash' },
        'auto',
        { baseUrl: geminiBase },
      ).reasoning_effort,
    ).toBeUndefined();

    const onReq = applyThinkingModeToRequest(baseRequest, 'on');
    expect(onReq.enable_thinking).toBe(true);
    expect(onReq.chat_template_kwargs).toEqual({ enable_thinking: true });

    const offReq = applyThinkingModeToRequest(baseRequest, 'off');
    expect(offReq.enable_thinking).toBe(false);
    expect(offReq.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(offReq.reasoning_effort).toBeUndefined();

    const withExtra: ChatCompletionRequest = {
      ...baseRequest,
      chat_template_kwargs: { low_effort: true },
    };
    expect(applyThinkingModeToRequest(withExtra, 'off').chat_template_kwargs).toEqual({
      low_effort: true,
      enable_thinking: false,
    });
    expect(applyThinkingModeToRequest(withExtra, 'off').enable_thinking).toBe(false);

    // Gemini request-field application with thinkingEffort honored when on.
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

    // 3.x and 2.5 Pro always map off → minimal (no thinking=none support).
    const pro: ChatCompletionRequest = { ...baseRequest, model: 'gemini-2.5-pro' };
    expect(applyThinkingModeToRequest(g36, 'off', { baseUrl: geminiBase }).reasoning_effort).toBe(
      'minimal',
    );
    expect(applyThinkingModeToRequest(pro, 'off', { baseUrl: geminiBase }).reasoning_effort).toBe(
      'minimal',
    );

    // DeepSeek dialect: thinking.type + reasoning_effort (on) and omitted effort when off.
    const dsReq: ChatCompletionRequest = {
      ...baseRequest,
      model: 'deepseek-v4-flash',
    };

    expect(deepseekReasoningEffort('minimal')).toBe('low');
    expect(deepseekReasoningEffort('low')).toBe('low');
    expect(deepseekReasoningEffort('medium')).toBe('high');
    expect(deepseekReasoningEffort('high')).toBe('high');
    expect(deepseekReasoningEffort('max')).toBe('max');
    expect(deepseekReasoningEffort(undefined)).toBe('high');

    const dsOffReq = applyThinkingModeToRequest(dsReq, 'off', { baseUrl: deepseekBase });
    expect(dsOffReq.thinking).toEqual({ type: 'disabled' });
    expect(dsOffReq.reasoning_effort).toBeUndefined();
    expect(dsOffReq.enable_thinking).toBeUndefined();
    expect(dsOffReq.chat_template_kwargs).toBeUndefined();

    const dsOnDefault = applyThinkingModeToRequest(dsReq, 'on', { baseUrl: deepseekBase });
    expect(dsOnDefault.thinking).toEqual({ type: 'enabled' });
    expect(dsOnDefault.reasoning_effort).toBe('high');

    expect(
      applyThinkingModeToRequest(dsReq, 'on', {
        baseUrl: deepseekBase,
        thinkingEffort: 'low',
      }).reasoning_effort,
    ).toBe('low');
    expect(
      applyThinkingModeToRequest(dsReq, 'on', {
        baseUrl: deepseekBase,
        thinkingEffort: 'max',
      }).reasoning_effort,
    ).toBe('max');
    expect(
      applyThinkingModeToRequest(dsReq, 'on', {
        baseUrl: 'https://api.deepseek.com/v1',
        thinkingEffort: 'medium',
      }),
    ).toMatchObject({
      thinking: { type: 'enabled' },
      reasoning_effort: 'high',
    });

    // auto still no-ops
    expect(applyThinkingModeToRequest(dsReq, 'auto', { baseUrl: deepseekBase })).toBe(dsReq);

    const deepseekReq: ChatCompletionRequest = {
      ...baseRequest,
      model: 'deepseek-v4-flash-free',
    };
    const otherReq: ChatCompletionRequest = {
      ...baseRequest,
      model: 'big-pickle',
    };

    expect(
      applyThinkingModeToRequest(deepseekReq, 'off', { baseUrl: openCodeZenBase }),
    ).toMatchObject({ thinking: { type: 'disabled' } });
    expect(
      applyThinkingModeToRequest(deepseekReq, 'on', {
        baseUrl: openCodeZenBase,
        thinkingEffort: 'max',
      }),
    ).toMatchObject({
      thinking: { type: 'enabled' },
      reasoning_effort: 'max',
    });
    // Non-v4 DeepSeek ids also qualify (substring match).
    expect(
      applyThinkingModeToRequest(
        { ...baseRequest, model: 'deepseek-chat' },
        'on',
        { baseUrl: openCodeZenBase, thinkingEffort: 'low' },
      ),
    ).toMatchObject({
      thinking: { type: 'enabled' },
      reasoning_effort: 'low',
    });

    // Non-DeepSeek Zen models stay on the generic enable_thinking path.
    const otherOn = applyThinkingModeToRequest(otherReq, 'on', { baseUrl: openCodeZenBase });
    expect(otherOn.enable_thinking).toBe(true);
    expect(otherOn.chat_template_kwargs).toEqual({ enable_thinking: true });
    expect(otherOn.thinking).toBeUndefined();
    expect(otherOn.reasoning_effort).toBeUndefined();
  });
});

describe('isThinkingKwargsRejected', () => {
  it('detects known rejection phrases for NIM, Gemini, and DeepSeek', () => {
    expect(isThinkingKwargsRejected('Unknown field: chat_template_kwargs')).toBe(true);
    expect(isThinkingKwargsRejected('extra field enable_thinking not permitted')).toBe(true);
    expect(isThinkingKwargsRejected('Invalid enable thinking flag')).toBe(true);
    expect(isThinkingKwargsRejected('Unknown field: reasoning_effort')).toBe(true);
    expect(isThinkingKwargsRejected('Invalid reasoning effort value')).toBe(true);
    expect(isThinkingKwargsRejected('Unknown field: thinking')).toBe(true);
    expect(isThinkingKwargsRejected('Invalid value for thinking.type')).toBe(true);
    expect(isThinkingKwargsRejected('rate limit exceeded')).toBe(false);
    expect(isThinkingKwargsRejected('model spent budget on thinking')).toBe(false);
  });
});
