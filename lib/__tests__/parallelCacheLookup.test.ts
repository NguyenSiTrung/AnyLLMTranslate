import { describe, it, expect, vi } from 'vitest';
import {
  parallelCacheLookup,
  partitionCacheOutcomes,
  type ParallelCacheLookupDeps,
} from '@/lib/parallelCacheLookup';

function makeDeps(overrides?: Partial<ParallelCacheLookupDeps>): ParallelCacheLookupDeps {
  return {
    getCachedTranslation: vi.fn().mockResolvedValue(null),
    getCachedFailure: vi.fn().mockResolvedValue(null),
    deleteCachedFailure: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('parallelCacheLookup', () => {
  it('classifies cached, failed, and uncached pieces', async () => {
    const deps = makeDeps({
      getCachedTranslation: vi.fn(async (text: string) =>
        text === 'hit' ? 'đã dịch' : null,
      ),
      getCachedFailure: vi.fn(async (text: string) =>
        text === 'fail' ? 'rate limited' : null,
      ),
    });

    const outcomes = await parallelCacheLookup(
      {
        pieces: [
          { id: '1', text: 'hit' },
          { id: '2', text: 'fail' },
          { id: '3', text: 'miss' },
        ],
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        cacheTTLDays: 30,
        failureCacheTtlMinutes: 120,
        enableFailureCache: true,
      },
      deps,
    );

    expect(outcomes).toEqual([
      { kind: 'cached', id: '1', translatedText: 'đã dịch', textLength: 3 },
      { kind: 'failed', id: '2', error: 'rate limited' },
      { kind: 'uncached', id: '3', text: 'miss' },
    ]);

    const partitioned = partitionCacheOutcomes(outcomes);
    expect(partitioned.cachedResults).toEqual([{ id: '1', translatedText: 'đã dịch' }]);
    expect(partitioned.failedResults).toEqual([{ id: '2', error: 'rate limited' }]);
    expect(partitioned.uncachedPieces).toEqual([{ id: '3', text: 'miss' }]);
    expect(partitioned.cacheCharacters).toBe(3);
  });

  it('runs lookups concurrently (not strictly serial)', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const deps = makeDeps({
      getCachedTranslation: vi.fn(async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 20));
        concurrent--;
        return null;
      }),
    });

    await parallelCacheLookup(
      {
        pieces: [
          { id: 'a', text: '1' },
          { id: 'b', text: '2' },
          { id: 'c', text: '3' },
        ],
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        cacheTTLDays: 30,
        failureCacheTtlMinutes: 120,
        enableFailureCache: false,
      },
      deps,
    );

    expect(maxConcurrent).toBeGreaterThanOrEqual(2);
  });

  it('FR-11: caps concurrent lookups under large piece lists', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const deps = makeDeps({
      getCachedTranslation: vi.fn(async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 5));
        concurrent--;
        return null;
      }),
    });

    const pieces = Array.from({ length: 40 }, (_, i) => ({
      id: `p${i}`,
      text: `text-${i}`,
    }));
    await parallelCacheLookup(
      {
        pieces,
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        cacheTTLDays: 30,
        failureCacheTtlMinutes: 120,
        enableFailureCache: false,
        concurrency: 4,
      },
      deps,
    );
    expect(maxConcurrent).toBeLessThanOrEqual(4);
    expect(maxConcurrent).toBeGreaterThanOrEqual(2);
  });

  it('skips failure cache and clears entries when skipFailureCache is true', async () => {
    const deleteCachedFailure = vi.fn().mockResolvedValue(undefined);
    const getCachedFailure = vi.fn().mockResolvedValue('stale');
    const deps = makeDeps({ deleteCachedFailure, getCachedFailure });

    const outcomes = await parallelCacheLookup(
      {
        pieces: [{ id: '1', text: 'x' }],
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        cacheTTLDays: 30,
        failureCacheTtlMinutes: 120,
        enableFailureCache: true,
        skipFailureCache: true,
      },
      deps,
    );

    expect(outcomes[0]?.kind).toBe('uncached');
    expect(getCachedFailure).not.toHaveBeenCalled();
    expect(deleteCachedFailure).toHaveBeenCalledWith('x', 'en', 'vi');
  });
});
