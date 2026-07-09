import { describe, it, expect } from 'vitest';
import {
  generateSelectionDictionaryCacheKey,
  SELECTION_DICTIONARY_CACHE_PREFIX,
} from '../selectionCacheKey';
import { generateCacheKey } from '@/services/cacheManager';

describe('selectionCacheKey', () => {
  it('prefixes dictionary keys so they differ from plain selection keys', async () => {
    const plain = await generateCacheKey('hello', 'en', 'vi');
    const dict = await generateSelectionDictionaryCacheKey('hello', 'en', 'vi');

    expect(dict.startsWith(SELECTION_DICTIONARY_CACHE_PREFIX)).toBe(true);
    expect(dict).toBe(`${SELECTION_DICTIONARY_CACHE_PREFIX}${plain}`);
    expect(dict).not.toBe(plain);
  });

  it('is deterministic for the same inputs', async () => {
    const a = await generateSelectionDictionaryCacheKey('word', 'en', 'zh');
    const b = await generateSelectionDictionaryCacheKey('word', 'en', 'zh');
    expect(a).toBe(b);
  });

  it('changes when language pair or text changes', async () => {
    const base = await generateSelectionDictionaryCacheKey('hello', 'en', 'vi');
    const otherLang = await generateSelectionDictionaryCacheKey('hello', 'en', 'zh');
    const otherText = await generateSelectionDictionaryCacheKey('world', 'en', 'vi');

    expect(otherLang).not.toBe(base);
    expect(otherText).not.toBe(base);
  });
});
