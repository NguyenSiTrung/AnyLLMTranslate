/**
 * Pool resolver — PURE module.
 *
 * Flattens the {@link PoolProvider} tree into an ordered list of rotation
 * {@link PoolSlot}s (one per enabled-provider × model × enabled-key), and
 * filters that list against the circuit breaker to produce the live healthy pool.
 *
 * Google AI Studio multi-model expands model-major × key-major when active.
 * Other providers always yield one model per key.
 *
 * No side effects, no `Date.now` coupling (the `now` is passed in), no chrome
 * API — pure transformations that are trivially testable (NFR-1).
 */

import type { GoogleModelStrategy, PoolProvider, ProviderConfig } from '@/types/config';
import type { CircuitBreaker } from './circuitBreaker';
import {
  isMultiModelActive,
  makeSlotId,
  resolveModelStrategy,
  resolveProviderModels,
} from './googleMultiModel';

/**
 * One rotation slot in the flattened pool — a (provider, model, key) triple
 * with the resolved {@link ProviderConfig} (provider fields + key apiKey/maxRpm
 * + this slot's model).
 */
export interface PoolSlot {
  providerId: string;
  keyId: string;
  /** Model id for this slot. */
  model: string;
  /**
   * Breaker / member / throttle identity.
   * Single-model: keyId. Multi-model: `${keyId}::${model}`.
   */
  slotId: string;
  /** True when this provider has ≥2 Google multi-model entries. */
  multiModel: boolean;
  /** Strategy for multi-model (preferred_failover when inactive). */
  modelStrategy: GoogleModelStrategy;
  /** Resolved per-slot config: provider fields merged with the key's apiKey + maxRpm. */
  providerConfig: ProviderConfig;
  /** Per-key concurrency limit (0 = use the global semaphore cap only) (FR-5). */
  concurrencyLimit: number;
  /** Per-key throttle interval in ms (0 = off) (FR-5). */
  interval: number;
}

/**
 * Flatten enabled-provider × model × enabled-key into ordered slots.
 * Order is stable: provider insertion order, then model order (primary first),
 * then key insertion order within each model (FR-3 predictability + order A).
 */
export function resolveSlots(providers: PoolProvider[]): PoolSlot[] {
  const slots: PoolSlot[] = [];
  for (const provider of providers) {
    if (!provider.enabled) continue;
    const multi = isMultiModelActive(provider);
    const models = resolveProviderModels(provider);
    if (models.length === 0) continue;
    const strategy = resolveModelStrategy(provider);
    for (const model of models) {
      for (const key of provider.keys ?? []) {
        if (!key.enabled) continue;
        // Skip empty credentials on key-required providers so they never enter
        // rotation (would 401 → long-open and waste failover budget).
        if (provider.requiresApiKey && !key.apiKey.trim()) continue;
        slots.push(
          buildSlot(
            provider,
            key.id,
            key.apiKey,
            key.maxRpm,
            key.concurrencyLimit,
            key.interval,
            model,
            multi,
            strategy,
          ),
        );
      }
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
  return slots.filter((slot) => breaker.isHealthy(slot.slotId, now));
}

/** Build a resolved ProviderConfig from a pool provider + a specific key + model. */
function buildSlot(
  provider: PoolProvider,
  keyId: string,
  apiKey: string,
  maxRpm: number,
  concurrencyLimit: number,
  interval: number,
  model: string,
  multiModel: boolean,
  modelStrategy: GoogleModelStrategy,
): PoolSlot {
  // The provider config the member OpenAICompatibleService is constructed from.
  // `preset` is always 'custom' in the pool world (OpenAI-compatible only).
  const providerConfig: ProviderConfig = {
    preset: 'custom',
    baseUrl: provider.baseUrl,
    apiKey,
    model,
    temperature: provider.temperature,
    maxTokens: provider.maxTokens,
    displayName: provider.displayName,
    requiresApiKey: provider.requiresApiKey,
    requestTimeoutMs: provider.requestTimeoutMs,
    maxRpm,
    maxBatchChars: provider.maxBatchChars,
    maxTextGroupCount: provider.maxTextGroupCount,
    thinkingMode: provider.thinkingMode,
    thinkingEffort: provider.thinkingEffort,
  };
  return {
    providerId: provider.id,
    keyId,
    model,
    slotId: makeSlotId(keyId, model, multiModel),
    multiModel,
    modelStrategy,
    providerConfig,
    concurrencyLimit: Math.max(0, concurrencyLimit | 0),
    interval: Math.max(0, interval | 0),
  };
}
