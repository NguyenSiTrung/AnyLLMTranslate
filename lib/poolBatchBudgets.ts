/**
 * Resolve effective web-translate batch budgets from global settings + any
 * enabled pool provider overrides (maxBatchChars / maxTextGroupCount).
 *
 * When multiple providers set overrides, the tightest positive value wins so
 * a batch never exceeds any provider's limit in a multi-provider pool.
 * 0 / undefined override = use the global default for that dimension.
 */

import type { ExtensionSettings } from '@/types/config';
import type { BatchOptions } from '@/lib/textBatching';

/**
 * Merge global batch settings with the minimum positive per-provider override
 * across enabled providers that have at least one enabled key.
 */
export function resolvePoolBatchBudgets(settings: ExtensionSettings): BatchOptions {
  let maxGroup = settings.maxTextGroupLengthPerRequest;
  let maxChars = settings.maxTextLengthPerRequest;

  for (const provider of settings.providers ?? []) {
    if (!provider.enabled) continue;
    const hasEnabledKey = (provider.keys ?? []).some((k) => k.enabled);
    if (!hasEnabledKey) continue;

    const groupOverride = provider.maxTextGroupCount;
    if (typeof groupOverride === 'number' && groupOverride > 0) {
      maxGroup = Math.min(maxGroup, groupOverride);
    }

    const charsOverride = provider.maxBatchChars;
    if (typeof charsOverride === 'number' && charsOverride > 0) {
      maxChars = Math.min(maxChars, charsOverride);
    }
  }

  return {
    maxTextGroupLengthPerRequest: maxGroup,
    maxTextLengthPerRequest: maxChars,
  };
}
