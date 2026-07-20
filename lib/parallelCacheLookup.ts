/**
 * Parallel success/failure cache classification for a piece list (FR-5).
 * Pure after the async cache getters resolve — no ordering side effects beyond
 * Promise.all settlement order (results are re-associated by piece id).
 */

export interface CacheLookupPiece {
  id: string;
  text: string;
}

export type CacheLookupOutcome =
  | { kind: 'cached'; id: string; translatedText: string; textLength: number }
  | { kind: 'failed'; id: string; error: string }
  | { kind: 'uncached'; id: string; text: string };

export interface ParallelCacheLookupDeps {
  getCachedTranslation: (
    text: string,
    sourceLanguage: string,
    targetLanguage: string,
    ttlDays: number,
  ) => Promise<string | null>;
  getCachedFailure: (
    text: string,
    sourceLanguage: string,
    targetLanguage: string,
    ttlMinutes: number,
  ) => Promise<string | null>;
  deleteCachedFailure: (
    text: string,
    sourceLanguage: string,
    targetLanguage: string,
  ) => Promise<void>;
}

export interface ParallelCacheLookupOptions {
  pieces: CacheLookupPiece[];
  sourceLanguage: string;
  targetLanguage: string;
  cacheTTLDays: number;
  failureCacheTtlMinutes: number;
  enableFailureCache: boolean;
  skipFailureCache?: boolean;
  /**
   * FR-11: max concurrent IDB lookups. Default {@link DEFAULT_CACHE_LOOKUP_CONCURRENCY}.
   * Set to 0 or Infinity for unbounded (legacy Promise.all).
   */
  concurrency?: number;
}

/** Default cap on parallel cache get/set fan-out (FR-11). */
export const DEFAULT_CACHE_LOOKUP_CONCURRENCY = 8;

/**
 * Run async workers over items with a concurrency cap; preserve result order.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit =
    !Number.isFinite(concurrency) || concurrency <= 0
      ? items.length
      : Math.max(1, Math.floor(concurrency));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runOne(): Promise<void> {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      const item = items[i];
      if (item === undefined) continue;
      results[i] = await worker(item, i);
    }
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, () => runOne());
  await Promise.all(runners);
  return results;
}

/**
 * Look up success + failure caches for all pieces with bounded concurrency (FR-11).
 * Preserves semantic order of outcomes matching input piece order.
 */
export async function parallelCacheLookup(
  options: ParallelCacheLookupOptions,
  deps: ParallelCacheLookupDeps,
): Promise<CacheLookupOutcome[]> {
  const {
    pieces,
    sourceLanguage,
    targetLanguage,
    cacheTTLDays,
    failureCacheTtlMinutes,
    enableFailureCache,
    skipFailureCache = false,
    concurrency = DEFAULT_CACHE_LOOKUP_CONCURRENCY,
  } = options;

  return mapWithConcurrency(pieces, concurrency, async (piece): Promise<CacheLookupOutcome> => {
    const cached = await deps.getCachedTranslation(
      piece.text,
      sourceLanguage,
      targetLanguage,
      cacheTTLDays,
    );
    if (cached !== null) {
      return {
        kind: 'cached',
        id: piece.id,
        translatedText: cached,
        textLength: piece.text.length,
      };
    }

    if (enableFailureCache && !skipFailureCache) {
      const failure = await deps.getCachedFailure(
        piece.text,
        sourceLanguage,
        targetLanguage,
        failureCacheTtlMinutes,
      );
      if (failure !== null) {
        return { kind: 'failed', id: piece.id, error: failure };
      }
    } else if (skipFailureCache) {
      // Fire-and-forget clear so forced retries re-hit the LLM.
      deps
        .deleteCachedFailure(piece.text, sourceLanguage, targetLanguage)
        .catch(() => {});
    }

    return { kind: 'uncached', id: piece.id, text: piece.text };
  });
}

/**
 * Partition parallel outcomes into cached / failed / uncached buckets.
 * When `originalById` is provided, uncached entries are rehydrated from the
 * original payloads so fields like `inArticleContext` / `variables` survive.
 */
export function partitionCacheOutcomes<T extends CacheLookupPiece>(
  outcomes: CacheLookupOutcome[],
  originalById?: Map<string, T>,
): {
  cachedResults: Array<{ id: string; translatedText: string }>;
  failedResults: Array<{ id: string; error: string }>;
  uncachedPieces: T[];
  cacheCharacters: number;
} {
  const cachedResults: Array<{ id: string; translatedText: string }> = [];
  const failedResults: Array<{ id: string; error: string }> = [];
  const uncachedPieces: T[] = [];
  let cacheCharacters = 0;

  for (const outcome of outcomes) {
    if (outcome.kind === 'cached') {
      cachedResults.push({ id: outcome.id, translatedText: outcome.translatedText });
      cacheCharacters += outcome.textLength;
    } else if (outcome.kind === 'failed') {
      failedResults.push({ id: outcome.id, error: outcome.error });
    } else {
      const original = originalById?.get(outcome.id);
      if (original) {
        uncachedPieces.push(original);
      } else {
        // Fallback when caller didn't pass originals (unit tests).
        uncachedPieces.push({ id: outcome.id, text: outcome.text } as T);
      }
    }
  }

  return { cachedResults, failedResults, uncachedPieces, cacheCharacters };
}
