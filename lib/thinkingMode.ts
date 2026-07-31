/**
 * Helpers for provider thinkingMode → OpenAI-compatible request fields.
 *
 * Strategies:
 * 1. **NIM / Nemotron / Qwen3 (vLLM)** — `chat_template_kwargs.enable_thinking`
 * 2. **StepFun / some OpenAI-compat hosts** — top-level `enable_thinking`
 *    (nested chat_template_kwargs alone is ignored by StepFun step_plan)
 * 3. **Google AI Studio (Gemini)** — top-level `reasoning_effort`
 *    (`none` | `minimal` | `low` | `medium` | `high`)
 * 4. **DeepSeek Official** — `thinking: { type: "enabled" | "disabled" }` and,
 *    when on, `reasoning_effort` (`low` | `high` | `max`)
 *    https://api-docs.deepseek.com/guides/thinking_mode
 *
 * Non-Gemini/DeepSeek on|off sends both (1) and (2). Providers that reject
 * unknown fields get a one-shot strip + retry in the fetch layer.
 *
 * When the user leaves mode at `auto`, we omit thinking fields so the model
 * keeps its server default. When mode is `on` for Gemini/DeepSeek, the level
 * comes from `thinkingEffort` (default medium → DeepSeek high).
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
  if (
    value === 'minimal' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'max'
  ) {
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
 * True when baseUrl points at DeepSeek Official
 * (`api.deepseek.com`, with or without `/v1`).
 * Does not match third-party hosts that merely proxy DeepSeek models.
 */
export function isDeepSeekOfficialBaseUrl(baseUrl: string): boolean {
  const raw = baseUrl.trim();
  if (!raw) return false;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return host === 'api.deepseek.com' || host.endsWith('.api.deepseek.com');
  } catch {
    return raw.toLowerCase().includes('api.deepseek.com');
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
 * - `on`  → user-selected {@link ThinkingEffort} (default medium; `max`→`high`)
 * - `auto` → omit (caller handles)
 */
export function geminiReasoningEffortForMode(
  mode: Exclude<ThinkingMode, 'auto'>,
  model: string,
  effortWhenOn: ThinkingEffort = DEFAULT_THINKING_EFFORT,
): ReasoningEffort {
  if (mode === 'on') {
    const effort = normalizeThinkingEffort(effortWhenOn);
    // Gemini has no `max`; clamp to the highest Gemini-supported level.
    return effort === 'max' ? 'high' : effort;
  }
  return geminiSupportsThinkingNone(model) ? 'none' : 'minimal';
}

/**
 * Map stored {@link ThinkingEffort} → DeepSeek Official `reasoning_effort`.
 * DeepSeek accepts `low` | `high` | `max` (plus aliases it maps server-side).
 * Shared UI values `minimal`/`medium` collapse to the nearest DeepSeek rung.
 */
export function deepseekReasoningEffort(effortWhenOn: ThinkingEffort = DEFAULT_THINKING_EFFORT):
  | 'low'
  | 'high'
  | 'max' {
  const effort = normalizeThinkingEffort(effortWhenOn);
  if (effort === 'minimal' || effort === 'low') return 'low';
  if (effort === 'max') return 'max';
  // medium + high → high (DeepSeek default when thinking is on)
  return 'high';
}

export interface ApplyThinkingModeOptions {
  /** Provider base URL — used to pick Gemini / DeepSeek / NIM strategy. */
  baseUrl?: string;
  /**
   * Effort when mode is `on` for Gemini or DeepSeek Official.
   * Ignored for NIM/StepFun-style hosts and for off/auto.
   * Defaults to {@link DEFAULT_THINKING_EFFORT}.
   */
  thinkingEffort?: ThinkingEffort;
}

/**
 * Attach thinking control fields when mode is on|off.
 * Returns the same object reference when mode is auto (no-op).
 *
 * - Gemini AI Studio → `reasoning_effort`
 * - DeepSeek Official → `thinking: { type }` + `reasoning_effort` when on
 * - Other OpenAI-compatible hosts → top-level `enable_thinking` (StepFun) and
 *   nested `chat_template_kwargs.enable_thinking` (NIM/vLLM/Qwen3)
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

  if (isDeepSeekOfficialBaseUrl(baseUrl)) {
    if (resolved === 'off') {
      return {
        ...request,
        thinking: { type: 'disabled' },
      };
    }
    return {
      ...request,
      thinking: { type: 'enabled' },
      reasoning_effort: deepseekReasoningEffort(options?.thinkingEffort),
    };
  }

  const enableThinking = resolved === 'on';
  return {
    ...request,
    // StepFun step_plan (and similar) only honor the top-level flag.
    enable_thinking: enableThinking,
    // NIM / vLLM / Qwen3 chat templates read the nested kwargs form.
    chat_template_kwargs: {
      ...request.chat_template_kwargs,
      enable_thinking: enableThinking,
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
    lower.includes('reasoning effort') ||
    // DeepSeek Official thinking toggle body — keep narrow to avoid matching
    // generic prose that merely mentions "thinking".
    lower.includes('thinking.type') ||
    lower.includes('unknown field: thinking') ||
    lower.includes('unknown field thinking') ||
    lower.includes('extra field: thinking') ||
    lower.includes('extra field thinking') ||
    lower.includes('unexpected field thinking') ||
    lower.includes('"thinking"')
  );
}
