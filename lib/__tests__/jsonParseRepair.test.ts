import { describe, it, expect } from 'vitest';
import {
  salvageTranslationPairs,
  missingTranslationIds,
  isUsefulSalvage,
} from '@/lib/jsonParseRepair';

describe('salvageTranslationPairs', () => {
  it('extracts pairs from truncated JSON', () => {
    const raw = `{"translations": {"a": "Xin chào", "b": "thế giới", "c": "incomple`;
    const map = salvageTranslationPairs(raw, ['a', 'b', 'c']);
    expect(map.get('a')).toBe('Xin chào');
    expect(map.get('b')).toBe('thế giới');
    expect(map.has('c')).toBe(false);
  });

  it('handles escaped quotes inside values', () => {
    const raw = `{"translations":{"x":"He said \\"hi\\""}}`;
    const map = salvageTranslationPairs(raw, ['x']);
    expect(map.get('x')).toBe('He said "hi"');
  });
});

describe('missingTranslationIds / isUsefulSalvage', () => {
  it('lists missing ids and reports usefulness', () => {
    const map = new Map([['a', '1']]);
    expect(missingTranslationIds(map, ['a', 'b'])).toEqual(['b']);
    expect(isUsefulSalvage(map)).toBe(true);
    expect(isUsefulSalvage(new Map())).toBe(false);
  });
});
