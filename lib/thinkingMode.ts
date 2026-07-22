/**
 * Helpers for provider thinkingMode → OpenAI-compatible request fields.
 *
 * Many NIM / Nemotron / Qwen3 endpoints honor
 * `chat_template_kwargs.enable_thinking`. When the user leaves mode at
 * `auto`, we omit the field so the model keeps its server default.
 */

import type { ThinkingMode } from '@/types/config';
import { DEFAULT_THINKING_MODE } from '@/types/config';
import type { ChatCompletionRequest } from '@/types/translation';

/** Normalize stored/partial values to a valid ThinkingMode. */
export function normalizeThinkingMode(value: unknown): ThinkingMode {
  if (value === 'on' || value === 'off' || value === 'auto') return value;
  return DEFAULT_THINKING_MODE;
}

/**
 * Attach thinking control fields when mode is on|off.
 * Returns the same object reference when mode is auto (no-op).
 */
export function applyThinkingModeToRequest(
  request: ChatCompletionRequest,
  mode: ThinkingMode | undefined,
): ChatCompletionRequest {
  const resolved = normalizeThinkingMode(mode);
  if (resolved === 'auto') return request;
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
    lower.includes('enable thinking')
  );
}
