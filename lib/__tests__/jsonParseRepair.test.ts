import { describe, it, expect } from 'vitest';
import {
  salvageTranslationPairs,
  missingTranslationIds,
  isUsefulSalvage,
} from '@/lib/jsonParseRepair';

describe('jsonParseRepair', () => {
  it('salvages pairs from truncated/escaped JSON and reports missing/usefulness', () => {
    const raw = `{"translations": {"a": "Xin chào", "b": "thế giới", "c": "incomple`;
    const map = salvageTranslationPairs(raw, ['a', 'b', 'c']);
    expect(map.get('a')).toBe('Xin chào');
    expect(map.get('b')).toBe('thế giới');
    expect(map.has('c')).toBe(false);

    const escaped = salvageTranslationPairs(`{"translations":{"x":"He said \\"hi\\""}}`, ['x']);
    expect(escaped.get('x')).toBe('He said "hi"');

    const partial = new Map([['a', '1']]);
    expect(missingTranslationIds(partial, ['a', 'b'])).toEqual(['b']);
    expect(isUsefulSalvage(partial)).toBe(true);
    expect(isUsefulSalvage(new Map())).toBe(false);
  });
});
