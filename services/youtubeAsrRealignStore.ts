/**
 * YouTube ASR AI re-align cache — IndexedDB via idb-keyval.
 * Background-owned. Never throws (fail-open for the subtitle pipeline).
 */

import { createStore, get, set, del, entries, clear } from 'idb-keyval';
import { STORAGE_KEYS } from '@/lib/constants';
import {
  ASR_REALIGN_MAX_BYTES,
  ASR_REALIGN_MAX_ENTRIES,
  estimateAsrRealignEntryBytes,
  pickLruKeysToEvict,
  toAsrRealignSummary,
  type YoutubeAsrRealignCacheEntry,
  type YoutubeAsrRealignCacheSummary,
} from '@/lib/youtubeAsrRealignCache';

let store: ReturnType<typeof createStore> | null = null;

function getStore(): ReturnType<typeof createStore> {
  if (!store) {
    store = createStore(STORAGE_KEYS.ASR_REALIGN_DB, STORAGE_KEYS.ASR_REALIGN_STORE);
  }
  return store;
}

const inflight = new Map<string, Promise<unknown>>();

export function getOrCreateAsrRealignInflight<T>(
  key: string,
  factory: () => Promise<T>,
): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const p = factory().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, p);
  return p;
}

export function clearAsrRealignInflight(key: string): void {
  inflight.delete(key);
}

export async function getAsrRealignEntry(
  key: string,
): Promise<YoutubeAsrRealignCacheEntry | undefined> {
  try {
    const entry = await get<YoutubeAsrRealignCacheEntry>(key, getStore());
    return entry ?? undefined;
  } catch {
    return undefined;
  }
}

export async function touchAsrRealignEntry(key: string): Promise<void> {
  try {
    const entry = await getAsrRealignEntry(key);
    if (!entry) return;
    entry.lastUsedAt = Date.now();
    await set(key, entry, getStore());
  } catch {
    // no-op
  }
}

export async function saveAsrRealignEntry(entry: YoutubeAsrRealignCacheEntry): Promise<void> {
  try {
    const byteSize = estimateAsrRealignEntryBytes(entry);
    const toSave: YoutubeAsrRealignCacheEntry = { ...entry, byteSize };

    const all = await entries<string, YoutubeAsrRealignCacheEntry>(getStore());
    const others = all
      .filter(([k]) => k !== toSave.key)
      .map(([k, v]) => ({
        key: k,
        lastUsedAt: v.lastUsedAt ?? 0,
        byteSize: v.byteSize ?? estimateAsrRealignEntryBytes(v),
      }));

    const victims = pickLruKeysToEvict(others, {
      maxEntries: ASR_REALIGN_MAX_ENTRIES,
      maxBytes: ASR_REALIGN_MAX_BYTES,
      incomingBytes: byteSize,
    });
    for (const vk of victims) {
      try {
        await del(vk, getStore());
      } catch {
        // continue
      }
    }

    await set(toSave.key, toSave, getStore());
  } catch {
    // no-op
  }
}

export async function listAsrRealignSummaries(): Promise<YoutubeAsrRealignCacheSummary[]> {
  try {
    const all = await entries<string, YoutubeAsrRealignCacheEntry>(getStore());
    return all.map(([, v]) => toAsrRealignSummary(v));
  } catch {
    return [];
  }
}

export async function deleteAsrRealignEntry(key: string): Promise<void> {
  try {
    await del(key, getStore());
  } catch {
    // no-op
  }
}

export async function clearAsrRealignCache(): Promise<void> {
  try {
    await clear(getStore());
  } catch {
    // no-op
  }
}

export async function getAsrRealignCacheStats(): Promise<{
  entryCount: number;
  totalBytes: number;
}> {
  try {
    const all = await entries<string, YoutubeAsrRealignCacheEntry>(getStore());
    let totalBytes = 0;
    for (const [, v] of all) {
      totalBytes += v.byteSize ?? estimateAsrRealignEntryBytes(v);
    }
    return { entryCount: all.length, totalBytes };
  } catch {
    return { entryCount: 0, totalBytes: 0 };
  }
}
