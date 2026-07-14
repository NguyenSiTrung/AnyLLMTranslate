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
}

/**
 * Look up success + failure caches for all pieces in parallel.
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
  } = options;

  return Promise.all(
    pieces.map(async (piece): Promise<CacheLookupOutcome> => {
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
    }),
  );
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
