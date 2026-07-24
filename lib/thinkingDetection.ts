/**
 * Detect model thinking/reasoning artifacts in OpenAI-compatible responses.
 *
 * Two common channels:
 * 1. Separate field: `message.reasoning_content` (DeepSeek-R1 style, some NIM/vLLM)
 * 2. Tags in content: `<think>...</think>` (Qwen3 / many chat templates)
 *
 * Used by the provider connection tester to judge whether Thinking mode Off
 * actually suppressed reasoning in the sample response.
 */

import type { ThinkingMode } from '@/types/config';
import { normalizeThinkingMode } from '@/lib/thinkingMode';

/** Where thinking was found in the response. */
export type ThinkingSignalSource = 'reasoning_content' | 'think_tags';

/**
 * Outcome of probing a translation-test response for thinking, relative to
 * the provider's configured thinkingMode.
 */
export type ThinkingDisableVerdict =
  /** Mode off, controls sent, no thinking artifacts — disable looks successful. */
  | 'disable-success'
  /** Mode off, but reasoning still present in the response. */
  | 'disable-failed'
  /** Provider rejected thinking control fields (fell back / no force). */
  | 'controls-rejected'
  /** Mode auto or on — disable probe is not applicable. */
  | 'not-applicable';

export interface ThinkingProbeResult {
  mode: ThinkingMode;
  /** True when the request included enable_thinking / reasoning_effort. */
  controlsSent: boolean;
  /** True when the API rejected thinking controls (400 + known message). */
  controlsRejected: boolean;
  /** True when any thinking artifact was found in the response. */
  thinkingDetected: boolean;
  /** Which channels contributed to detection. */
  sources: ThinkingSignalSource[];
  verdict: ThinkingDisableVerdict;
  /** Short human-readable line for UI / toasts. */
  summary: string;
}

const THINK_TAG_OPEN = /<think\b/i;
const THINK_TAG_CLOSE = /<\/think>/i;

/** True when content embeds think-style tags (open, closed, or unclosed). */
export function contentHasThinkTags(content: string | null | undefined): boolean {
  if (!content) return false;
  return THINK_TAG_OPEN.test(content) || THINK_TAG_CLOSE.test(content);
}

/** Strip think blocks (closed or trailing unclosed) for clean sample display. */
export function stripThinkTags(content: string): string {
  return content
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '')
    .replace(/<think\b[^>]*>[\s\S]*$/gi, '')
    .trim();
}

/**
 * Non-empty reasoning text from a chat message object, if present.
 * Checks `reasoning_content` first (canonical OpenAI-compat), then common aliases.
 */
export function extractReasoningContent(message: unknown): string | undefined {
  if (!message || typeof message !== 'object') return undefined;
  const m = message as Record<string, unknown>;
  for (const key of ['reasoning_content', 'reasoning', 'thinking'] as const) {
    const v = m[key];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return undefined;
}

export interface DetectThinkingInput {
  /** Raw message.content string (may include think tags). */
  content?: string | null;
  /** Full message object from choices[0].message (for reasoning_content). */
  message?: unknown;
}

/**
 * Detect thinking signals in a completion message.
 * Returns which sources fired; empty sources = no thinking detected.
 */
export function detectThinkingSignals(input: DetectThinkingInput): {
  detected: boolean;
  sources: ThinkingSignalSource[];
} {
  const sources: ThinkingSignalSource[] = [];
  const content =
    input.content ??
    (input.message &&
    typeof input.message === 'object' &&
    typeof (input.message as { content?: unknown }).content === 'string'
      ? (input.message as { content: string }).content
      : undefined);

  if (extractReasoningContent(input.message)) {
    sources.push('reasoning_content');
  }
  if (contentHasThinkTags(content)) {
    sources.push('think_tags');
  }

  return { detected: sources.length > 0, sources };
}

/**
 * Map mode + detection + control outcomes to a user-facing probe result.
 */
export function evaluateThinkingProbe(options: {
  mode: ThinkingMode | undefined;
  controlsSent: boolean;
  controlsRejected: boolean;
  thinkingDetected: boolean;
  sources: ThinkingSignalSource[];
}): ThinkingProbeResult {
  const mode = normalizeThinkingMode(options.mode);
  const base = {
    mode,
    controlsSent: options.controlsSent,
    controlsRejected: options.controlsRejected,
    thinkingDetected: options.thinkingDetected,
    sources: options.sources,
  };

  if (options.controlsRejected) {
    return {
      ...base,
      verdict: 'controls-rejected',
      summary: 'Thinking controls rejected by provider (using model default)',
    };
  }

  if (mode === 'auto') {
    return {
      ...base,
      verdict: 'not-applicable',
      summary: options.thinkingDetected
        ? 'Thinking: Auto — reasoning visible in response'
        : 'Thinking: Auto — no reasoning in response (provider default)',
    };
  }

  if (mode === 'on') {
    return {
      ...base,
      verdict: 'not-applicable',
      summary: options.thinkingDetected
        ? 'Thinking: On — reasoning visible in response'
        : 'Thinking: On — no reasoning field/tags returned (model may think server-side)',
    };
  }

  // mode === 'off'
  if (options.thinkingDetected) {
    return {
      ...base,
      verdict: 'disable-failed',
      summary: formatDisableFailedSummary(options.sources),
    };
  }

  return {
    ...base,
    verdict: 'disable-success',
    summary: options.controlsSent
      ? 'Thinking: Off — no reasoning in response (disable OK)'
      : 'Thinking: Off — no reasoning in response',
  };
}

function formatDisableFailedSummary(sources: ThinkingSignalSource[]): string {
  const parts: string[] = [];
  if (sources.includes('reasoning_content')) parts.push('reasoning_content');
  if (sources.includes('think_tags')) parts.push('<think> tags');
  const where = parts.length > 0 ? parts.join(' + ') : 'response';
  return `Thinking: Off — still saw reasoning (${where})`;
}
