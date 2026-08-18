import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateCacheKey,
  generateNegativeCacheKey,
  NEGATIVE_CACHE_PREFIX,
  estimateStoredBytes,
  formatCacheSize,
  resolveEntrySizeBytes,
} from '../cacheManager';

// Note: Full cache tests require real IndexedDB (integration test).
// Here we unit-test pure helpers (keys + size estimation/formatting).

describe('services/cacheManager', () => {
  describe('estimateStoredBytes / formatCacheSize', () => {
    it('sizes cache entries, legacy/missing sizeBytes, and formats units', () => {
      const key = 'a'.repeat(64);
      const entry = {
        key,
        translatedText: 'Xin chào thế giới',
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        cachedAt: 1,
        lastAccessedAt: 2,
      };
      const bytes = estimateStoredBytes(key, entry);
      const textOnly = new TextEncoder().encode(entry.translatedText).length;
      expect(bytes).toBeGreaterThan(textOnly + key.length);
      expect(bytes).toBe(
        new TextEncoder().encode(key).length +
          new TextEncoder().encode(JSON.stringify(entry)).length,
      );

      const legacyKey = 'legacy-key';
      const legacy = { translatedText: 'hello world', sourceLanguage: 'en', targetLanguage: 'vi' };
      expect(resolveEntrySizeBytes(legacyKey, legacy)).toBe(estimateStoredBytes(legacyKey, legacy));

      expect(estimateStoredBytes('classify:abc', 'prose')).toBe(
        new TextEncoder().encode('classify:abc').length +
          new TextEncoder().encode('prose').length,
      );

      expect(formatCacheSize(0)).toBe('0 B');
      expect(formatCacheSize(400)).toBe('400 B');
      expect(formatCacheSize(12 * 1024)).toMatch(/KB/);
      expect(formatCacheSize(50 * 1024)).toBe('50 KB');
      expect(formatCacheSize(1.5 * 1024 * 1024)).toBe('1.50 MB');

      const without = estimateStoredBytes('k', { translatedText: 'hi' });
      expect(estimateStoredBytes('k', { translatedText: 'hi', sizeBytes: 99999 })).toBe(without);
    });
  });

  describe('cache keys', () => {
    beforeEach(() => {
      vi.stubGlobal('crypto', {
        subtle: {
          digest: vi.fn(async (_algo: string, data: ArrayBuffer) => {
            const arr = new Uint8Array(32);
            const view = new Uint8Array(
              data instanceof ArrayBuffer ? data : (data as Uint8Array).buffer,
            );
            for (let i = 0; i < view.length && i < 32; i++) {
              arr[i] = view[i]! ^ 0x42;
            }
            return arr.buffer;
          }),
        },
      });
    });

    it('generates stable, distinct, and fingerprint-sensitive cache keys (success + negative-cache)', async () => {
      const key1 = await generateCacheKey('Hello', 'en', 'vi');
      const key2 = await generateCacheKey('Hello', 'en', 'vi');
      expect(key1).toMatch(/^[0-9a-f]{64}$/);
      expect(key2).toBe(key1);
      expect(await generateCacheKey('World', 'en', 'vi')).not.toBe(key1);
      expect(await generateCacheKey('Hello', 'en', 'ja')).not.toBe(key1);

      const negKey = await generateNegativeCacheKey('Hello', 'en', 'vi');
      expect(negKey).toBe(`${NEGATIVE_CACHE_PREFIX}${key1}`);
      expect(negKey).not.toBe(key1);
      expect(await generateNegativeCacheKey('World', 'en', 'vi')).not.toBe(negKey);

      // FR-6: glossary/model fingerprint change produces cache miss (distinct keys).
      const base = await generateCacheKey('Hello', 'en', 'vi', 'gpt-4o-mini', 'fp-gloss-a');
      const glossB = await generateCacheKey('Hello', 'en', 'vi', 'gpt-4o-mini', 'fp-gloss-b');
      const modelB = await generateCacheKey('Hello', 'en', 'vi', 'other-model', 'fp-gloss-a');
      const legacy = await generateCacheKey('Hello', 'en', 'vi');
      expect(base).not.toBe(glossB);
      expect(base).not.toBe(modelB);
      // Old keys without fingerprint miss safely (no silent cross-config hit)
      expect(base).not.toBe(legacy);
      expect(await generateNegativeCacheKey('Hello', 'en', 'vi', 'gpt-4o-mini', 'fp-gloss-a')).toBe(
        `${NEGATIVE_CACHE_PREFIX}${base}`,
      );
    });
  });
});
