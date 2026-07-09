/**
 * Selection dictionary cache key — pure helper.
 *
 * Dictionary responses are structured JSON (phonetic/definitions/…); plain
 * selection translations are strings. Keys are namespaced with `dict:` so the
 * two modes never collide in IndexedDB.
 */

import { generateCacheKey } from '@/services/cacheManager';

/** Namespace prefix isolating dictionary entries from plain selection/web cache. */
export const SELECTION_DICTIONARY_CACHE_PREFIX = 'dict:';

/**
 * Cache key for dictionary-mode selection results.
 * Uses the same SHA-256 text+lang identity as plain cache, with a `dict:` prefix.
 */
export async function generateSelectionDictionaryCacheKey(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
): Promise<string> {
  const base = await generateCacheKey(text, sourceLanguage, targetLanguage);
  return `${SELECTION_DICTIONARY_CACHE_PREFIX}${base}`;
}
