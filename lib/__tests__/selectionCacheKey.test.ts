import { describe, it, expect } from 'vitest';
import {
  generateSelectionDictionaryCacheKey,
  SELECTION_DICTIONARY_CACHE_PREFIX,
} from '../selectionCacheKey';
import { generateCacheKey } from '@/services/cacheManager';

describe('selectionCacheKey', () => {
  it('prefixes dictionary keys, is deterministic, and varies by text/lang', async () => {
    const plain = await generateCacheKey('hello', 'en', 'vi');
    const dict = await generateSelectionDictionaryCacheKey('hello', 'en', 'vi');
    expect(dict).toBe(`${SELECTION_DICTIONARY_CACHE_PREFIX}${plain}`);
    expect(dict).not.toBe(plain);

    expect(await generateSelectionDictionaryCacheKey('word', 'en', 'zh')).toBe(
      await generateSelectionDictionaryCacheKey('word', 'en', 'zh'),
    );
    const base = await generateSelectionDictionaryCacheKey('hello', 'en', 'vi');
    expect(await generateSelectionDictionaryCacheKey('hello', 'en', 'zh')).not.toBe(base);
    expect(await generateSelectionDictionaryCacheKey('world', 'en', 'vi')).not.toBe(base);
  });
});
