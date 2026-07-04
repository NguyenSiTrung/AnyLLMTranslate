/**
 * Pure helpers for the multi-provider pool UI (Providers tab).
 *
 * Dependency-free and side-effect-free so they can be unit-tested without
 * chrome API mocking. Mirrors the pattern of `lib/poolTestStatus.ts` and
 * `lib/poolResolver.ts`. Extracted from `ProvidersSection.tsx` in the
 * providers-ux-refactor track (FR-1) so `ProviderCard`, `ProviderKeyRow`,
 * `ProviderConnectionTest`, and the bulk-test path share one source.
 */

import type { PoolProvider, PoolKey, ProviderConfig, KeyTestResult } from '@/types/config';

/**
 * Pick the first key on a provider that carries usable credentials. For
 * keyless providers (`requiresApiKey === false`) the first key (if any) is
 * returned so the caller can still build a config.
 */
export function getCredentialKey(provider: PoolProvider): PoolKey | undefined {
  return provider.keys.find((k) => !provider.requiresApiKey || k.apiKey.trim());
}

/** Build a `ProviderConfig` (the shape the tester/service expects) from a pool provider + key. */
export function buildProviderConfig(provider: PoolProvider, key: PoolKey): ProviderConfig {
  return {
    preset: 'custom',
    baseUrl: provider.baseUrl,
    apiKey: key.apiKey,
    model: provider.model,
    temperature: provider.temperature,
    maxTokens: provider.maxTokens,
    displayName: provider.displayName,
    requiresApiKey: provider.requiresApiKey,
    requestTimeoutMs: provider.requestTimeoutMs,
    maxRpm: key.maxRpm,
  };
}

/**
 * Whether a connection test can run. When a specific `key` is given, the
 * gate is that key's credentials; when omitted, the gate is "any key has
 * credentials". Always requires a non-empty base URL and model.
 */
export function canRunConnectionTest(provider: PoolProvider, key?: PoolKey): boolean {
  if (!provider.baseUrl.trim() || !provider.model.trim()) return false;
  if (key) {
    return !provider.requiresApiKey || Boolean(key.apiKey.trim());
  }
  return provider.keys.some((k) => !provider.requiresApiKey || Boolean(k.apiKey.trim()));
}

/** Aggregate test status for a provider from its keys' (and own) lastTestResult. */
export function getProviderTestStatus(provider: PoolProvider): {
  state: 'healthy' | 'failed' | 'untested';
  result?: KeyTestResult;
} {
  const testedKeys = provider.keys.filter((k) => k.lastTestResult);
  if (testedKeys.length === 0 && !provider.lastTestResult) {
    return { state: 'untested' };
  }
  const anySuccess = testedKeys.some((k) => k.lastTestResult?.success);
  const allFailed =
    testedKeys.length > 0 && testedKeys.every((k) => k.lastTestResult?.success === false);
  if (anySuccess) {
    return {
      state: 'healthy',
      result: testedKeys.find((k) => k.lastTestResult?.success)?.lastTestResult,
    };
  }
  if (allFailed) {
    return { state: 'failed', result: testedKeys[0]?.lastTestResult };
  }
  return { state: 'untested' };
}
