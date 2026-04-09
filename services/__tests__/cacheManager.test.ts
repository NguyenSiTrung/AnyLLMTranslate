import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateCacheKey } from '../cacheManager';

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

    it('generates a hex string key', async () => {
      const key = await generateCacheKey('Hello', 'en', 'vi');
      expect(typeof key).toBe('string');
      expect(key).toMatch(/^[0-9a-f]+$/);
    });

    it('generates different keys for different texts', async () => {
      const key1 = await generateCacheKey('Hello', 'en', 'vi');
      const key2 = await generateCacheKey('World', 'en', 'vi');
      expect(key1).not.toBe(key2);
    });

    it('generates different keys for different language pairs', async () => {
      const key1 = await generateCacheKey('Hello', 'en', 'vi');
      const key2 = await generateCacheKey('Hello', 'en', 'ja');
      expect(key1).not.toBe(key2);
    });

    it('generates consistent key for same input', async () => {
      const key1 = await generateCacheKey('Hello', 'en', 'vi');
      const key2 = await generateCacheKey('Hello', 'en', 'vi');
      expect(key1).toBe(key2);
    });

    it('uses FNV fallback when SubtleCrypto is not available', async () => {
      vi.stubGlobal('crypto', {});

      const key = await generateCacheKey('Hello', 'en', 'vi');
      expect(key).toMatch(/^fnv-[0-9a-f]+$/);
    });
  });
});
