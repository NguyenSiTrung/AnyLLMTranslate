/**
 * Translation cache backed by IndexedDB via idb-keyval.
 * Uses SHA-256 hashing for cache keys, TTL-based expiry, and LRU eviction.
 */

import { createStore, get, set, del, entries, clear } from 'idb-keyval';
import type { CacheEntry } from '@/types/translation';
import { STORAGE_KEYS } from '@/lib/constants';

/** Cache store — lazy initialized */
let store: ReturnType<typeof createStore> | null = null;

function getStore(): ReturnType<typeof createStore> {
  if (!store) {
    store = createStore(STORAGE_KEYS.CACHE_DB, STORAGE_KEYS.CACHE_STORE);
  }
  return store;
}

/** Generate SHA-256 cache key from source text + language pair */
export async function generateCacheKey(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
): Promise<string> {
  const input = `${sourceLanguage}:${targetLanguage}:${text}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(input);

  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * FR-4: Negative-cache (failure) namespace prefix. Negative entries are stored
 * under `negative:` + the same SHA-256 key as success entries so they share the
 * text/lang identity but never collide with success-cache lookups.
 */
export const NEGATIVE_CACHE_PREFIX = 'negative:';

/** Build a negative-cache key from the same inputs as the success cache key. */
export async function generateNegativeCacheKey(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
): Promise<string> {
  const base = await generateCacheKey(text, sourceLanguage, targetLanguage);
  return `${NEGATIVE_CACHE_PREFIX}${base}`;
}

/** Pending LRU updates — Map ensures per-key deduplication (latest wins) */
const pendingLruUpdates = new Map<string, CacheEntry>();

/** Debounce timer for LRU flush */
let lruFlushTimer: ReturnType<typeof setTimeout> | null = null;

/** P2: set while clearCache() is in progress so concurrent getCachedTranslation
 *  reads skip the LRU-update step — otherwise a read during clear could re-add
 *  an entry to pendingLruUpdates and a later flush would resurrect it. */
let isClearing = false;

/** Mutex to prevent overlapping async flush calls */
let isFlushing = false;

/** Flush all pending LRU updates in one batch */
export async function flushLruUpdates(): Promise<void> {
  if (isFlushing) return;
  isFlushing = true;
  lruFlushTimer = null;
  // Snapshot and clear before async ops to avoid races
  const batch = new Map(pendingLruUpdates);
  pendingLruUpdates.clear();
  try {
    for (const [key, entry] of batch) {
      try {
        await set(key, entry, getStore());
      } catch {
        // Re-add failed entries for retry on next flush
        pendingLruUpdates.set(key, entry);
      }
    }
  } finally {
    isFlushing = false;
  }
}

/** Get a cached translation */
export async function getCachedTranslation(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
  ttlDays = 30,
): Promise<string | null> {
  try {
    const key = await generateCacheKey(text, sourceLanguage, targetLanguage);
    const entry = await get<CacheEntry>(key, getStore());

    if (!entry) return null;

    // Check TTL expiry (clamp ttlDays to minimum 1 to prevent accidental cache disable)
    const safeTtlDays = Math.max(1, ttlDays);
    const ttlMs = safeTtlDays * 24 * 60 * 60 * 1000;
    if (Date.now() - entry.cachedAt > ttlMs) {
      await del(key, getStore());
      return null;
    }

    // FR-4: Defer LRU update — accumulate in Map and flush via debounce.
    // Skip while a clear is in progress to avoid resurrecting cleared entries.
    if (!isClearing) {
      entry.lastAccessedAt = Date.now();
      pendingLruUpdates.set(key, entry);
      if (lruFlushTimer !== null) clearTimeout(lruFlushTimer);
      lruFlushTimer = setTimeout(() => {
        flushLruUpdates().catch(() => {
          // Silently fail — LRU update is best-effort
        });
      }, 100);
    }

    return entry.translatedText;
  } catch {
    return null;
  }
}

/** Store a translation in cache */
export async function cacheTranslation(
  text: string,
  translatedText: string,
  sourceLanguage: string,
  targetLanguage: string,
): Promise<void> {
  try {
    const key = await generateCacheKey(text, sourceLanguage, targetLanguage);
    const entry = buildCacheEntry(key, translatedText, sourceLanguage, targetLanguage);
    await set(key, entry, getStore());
  } catch {
    // Silently fail — cache is best-effort
  }
}

/**
 * Read a cached translation by an EXACT precomputed key.
 *
 * Used by the subtitle path, which computes its own context-aware key via
 * `generateSubtitleCacheKey` (profile + knobs + glossary, namespaced from the
 * web path). The generic `getCachedTranslation` (text→key) is untouched and
 * remains the entry point for web/selection/PDF.
 */
export async function getCachedTranslationByKey(key: string, ttlDays = 30): Promise<string | null> {
  try {
    const entry = await get<CacheEntry>(key, getStore());
    if (!entry) return null;
    const safeTtlDays = Math.max(1, ttlDays);
    const ttlMs = safeTtlDays * 24 * 60 * 60 * 1000;
    if (Date.now() - entry.cachedAt > ttlMs) {
      await del(key, getStore());
      return null;
    }
    if (!isClearing) {
      entry.lastAccessedAt = Date.now();
      pendingLruUpdates.set(key, entry);
      if (lruFlushTimer !== null) clearTimeout(lruFlushTimer);
      lruFlushTimer = setTimeout(() => {
        flushLruUpdates().catch(() => {
          // Silently fail — LRU update is best-effort
        });
      }, 100);
    }
    return entry.translatedText;
  } catch {
    return null;
  }
}

/**
 * Store a translation by an EXACT precomputed key (subtitle path).
 * Mirrors `cacheTranslation` but skips key generation.
 */
export async function cacheTranslationByKey(
  key: string,
  translatedText: string,
  sourceLanguage: string,
  targetLanguage: string,
): Promise<void> {
  try {
    const entry = buildCacheEntry(key, translatedText, sourceLanguage, targetLanguage);
    await set(key, entry, getStore());
  } catch {
    // Silently fail — cache is best-effort
  }
}

/**
 * FR-4: Negative cache (failure cache).
 *
 * On a hard translation failure (after all retries/failover), record the error
 * so a second scroll-past within the TTL short-circuits to the error state
 * without hitting the LLM. Entries live under the `negative:` namespace and
 * share the success-cache's text/lang identity.
 */

/** Interface for a negative-cache entry (kept minimal — no translatedText). */
interface NegativeCacheEntry {
  key: string;
  error: string;
  cachedAt: number;
}

/** Read a cached failure for this text/lang pair. Returns the error string if a
 *  fresh negative entry exists, or null on miss/expiry/disabled. */
export async function getCachedFailure(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
  ttlMinutes = 120,
): Promise<string | null> {
  try {
    const key = await generateNegativeCacheKey(text, sourceLanguage, targetLanguage);
    const entry = await get<NegativeCacheEntry>(key, getStore());
    if (!entry) return null;
    const ttlMs = Math.max(1, ttlMinutes) * 60 * 1000;
    if (Date.now() - entry.cachedAt > ttlMs) {
      await del(key, getStore());
      return null;
    }
    return entry.error;
  } catch {
    return null;
  }
}

/** Record a translation failure so it isn't retried within the TTL. */
export async function cacheFailure(
  text: string,
  error: string,
  sourceLanguage: string,
  targetLanguage: string,
): Promise<void> {
  try {
    const key = await generateNegativeCacheKey(text, sourceLanguage, targetLanguage);
    const entry: NegativeCacheEntry = { key, error, cachedAt: Date.now() };
    await set(key, entry, getStore());
  } catch {
    // Silently fail — negative cache is best-effort
  }
}

/** Delete a cached failure so a forced retry (user clicks "retry") isn't
 *  shadowed by a stale negative-cache entry. Best-effort, never throws. */
export async function deleteCachedFailure(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
): Promise<void> {
  try {
    const key = await generateNegativeCacheKey(text, sourceLanguage, targetLanguage);
    await del(key, getStore());
  } catch {
    // Silently fail — negative cache is best-effort
  }
}

/** Evict expired and LRU entries to stay under maxSizeMB */
export async function evictCache(
  maxSizeMB = 100,
  ttlDays = 30,
): Promise<number> {
  try {
    const allEntries = await entries<string, CacheEntry>(getStore());
    const safeTtlDays = Math.max(1, ttlDays);
    const ttlMs = safeTtlDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let evicted = 0;

    // Phase 1: Remove expired entries. Negative-cache entries (FR-4) share this
    // store under a `negative:` prefix and lack some CacheEntry fields, so guard
    // field access and exclude them from the LRU size/sort accounting (they're
    // tiny and short-TTL anyway).
    const validEntries: [string, CacheEntry][] = [];
    for (const [key, entry] of allEntries) {
      const cachedAt = (entry as { cachedAt?: number }).cachedAt ?? 0;
      if (cachedAt && now - cachedAt > ttlMs) {
        await del(key, getStore());
        evicted++;
      } else if (key.startsWith(NEGATIVE_CACHE_PREFIX)) {
        // Negative entries: skip LRU size accounting (tiny, short-TTL).
        continue;
      } else {
        validEntries.push([key, entry as CacheEntry]);
      }
    }

    // Phase 2: LRU eviction if still over size (clamp to minimum 10 MB)
    const safeMaxSizeMB = Math.max(10, maxSizeMB);
    const maxSizeBytes = safeMaxSizeMB * 1024 * 1024;
    let totalSize = validEntries.reduce(
      (sum, [key, e]) => sum + resolveEntrySizeBytes(key, e),
      0,
    );

    if (totalSize > maxSizeBytes) {
      // Sort by lastAccessedAt ascending (oldest first)
      validEntries.sort((a, b) => (a[1].lastAccessedAt ?? 0) - (b[1].lastAccessedAt ?? 0));

      for (const [key, entry] of validEntries) {
        if (totalSize <= maxSizeBytes) break;
        await del(key, getStore());
        totalSize -= resolveEntrySizeBytes(key, entry);
        evicted++;
      }
    }

    return evicted;
  } catch {
    return 0;
  }
}

/** Clear the entire cache */
export async function clearCache(): Promise<void> {
  // P2: gate concurrent reads so they don't re-add entries to pendingLruUpdates
  // while we're deleting. Reset in finally so a failure doesn't wedge the cache.
  isClearing = true;
  try {
    // Cancel any pending LRU flush to prevent re-writing deleted entries
    if (lruFlushTimer !== null) {
      clearTimeout(lruFlushTimer);
      lruFlushTimer = null;
    }
    pendingLruUpdates.clear();

    // Use idb-keyval clear() for bulk deletion instead of sequential del() loop
    await clear(getStore());
  } finally {
    isClearing = false;
  }
}

/**
 * Approximate IndexedDB footprint for a key/value pair.
 *
 * Why not trust `CacheEntry.sizeBytes` alone?
 * - Older / negative / classify entries often omit it (treated as 0).
 * - Historical writes only counted `translatedText` UTF-8 length, so totals
 *   under-reported envelope fields (key, langs, timestamps) by a large factor.
 * Measuring key + serialized value matches what the UI and LRU care about.
 */
export function estimateStoredBytes(key: string, value: unknown): number {
  const enc = new TextEncoder();
  const keyBytes = enc.encode(key).length;
  if (value == null) return keyBytes;
  if (typeof value === 'string') {
    return keyBytes + enc.encode(value).length;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return keyBytes + String(value).length;
  }
  try {
    // Strip sizeBytes when present so the estimate is independent of the field
    // we are trying to populate (avoids chicken-and-egg on write).
    let payload: unknown = value;
    if (typeof value === 'object' && value !== null && 'sizeBytes' in value) {
      const { sizeBytes: _ignored, ...rest } = value as Record<string, unknown>;
      payload = rest;
    }
    return keyBytes + enc.encode(JSON.stringify(payload)).length;
  } catch {
    return keyBytes;
  }
}

/**
 * Human-readable cache size for the options UI.
 * Small caches must not round to "0.0 MB" (a few hundred KB used to).
 */
export function formatCacheSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb).toString()} KB`;
  }
  const mb = bytes / (1024 * 1024);
  if (mb < 10) return `${mb.toFixed(2)} MB`;
  return `${mb.toFixed(1)} MB`;
}

