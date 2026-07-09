import { describe, it, expect } from 'vitest';
import {
  ZERO_COUNTERS,
  mergeCounters,
  addPartialCounters,
  normalizeHost,
  languagePairKey,
  mergeDimensionMap,
} from '../statsCounters';

describe('statsCounters', () => {
  it('mergeCounters sums all fields', () => {
    const a = { ...ZERO_COUNTERS, characters: 10, apiCalls: 1 };
    const b = { ...ZERO_COUNTERS, characters: 5, cacheHits: 2 };
    expect(mergeCounters(a, b).characters).toBe(15);
    expect(mergeCounters(a, b).apiCalls).toBe(1);
    expect(mergeCounters(a, b).cacheHits).toBe(2);
  });

  it('normalizeHost lowercases and strips www', () => {
    expect(normalizeHost('WWW.YouTube.com')).toBe('youtube.com');
    expect(normalizeHost(undefined)).toBeUndefined();
    expect(normalizeHost('')).toBeUndefined();
  });

  it('languagePairKey joins source and target', () => {
    expect(languagePairKey('auto', 'vi')).toBe('auto>vi');
  });

  it('mergeDimensionMap rolls excess keys into __other__ by characters', () => {
    const map: Record<string, Partial<typeof ZERO_COUNTERS>> = {};
    let next = map;
    for (let i = 0; i < 27; i++) {
      next = mergeDimensionMap(next, `host${i}.com`, { characters: i + 1 }, 25);
    }
    expect(Object.keys(next).length).toBeLessThanOrEqual(26); // 25 + __other__
    expect(next.__other__).toBeDefined();
  });
});
