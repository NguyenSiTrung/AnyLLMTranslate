/**
 * Pure helpers for bulk connection tests over the provider pool.
 */

import type { PoolProvider } from '@/types/config';

export interface TestableSlot {
  providerId: string;
  keyId: string;
}

/**
 * Collect enabled (provider, key) pairs that can be connection-tested.
 * Skips disabled providers/keys and empty API keys when required.
 */
export function collectTestableSlots(providers: PoolProvider[]): TestableSlot[] {
  const slots: TestableSlot[] = [];
  for (const p of providers) {
    if (!p.enabled) continue;
    for (const k of p.keys ?? []) {
      if (!k.enabled) continue;
      if (p.requiresApiKey && !k.apiKey.trim()) continue;
      if (!p.baseUrl.trim() || !p.model.trim()) continue;
      slots.push({ providerId: p.id, keyId: k.id });
    }
  }
  return slots;
}

/**
 * Filter slots for a single provider.
 */
export function collectTestableSlotsForProvider(
  providers: PoolProvider[],
  providerId: string,
): TestableSlot[] {
  return collectTestableSlots(providers.filter((p) => p.id === providerId));
}
