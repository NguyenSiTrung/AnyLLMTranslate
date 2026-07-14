import { describe, it, expect } from 'vitest';
import {
  ZERO_COUNTERS,
  mergeCounters,
  normalizeHost,
  languagePairKey,
  mergeDimensionMap,
} from '../statsCounters';

describe('statsCounters', () => {
  it('merges counters, normalizes hosts, pair keys, and rolls excess dims into __other__', () => {
    const a = { ...ZERO_COUNTERS, characters: 10, apiCalls: 1 };
    const b = { ...ZERO_COUNTERS, characters: 5, cacheHits: 2 };
    expect(mergeCounters(a, b).characters).toBe(15);
    expect(mergeCounters(a, b).apiCalls).toBe(1);
    expect(mergeCounters(a, b).cacheHits).toBe(2);

    expect(normalizeHost('WWW.YouTube.com')).toBe('youtube.com');
    expect(normalizeHost(undefined)).toBeUndefined();
    expect(normalizeHost('')).toBeUndefined();
    expect(languagePairKey('auto', 'vi')).toBe('auto>vi');

    let next: Record<string, Partial<typeof ZERO_COUNTERS>> = {};
    for (let i = 0; i < 27; i++) {
      next = mergeDimensionMap(next, `host${i}.com`, { characters: i + 1 }, 25);
    }
    expect(Object.keys(next).length).toBeLessThanOrEqual(26);
    expect(next.__other__).toBeDefined();
  });
});
