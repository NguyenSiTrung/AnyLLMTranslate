import { describe, it, expect } from 'vitest';
import {
  reorderByIndex,
  moveProviderById,
  moveKeyById,
} from '../poolReorder';
import type { PoolKey, PoolProvider } from '@/types/config';

describe('poolReorder', () => {
  it('reorders indices, providers, and keys without mutating inputs', () => {
    expect(reorderByIndex(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(reorderByIndex(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(reorderByIndex(['a'], 0, 5)).toEqual(['a']);
    expect(reorderByIndex(['a'], -1, 0)).toEqual(['a']);
    const input = ['a', 'b', 'c'];
    reorderByIndex(input, 0, 1);
    expect(input).toEqual(['a', 'b', 'c']);

    const providers = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }] as PoolProvider[];
    expect(moveProviderById(providers, 'p2', 'up').map((p) => p.id)).toEqual(['p2', 'p1', 'p3']);
    expect(moveProviderById(providers, 'p1', 'down').map((p) => p.id)).toEqual(['p2', 'p1', 'p3']);
    expect(moveProviderById(providers, 'p1', 'up').map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect(moveProviderById(providers, 'p3', 'down').map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);

    const provider = {
      id: 'p1',
      keys: [{ id: 'k1' }, { id: 'k2' }] as PoolKey[],
    } as PoolProvider;
    expect(moveKeyById(provider, 'k1', 'down').keys.map((k) => k.id)).toEqual(['k2', 'k1']);
    expect(moveKeyById(provider, 'k2', 'up').keys.map((k) => k.id)).toEqual(['k2', 'k1']);
    const original = provider.keys.map((k) => k.id);
    moveKeyById(provider, 'k1', 'down');
    expect(provider.keys.map((k) => k.id)).toEqual(original);
  });
});
