/**
 * Pure helpers for Google AI Studio multi-model free-tier pool stacking.
 * Other providers always resolve to a single model.
 */

import type { GoogleModelStrategy, PoolProvider } from '@/types/config';
import { isGeminiOpenAiCompatBaseUrl } from '@/lib/thinkingMode';

export function isGoogleAiStudioProvider(
  provider: Pick<PoolProvider, 'catalogId' | 'baseUrl'>,
): boolean {
  if (provider.catalogId === 'google-ai-studio') return true;
  return isGeminiOpenAiCompatBaseUrl(provider.baseUrl ?? '');
}

function dedupeModels(ids: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const m = raw.trim();
    if (!m || seen.has(m)) continue;
    seen.add(m);
    out.push(m);
  }
  return out;
}

/**
 * Resolve ordered model ids for slot expansion.
 *
 * Always returns at least one entry (may be `""`) so unconfigured defaults
 * still form a single pool slot — pre multi-model behavior. Skipping empty
 * models emptied the pool for DEFAULT_SETTINGS (`model: ''`) and broke
 * background translate tests with "pool is empty".
 *
 * Multi-model (≥2) only applies to Google AI Studio when `models[]` is set.
 */
export function resolveProviderModels(
  provider: Pick<PoolProvider, 'catalogId' | 'baseUrl' | 'model' | 'models'>,
): string[] {
  if (!isGoogleAiStudioProvider(provider)) {
    return [(provider.model ?? '').trim()];
  }
  const fromList = Array.isArray(provider.models) ? provider.models : [];
  if (fromList.length > 0) {
    const deduped = dedupeModels(fromList);
    if (deduped.length > 0) return deduped;
  }
  return [(provider.model ?? '').trim()];
}

export function isMultiModelActive(
  provider: Pick<PoolProvider, 'catalogId' | 'baseUrl' | 'model' | 'models'>,
): boolean {
  return isGoogleAiStudioProvider(provider) && resolveProviderModels(provider).length >= 2;
}

export function resolveModelStrategy(
  provider: Pick<
    PoolProvider,
    'modelStrategy' | 'catalogId' | 'baseUrl' | 'model' | 'models'
  >,
): GoogleModelStrategy {
  if (!isMultiModelActive(provider)) return 'preferred_failover';
  return provider.modelStrategy === 'round_robin' ? 'round_robin' : 'preferred_failover';
}

/**
 * Dedupe models, sync model ↔ models[0], strip multi-model fields for non-Google
 * or single-model providers.
 */
export function normalizeGoogleModels(provider: PoolProvider): PoolProvider {
  if (!isGoogleAiStudioProvider(provider)) {
    if (provider.models === undefined && provider.modelStrategy === undefined) {
      return provider;
    }
    const { models: _m, modelStrategy: _s, ...rest } = provider;
    return rest as PoolProvider;
  }
  const models = resolveProviderModels(provider);
  // resolveProviderModels always returns ≥1 entry; single (incl. empty) → no multi-model fields.
  const primary = models[0] ?? '';
  if (models.length <= 1) {
    return {
      ...provider,
      model: primary,
      models: undefined,
      modelStrategy: undefined,
    };
  }
  return {
    ...provider,
    model: primary,
    models,
    modelStrategy:
      provider.modelStrategy === 'round_robin' ? 'round_robin' : 'preferred_failover',
  };
}

/** Breaker / member identity: composite only when multi-model is active. */
export function makeSlotId(keyId: string, model: string, multiModel: boolean): string {
  return multiModel ? `${keyId}::${model}` : keyId;
}