/** Build a CacheEntry with an accurate sizeBytes estimate. */
function buildCacheEntry(
  key: string,
  translatedText: string,
  sourceLanguage: string,
  targetLanguage: string,
): CacheEntry {
  const now = Date.now();
  const base = {
    key,
    translatedText,
    sourceLanguage,
    targetLanguage,
    cachedAt: now,
    lastAccessedAt: now,
  };
  return {
    ...base,
    sizeBytes: estimateStoredBytes(key, base),
  };
}

/**
 * Resolve byte size for stats/LRU.
 * Always re-estimates from key + payload so legacy entries (missing or
 * undercounted sizeBytes) and non-CacheEntry values still contribute.
 */
export function resolveEntrySizeBytes(key: string, entry: unknown): number {
  return estimateStoredBytes(key, entry);
}

/** Get cache statistics */
export async function getCacheStats(): Promise<{
  entryCount: number;
  totalSizeBytes: number;
}> {
  try {
    const allEntries = await entries<string, unknown>(getStore());
    let totalSizeBytes = 0;
    for (const [key, entry] of allEntries) {
      totalSizeBytes += resolveEntrySizeBytes(key, entry);
    }
    return { entryCount: allEntries.length, totalSizeBytes };
  } catch {
    return { entryCount: 0, totalSizeBytes: 0 };
  }
}

