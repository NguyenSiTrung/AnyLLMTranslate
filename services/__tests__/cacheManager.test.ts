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
    it('counts key + JSON payload bytes for CacheEntry-shaped values', () => {
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
      // Must be more than translatedText alone (historical undercount).
      const textOnly = new TextEncoder().encode(entry.translatedText).length;
      expect(bytes).toBeGreaterThan(textOnly + key.length);
      expect(bytes).toBe(
        new TextEncoder().encode(key).length +
          new TextEncoder().encode(JSON.stringify(entry)).length,
      );
    });

    it('still measures size when sizeBytes is missing (legacy entries)', () => {
      const key = 'legacy-key';
      const entry = { translatedText: 'hello world', sourceLanguage: 'en', targetLanguage: 'vi' };
      expect(resolveEntrySizeBytes(key, entry)).toBeGreaterThan(0);
      expect(resolveEntrySizeBytes(key, entry)).toBe(estimateStoredBytes(key, entry));
    });

    it('measures classification string values', () => {
      const bytes = estimateStoredBytes('classify:abc', 'prose');
      expect(bytes).toBe(
        new TextEncoder().encode('classify:abc').length +
          new TextEncoder().encode('prose').length,
      );
    });

    it('formats small caches as B/KB instead of 0.0 MB', () => {
      expect(formatCacheSize(0)).toBe('0 B');
      expect(formatCacheSize(400)).toBe('400 B');
      expect(formatCacheSize(12 * 1024)).toMatch(/KB/);
      expect(formatCacheSize(12 * 1024)).not.toBe('0.0 MB');
      // 50 KB used to display as 0.0 MB with toFixed(1)
      expect(formatCacheSize(50 * 1024)).toBe('50 KB');
      expect(formatCacheSize(1.5 * 1024 * 1024)).toBe('1.50 MB');
    });

    it('ignores stored sizeBytes when estimating (no chicken-and-egg)', () => {
      const key = 'k';
      const without = estimateStoredBytes(key, { translatedText: 'hi' });
      const withSize = estimateStoredBytes(key, { translatedText: 'hi', sizeBytes: 99999 });
      expect(withSize).toBe(without);
    });
  });

  describe('generateCacheKey', () => {
    beforeEach(() => {
      // Mock crypto.subtle for jsdom
      vi.stubGlobal('crypto', {
        subtle: {
          digest: vi.fn(async (_algo: string, data: ArrayBuffer) => {
            // Simple mock hash — just return a deterministic buffer
            const arr = new Uint8Array(32);
            const view = new Uint8Array(data instanceof ArrayBuffer ? data : (data as Uint8Array).buffer);
            for (let i = 0; i < view.length && i < 32; i++) {
              arr[i] = view[i] ^ 0x42;
            }
            return arr.buffer;
          }),
        },
      });
    });

    it('generates a consistent 64-char hex SHA-256 key for the same input', async () => {
      const key1 = await generateCacheKey('Hello', 'en', 'vi');
      const key2 = await generateCacheKey('Hello', 'en', 'vi');
      expect(key1).toMatch(/^[0-9a-f]{64}$/);
      expect(key2).toBe(key1);
    });

    it('generates different keys for different texts or language pairs', async () => {
      const base = await generateCacheKey('Hello', 'en', 'vi');
      expect(await generateCacheKey('World', 'en', 'vi')).not.toBe(base);
      expect(await generateCacheKey('Hello', 'en', 'ja')).not.toBe(base);
    });
  });

  describe('FR-4 negative cache key', () => {
    beforeEach(() => {
      vi.stubGlobal('crypto', {
        subtle: {
          digest: vi.fn(async (_algo: string, data: ArrayBuffer) => {
            const arr = new Uint8Array(32);
            const view = new Uint8Array(data instanceof ArrayBuffer ? data : (data as Uint8Array).buffer);
            for (let i = 0; i < view.length && i < 32; i++) {
              arr[i] = view[i] ^ 0x42;
            }
            return arr.buffer;
          }),
        },
      });
    });

    it('prefixes the success-cache key with the negative namespace', async () => {
      const negKey = await generateNegativeCacheKey('Hello', 'en', 'vi');
      expect(negKey.startsWith(NEGATIVE_CACHE_PREFIX)).toBe(true);
      // The remainder equals the success-cache key for the same input.
      const successKey = await generateCacheKey('Hello', 'en', 'vi');
      expect(negKey).toBe(`${NEGATIVE_CACHE_PREFIX}${successKey}`);
    });

    it('never collides with the success-cache key for the same text/lang', async () => {
      const negKey = await generateNegativeCacheKey('Hello', 'en', 'vi');
      const successKey = await generateCacheKey('Hello', 'en', 'vi');
      expect(negKey).not.toBe(successKey);
    });

    it('produces distinct negative keys for different inputs', async () => {
      const a = await generateNegativeCacheKey('Hello', 'en', 'vi');
      const b = await generateNegativeCacheKey('World', 'en', 'vi');
      expect(a).not.toBe(b);
    });
  });
});
