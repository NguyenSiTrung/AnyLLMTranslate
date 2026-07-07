import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateCacheKey, generateNegativeCacheKey, NEGATIVE_CACHE_PREFIX } from '../cacheManager';

// Note: Full cache tests require real IndexedDB (integration test).
// Here we unit-test the cache key generation function which is pure.

describe('services/cacheManager', () => {
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