// ── Classification cache (prose|figure|math decisions) ──────────────────────

/**
 * Prefix for classification cache keys. Classification results share the same
 * IndexedDB store as translations but use this prefix to guarantee keys never
 * collide with translation cache entries (which are bare SHA-256 hashes).
 *
 * Classification values are stored as plain strings ('prose' | 'figure' |
 * 'math') rather than CacheEntry objects — they are tiny (a single label) and
 * do not participate in LRU/TTL bookkeeping. The eviction logic tolerates
 * non-CacheEntry values gracefully (`sizeBytes ?? 0`, `cachedAt` NaN →
 * survives TTL).
 */
const CLASSIFY_CACHE_PREFIX = 'classify:';

/**
 * Cache key for paragraph classification results. Produces a
 * `classify:`-prefixed SHA-256 hash so classification results share the same
 * IndexedDB store as translations but never collide with translation keys.
 */
export async function classifyCacheKey(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
): Promise<string> {
  const base = await generateCacheKey(text, sourceLanguage, targetLanguage);
  return `${CLASSIFY_CACHE_PREFIX}${base}`;
}

/**
 * Get a cached classification result. Returns null on miss or error.
 *
 * @param key — a key produced by `classifyCacheKey`
 * @returns the cached label ('prose' | 'figure' | 'math') or null
 */
export async function getCachedClassification(key: string): Promise<string | null> {
  try {
    const value = await get<string>(key, getStore());
    return value ?? null;
  } catch {
    return null;
  }
}

/**
 * Cache a classification result. Best-effort — silently fails on error so
 * classification failures never break the translation pipeline.
 *
 * @param key — a key produced by `classifyCacheKey`
 * @param kind — the classification label ('prose' | 'figure' | 'math')
 */
export async function cacheClassification(key: string, kind: string): Promise<void> {
  try {
    await set(key, kind, getStore());
  } catch {
    // Silently fail — cache is best-effort
  }
}
