import { describe, it, expect } from 'vitest';
import {
  reorderByIndex,
  moveProviderById,
  moveKeyById,
} from '../poolReorder';
import type { PoolKey, PoolProvider } from '@/types/config';

describe('reorderByIndex', () => {
  it('moves item forward', () => {
    expect(reorderByIndex(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
  });

  it('moves item backward', () => {
    expect(reorderByIndex(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('no-ops on out of range', () => {
    expect(reorderByIndex(['a'], 0, 5)).toEqual(['a']);
    expect(reorderByIndex(['a'], -1, 0)).toEqual(['a']);
  });

  it('does not mutate input', () => {
    const input = ['a', 'b', 'c'];
    reorderByIndex(input, 0, 1);
    expect(input).toEqual(['a', 'b', 'c']);
  });
});

describe('moveProviderById', () => {
  const providers = [
    { id: 'p1' },
    { id: 'p2' },
    { id: 'p3' },
  ] as PoolProvider[];

  it('moves up', () => {
    expect(moveProviderById(providers, 'p2', 'up').map((p) => p.id)).toEqual([
      'p2',
      'p1',
      'p3',
    ]);
  });

  it('moves down', () => {
    expect(moveProviderById(providers, 'p1', 'down').map((p) => p.id)).toEqual([
      'p2',
      'p1',
      'p3',
    ]);
  });

  it('no-ops at top', () => {
    expect(moveProviderById(providers, 'p1', 'up').map((p) => p.id)).toEqual([
      'p1',
      'p2',
      'p3',
    ]);
  });

  it('no-ops at bottom', () => {
    expect(moveProviderById(providers, 'p3', 'down').map((p) => p.id)).toEqual([
      'p1',
      'p2',
      'p3',
    ]);
  });
});

describe('moveKeyById', () => {
  const provider = {
    id: 'p1',
    keys: [{ id: 'k1' }, { id: 'k2' }] as PoolKey[],
  } as PoolProvider;

  it('moves key down', () => {
    expect(moveKeyById(provider, 'k1', 'down').keys.map((k) => k.id)).toEqual([
      'k2',
      'k1',
    ]);
  });

  it('moves key up', () => {
    expect(moveKeyById(provider, 'k2', 'up').keys.map((k) => k.id)).toEqual([
      'k2',
      'k1',
    ]);
  });

  it('does not mutate original keys array', () => {
    const original = provider.keys.map((k) => k.id);
    moveKeyById(provider, 'k1', 'down');
    expect(provider.keys.map((k) => k.id)).toEqual(original);
  });
});
