/**
 * Pure immutable reorder helpers for provider pool arrays.
 * Order = rotation preference (see resolveSlots).
 */

import type { PoolProvider } from '@/types/config';

/** Move item from fromIndex to toIndex. Returns a new array; never mutates input. */
export function reorderByIndex<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return items.slice();
  }
  const next = items.slice();
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export function moveProvider(
  providers: PoolProvider[],
  fromIndex: number,
  toIndex: number,
): PoolProvider[] {
  return reorderByIndex(providers, fromIndex, toIndex);
}

export function moveKey(
  provider: PoolProvider,
  fromIndex: number,
  toIndex: number,
): PoolProvider {
  return {
    ...provider,
    keys: reorderByIndex(provider.keys ?? [], fromIndex, toIndex),
  };
}

export function moveProviderById(
  providers: PoolProvider[],
  providerId: string,
  direction: 'up' | 'down',
): PoolProvider[] {
  const fromIndex = providers.findIndex((p) => p.id === providerId);
  if (fromIndex < 0) return providers.slice();
  const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
  if (toIndex < 0 || toIndex >= providers.length) return providers.slice();
  return reorderByIndex(providers, fromIndex, toIndex);
}

export function moveKeyById(
  provider: PoolProvider,
  keyId: string,
  direction: 'up' | 'down',
): PoolProvider {
  const keys = provider.keys ?? [];
  const fromIndex = keys.findIndex((k) => k.id === keyId);
  if (fromIndex < 0) return { ...provider, keys: keys.slice() };
  const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
  if (toIndex < 0 || toIndex >= keys.length) return { ...provider, keys: keys.slice() };
  return moveKey(provider, fromIndex, toIndex);
}
