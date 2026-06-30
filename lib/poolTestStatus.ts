/**
 * Pure helpers for persisted pool connection-test status (FR-1).
 *
 * These helpers are dependency-free and side-effect-free so they can be
 * unit-tested without chrome API mocking. They mirror the pattern of
 * `lib/poolResolver.ts` and `lib/rateLimiter.ts`.
 */

import type { PoolProvider, PoolKey, KeyTestResult } from '@/types/config';

/**
 * Returns `true` when a credential-relevant field changed between an old and
 * new provider, meaning any persisted {@link PoolProvider.lastTestResult}
 * is stale and should be cleared. The fields that invalidate a test result
 * are `baseUrl`, `model`, and `requiresApiKey` (a provider that suddenly
 * requires a key changes the test surface).
 */
export function providerCredentialsChanged(
  oldP: Pick<PoolProvider, 'baseUrl' | 'model' | 'requiresApiKey'>,
  newP: Pick<PoolProvider, 'baseUrl' | 'model' | 'requiresApiKey'>,
): boolean {
  return (
    oldP.baseUrl !== newP.baseUrl ||
    oldP.model !== newP.model ||
    oldP.requiresApiKey !== newP.requiresApiKey
  );
}

/**
 * Returns `true` when a key's `apiKey` changed between old and new, meaning
 * any persisted {@link PoolKey.lastTestResult} is stale and should be cleared.
 */
export function keyCredentialsChanged(
  oldK: Pick<PoolKey, 'apiKey'>,
  newK: Pick<PoolKey, 'apiKey'>,
): boolean {
  return oldK.apiKey !== newK.apiKey;
}

/**
 * Immutably patch a provider, clearing `lastTestResult` when credential
 * fields (`baseUrl`, `model`, `requiresApiKey`) change. Returns the patched
 * provider. If credentials are unchanged, `lastTestResult` is preserved.
 *
 * Usage: `updateProviderFields(id, patch)` → call this to decide whether to
 * also clear the test result.
 */
export function applyProviderPatch(
  provider: PoolProvider,
  patch: Partial<PoolProvider>,
): PoolProvider {
  const merged = { ...provider, ...patch };
  if (patch.baseUrl !== undefined || patch.model !== undefined || patch.requiresApiKey !== undefined) {
    if (providerCredentialsChanged(provider, merged)) {
      delete merged.lastTestResult;
    }
  }
  return merged;
}

/**
 * Immutably patch a key, clearing `lastTestResult` when `apiKey` changes.
 * Returns the patched key. If `apiKey` is unchanged, `lastTestResult` is
 * preserved.
 */
export function applyKeyPatch(
  key: PoolKey,
  patch: Partial<PoolKey>,
): PoolKey {
  const merged = { ...key, ...patch };
  if (patch.apiKey !== undefined && keyCredentialsChanged(key, merged)) {
    delete merged.lastTestResult;
  }
  return merged;
}

/**
 * Format a {@link KeyTestResult} into a short human-readable status string
 * for display in collapsed provider headers and tooltips.
 */
export function formatTestResultAge(result: KeyTestResult, now: number = Date.now()): string {
  const delta = now - result.at;
  if (delta < 60_000) return 'just now';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return `${Math.floor(delta / 86_400_000)}d ago`;
}
