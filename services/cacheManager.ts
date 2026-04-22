/**
 * Translation cache backed by IndexedDB via idb-keyval.
 * Uses SHA-256 hashing for cache keys, TTL-based expiry, and LRU eviction.
 */

import { createStore, get, set, del, keys, entries } from 'idb-keyval';
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

  // Use SubtleCrypto if available (background/service worker)
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Fallback: simple FNV-1a hash for environments without SubtleCrypto
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv-${(hash >>> 0).toString(16)}`;
}

/** Pending LRU updates — Map ensures per-key deduplication (latest wins) */
const pendingLruUpdates = new Map<string, CacheEntry>();

/** Debounce timer for LRU flush */
let lruFlushTimer: ReturnType<typeof setTimeout> | null = null;

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
      await set(key, entry, getStore());
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

    // Check TTL expiry
    const ttlMs = ttlDays * 24 * 60 * 60 * 1000;
    if (Date.now() - entry.cachedAt > ttlMs) {
      await del(key, getStore());
      return null;
    }

    // FR-4: Defer LRU update — accumulate in Map and flush via debounce
    entry.lastAccessedAt = Date.now();
    pendingLruUpdates.set(key, entry);
    if (lruFlushTimer !== null) clearTimeout(lruFlushTimer);
    lruFlushTimer = setTimeout(() => {
      flushLruUpdates().catch(() => {
        // Silently fail — LRU update is best-effort
      });
    }, 100);

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
    const entry: CacheEntry = {
      key,
      translatedText,
      sourceLanguage,
      targetLanguage,
      cachedAt: Date.now(),
      lastAccessedAt: Date.now(),
      sizeBytes: new TextEncoder().encode(translatedText).length,
    };
    await set(key, entry, getStore());
  } catch {
    // Silently fail — cache is best-effort
  }
}

/** Evict expired and LRU entries to stay under maxSizeMB */
export async function evictCache(
  maxSizeMB = 100,
  ttlDays = 30,
): Promise<number> {
  try {
    const allEntries = await entries<string, CacheEntry>(getStore());
    const ttlMs = ttlDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let evicted = 0;

    // Phase 1: Remove expired entries
    const validEntries: [string, CacheEntry][] = [];
    for (const [key, entry] of allEntries) {
      if (now - entry.cachedAt > ttlMs) {
        await del(key, getStore());
        evicted++;
      } else {
        validEntries.push([key, entry]);
      }
    }

    // Phase 2: LRU eviction if still over size
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    let totalSize = validEntries.reduce((sum, [, e]) => sum + (e.sizeBytes ?? 0), 0);

    if (totalSize > maxSizeBytes) {
      // Sort by lastAccessedAt ascending (oldest first)
      validEntries.sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);

      for (const [key, entry] of validEntries) {
        if (totalSize <= maxSizeBytes) break;
        await del(key, getStore());
        totalSize -= entry.sizeBytes ?? 0;
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
  try {
    const allKeys = await keys(getStore());
    for (const key of allKeys) {
      await del(key, getStore());
    }
  } catch {
    // Silently fail
  }
}

/** Get cache statistics */
export async function getCacheStats(): Promise<{
  entryCount: number;
  totalSizeBytes: number;
}> {
  try {
    const allEntries = await entries<string, CacheEntry>(getStore());
    const totalSizeBytes = allEntries.reduce(
      (sum, [, entry]) => sum + (entry.sizeBytes ?? 0),
      0,
    );
    return { entryCount: allEntries.length, totalSizeBytes };
  } catch {
    return { entryCount: 0, totalSizeBytes: 0 };
  }
}
