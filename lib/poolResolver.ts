/**
 * Pool resolver — PURE module.
 *
 * Flattens the {@link PoolProvider} tree into an ordered list of rotation
 * {@link PoolSlot}s (one per enabled-provider × enabled-key pair), and filters
 * that list against the circuit breaker to produce the live healthy pool.
 *
 * No side effects, no `Date.now` coupling (the `now` is passed in), no chrome
 * API — pure transformations that are trivially testable (NFR-1).
 */

import type { PoolProvider, ProviderConfig } from '@/types/config';
import type { CircuitBreaker } from './circuitBreaker';

/**
 * One rotation slot in the flattened pool — a (provider, key) pair with the
 * resolved {@link ProviderConfig} (provider fields + the key's apiKey/maxRpm).
 */
export interface PoolSlot {
  providerId: string;
  keyId: string;
  /** Resolved per-slot config: provider fields merged with the key's apiKey + maxRpm. */
  providerConfig: ProviderConfig;
  /** Per-key concurrency limit (0 = use the global semaphore cap only) (FR-5). */
  concurrencyLimit: number;
  /** Per-key throttle interval in ms (0 = off) (FR-5). */
  interval: number;
}

/**
 * Flatten enabled-provider × enabled-key pairs into ordered slots.
 * Order is stable: provider insertion order, then key insertion order within
 * each provider (FR-3 predictability).
 */
export function resolveSlots(providers: PoolProvider[]): PoolSlot[] {
  const slots: PoolSlot[] = [];
  for (const provider of providers) {
    if (!provider.enabled) continue;
    for (const key of provider.keys ?? []) {
      if (!key.enabled) continue;
      // Skip empty credentials on key-required providers so they never enter
      // rotation (would 401 → long-open and waste failover budget).
      if (provider.requiresApiKey && !key.apiKey.trim()) continue;
      slots.push(
        buildSlot(provider, key.id, key.apiKey, key.maxRpm, key.concurrencyLimit, key.interval),
      );
    }
  }
  return slots;
}

/**
 * Return only the slots whose circuit breaker is currently closed (healthy).
 * Open slots are excluded so the round-robin cursor skips them (FR-4).
 */
export function healthySlots(
  slots: PoolSlot[],
  breaker: CircuitBreaker,
  now: number,
): PoolSlot[] {
  return slots.filter((slot) => breaker.isHealthy(slot.keyId, now));
}

/** Build a resolved ProviderConfig from a pool provider + a specific key. */
function buildSlot(
  provider: PoolProvider,
  keyId: string,
  apiKey: string,
  maxRpm: number,
  concurrencyLimit: number,
  interval: number,
): PoolSlot {
  // The provider config the member OpenAICompatibleService is constructed from.
  // `preset` is always 'custom' in the pool world (OpenAI-compatible only).
  const providerConfig: ProviderConfig = {
    preset: 'custom',
    baseUrl: provider.baseUrl,
    apiKey,
    model: provider.model,
    temperature: provider.temperature,
    maxTokens: provider.maxTokens,
    displayName: provider.displayName,
    requiresApiKey: provider.requiresApiKey,
    requestTimeoutMs: provider.requestTimeoutMs,
    maxRpm,
    maxBatchChars: provider.maxBatchChars,
    maxTextGroupCount: provider.maxTextGroupCount,
    thinkingMode: provider.thinkingMode,
  };
  return {
    providerId: provider.id,
    keyId,
    providerConfig,
    concurrencyLimit: Math.max(0, concurrencyLimit | 0),
    interval: Math.max(0, interval | 0),
  };
}
