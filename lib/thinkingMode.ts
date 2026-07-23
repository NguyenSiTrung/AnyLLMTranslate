/**
 * Helpers for provider thinkingMode → OpenAI-compatible request fields.
 *
 * Two strategies:
 * 1. **NIM / Nemotron / Qwen3 (vLLM)** — `chat_template_kwargs.enable_thinking`
 * 2. **Google AI Studio (Gemini)** — top-level `reasoning_effort`
 *    (`none` | `minimal` | `low` | `medium` | `high`)
 *
 * When the user leaves mode at `auto`, we omit thinking fields so the model
 * keeps its server default. When mode is `on` for Gemini, the level comes
 * from `thinkingEffort` (default medium).
 */

import type { ThinkingEffort, ThinkingMode } from '@/types/config';
import { DEFAULT_THINKING_EFFORT, DEFAULT_THINKING_MODE } from '@/types/config';
import type { ChatCompletionRequest, ReasoningEffort } from '@/types/translation';

/** Normalize stored/partial values to a valid ThinkingMode. */
export function normalizeThinkingMode(value: unknown): ThinkingMode {
  if (value === 'on' || value === 'off' || value === 'auto') return value;
  return DEFAULT_THINKING_MODE;
}

/** Normalize stored/partial values to a valid ThinkingEffort. */
export function normalizeThinkingEffort(value: unknown): ThinkingEffort {
  if (value === 'minimal' || value === 'low' || value === 'medium' || value === 'high') {
    return value;
  }
  return DEFAULT_THINKING_EFFORT;
}

/**
 * True when baseUrl points at Google's Gemini OpenAI-compat endpoint
 * (`generativelanguage.googleapis.com/.../openai`).
 */
export function isGeminiOpenAiCompatBaseUrl(baseUrl: string): boolean {
  const raw = baseUrl.trim();
  if (!raw) return false;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return (
      host === 'generativelanguage.googleapis.com' ||
      host.endsWith('.generativelanguage.googleapis.com')
    );
  } catch {
    return raw.toLowerCase().includes('generativelanguage.googleapis.com');
  }
}

/**
 * Whether this Gemini model can fully disable thinking via
 * `reasoning_effort: "none"`.
 *
 * Per Google docs:
 * - Gemini 2.5 Flash / Flash-Lite: yes (`none`)
 * - Gemini 2.5 Pro: no
 * - Gemini 3.x: no (lowest is `minimal`)
 */
export function geminiSupportsThinkingNone(model: string): boolean {
  const m = model.trim().toLowerCase();
  if (!m) return false;
  // Gemini 3.x family — thinking cannot be fully disabled
  if (/(?:^|[/._-])gemini-3(?:[._-]|$)/.test(m) || /gemini[-_.]?3(?:[._-]|$)/.test(m)) {
    return false;
  }
  // 2.5 Pro (and bare "pro" gemini ids that are clearly Pro)
  if (/2\.5[-_.]?pro/.test(m) || /gemini-2\.5-pro/.test(m)) {
    return false;
  }
  if (/gemini/.test(m) && /pro(?![-_.]?vision)/.test(m) && !/flash/.test(m)) {
    // e.g. gemini-pro, models that are pro-class without flash in the name
    // Keep Flash-family free: only treat as non-disableable when "pro" present.
    if (/2\.5/.test(m) || /gemini-pro/.test(m)) return false;
  }
  // Default for Gemini Flash / Lite / unknown gemini ids on AI Studio:
  // try full off (`none`). If the API rejects it, the service can strip
  // thinking fields after a 400.
  return true;
}

/**
 * Map thinkingMode → Gemini `reasoning_effort`.
 *
 * - `off` → `none` when supported; else `minimal` (Gemini 3.x / 2.5 Pro)
 * - `on`  → user-selected {@link ThinkingEffort} (default medium)
 * - `auto` → omit (caller handles)
 */
export function geminiReasoningEffortForMode(
  mode: Exclude<ThinkingMode, 'auto'>,
  model: string,
  effortWhenOn: ThinkingEffort = DEFAULT_THINKING_EFFORT,
): ReasoningEffort {
  if (mode === 'on') return normalizeThinkingEffort(effortWhenOn);
  return geminiSupportsThinkingNone(model) ? 'none' : 'minimal';
}

export interface ApplyThinkingModeOptions {
  /** Provider base URL — used to pick Gemini vs NIM/vLLM strategy. */
  baseUrl?: string;
  /**
   * Gemini effort when mode is `on`. Ignored for non-Gemini and for off/auto.
   * Defaults to {@link DEFAULT_THINKING_EFFORT}.
   */
  thinkingEffort?: ThinkingEffort;
}

/**
 * Attach thinking control fields when mode is on|off.
 * Returns the same object reference when mode is auto (no-op).
 *
 * Gemini AI Studio uses `reasoning_effort`; other OpenAI-compatible hosts use
 * `chat_template_kwargs.enable_thinking`.
 */
export function applyThinkingModeToRequest(
  request: ChatCompletionRequest,
  mode: ThinkingMode | undefined,
  options?: ApplyThinkingModeOptions,
): ChatCompletionRequest {
  const resolved = normalizeThinkingMode(mode);
  if (resolved === 'auto') return request;

  const baseUrl = options?.baseUrl ?? '';
  if (isGeminiOpenAiCompatBaseUrl(baseUrl)) {
    const effort = geminiReasoningEffortForMode(
      resolved,
      request.model,
      options?.thinkingEffort,
    );
    return {
      ...request,
      reasoning_effort: effort,
    };
  }

  return {
    ...request,
    chat_template_kwargs: {
      ...request.chat_template_kwargs,
      enable_thinking: resolved === 'on',
    },
  };
}

/** True when an error body suggests the endpoint rejected thinking kwargs. */
export function isThinkingKwargsRejected(errorMessage: string): boolean {
  const lower = errorMessage.toLowerCase();
  return (
    lower.includes('chat_template_kwargs') ||
    lower.includes('enable_thinking') ||
    lower.includes('enable thinking') ||
    lower.includes('reasoning_effort') ||
    lower.includes('reasoning effort')
  );
}
