/**
 * Cross-session web-page translation resume (FR-7).
 *
 * Snapshots the per-URL translation state (piece id + text + translation +
 * status + targetLanguage) to IndexedDB so a page refresh can restore
 * translated content without re-calling the LLM (when the success cache still
 * holds the translations). Entries are keyed by a stable `url + contentHash`
 * namespace, capped at {@link MAX_RESUME_URLS} URLs (LRU), and expire after
 * {@link RESUME_TTL_DAYS} days.
 */

import { createStore, get, set, del, entries } from 'idb-keyval';
import { STORAGE_KEYS } from './constants';

/** Resume entry TTL in days. */
export const RESUME_TTL_DAYS = 7;
/** Max URLs retained (LRU eviction when exceeded). */
export const MAX_RESUME_URLS = 50;
/** Storage namespace prefix for resume snapshots. */
export const RESUME_PREFIX = 'webResume:';

/** Status of a piece within a resume snapshot. */
export type PieceStatus = 'pending' | 'translated' | 'error';

/** A single piece's resume state. */
export interface ResumePiece {
  id: string;
  text: string;
  translatedText?: string;
  status: PieceStatus;
}

/** A full per-URL resume snapshot. */
export interface WebResumeSnapshot {
  url: string;
  contentHash: string;
  targetLanguage: string;
  /** Wall-clock ms when the snapshot was captured. */
  capturedAt: number;
  pieces: ResumePiece[];
}

/** Lazy-initialized IndexedDB store for resume snapshots. */
let store: ReturnType<typeof createStore> | null = null;
function getStore(): ReturnType<typeof createStore> {
  if (!store) {
    store = createStore(`${STORAGE_KEYS.CACHE_DB}-resume`, 'web-resume');
  }
  return store;
}

/**
 * Compute a stable resume key from the page URL + a content hash (derived from
 * the page's translatable text so a content change invalidates the snapshot).
 */
export function computeResumeKey(url: string, contentHash: string): string {
  return `${RESUME_PREFIX}${url}::${contentHash}`;
}

/** Serialize a snapshot for storage. */
export function serializeSnapshot(snapshot: WebResumeSnapshot): string {
  return JSON.stringify(snapshot);
}

/** Deserialize a snapshot; returns null on malformed input. */
export function deserializeSnapshot(raw: string): WebResumeSnapshot | null {
  try {
    const parsed = JSON.parse(raw) as Partial<WebResumeSnapshot>;
    if (
      typeof parsed.url !== 'string' ||
      typeof parsed.contentHash !== 'string' ||
      typeof parsed.targetLanguage !== 'string' ||
      typeof parsed.capturedAt !== 'number' ||
      !Array.isArray(parsed.pieces)
    ) {
      return null;
    }
    return parsed as WebResumeSnapshot;
  } catch {
    return null;
  }
}

/** Returns true if the snapshot is within the TTL window. */
export function isSnapshotFresh(snapshot: WebResumeSnapshot, now = Date.now()): boolean {
  const ttlMs = RESUME_TTL_DAYS * 24 * 60 * 60 * 1000;
  return now - snapshot.capturedAt <= ttlMs;
}

/** Persist a resume snapshot (best-effort — silently fails on storage errors). */
export async function saveSnapshot(snapshot: WebResumeSnapshot): Promise<void> {
  try {
    const key = computeResumeKey(snapshot.url, snapshot.contentHash);
    await set(key, serializeSnapshot(snapshot), getStore());
    // Opportunistic LRU eviction when the URL cap is exceeded.
    await evictResume().catch(() => {});
  } catch {
    // Best-effort — resume is non-critical.
  }
}

/** Load a fresh resume snapshot for the given URL + content hash, or null. */
export async function loadSnapshot(url: string, contentHash: string): Promise<WebResumeSnapshot | null> {
  try {
    const key = computeResumeKey(url, contentHash);
    const raw = await get<string>(key, getStore());
    if (!raw) return null;
    const snapshot = deserializeSnapshot(raw);
    if (!snapshot || !isSnapshotFresh(snapshot)) {
      await del(key, getStore());
      return null;
    }
    return snapshot;
  } catch {
    return null;
  }
}

/**
 * Evict expired entries and LRU-trim to {@link MAX_RESUME_URLS} URLs. Returns
 * the number of entries removed. Best-effort — silently fails on errors.
 */
export async function evictResume(now = Date.now()): Promise<number> {
  try {
    const all = await entries<string, string>(getStore());
    const live: Array<{ key: string; snapshot: WebResumeSnapshot }> = [];
    let evicted = 0;

    for (const [key, raw] of all) {
      if (!key.startsWith(RESUME_PREFIX)) continue;
      const snapshot = deserializeSnapshot(raw);
      if (!snapshot || !isSnapshotFresh(snapshot, now)) {
        await del(key, getStore());
        evicted++;
      } else {
        live.push({ key, snapshot });
      }
    }

    // LRU trim if over the URL cap: drop the oldest by capturedAt.
    if (live.length > MAX_RESUME_URLS) {
      live.sort((a, b) => a.snapshot.capturedAt - b.snapshot.capturedAt);
      const toRemove = live.slice(0, live.length - MAX_RESUME_URLS);
      for (const { key } of toRemove) {
        await del(key, getStore());
        evicted++;
      }
    }
    return evicted;
  } catch {
    return 0;
  }
}

/**
 * Derive a stable content hash from the page's translatable text. Uses the
 * browser's SubtleCrypto SHA-256 (non-cryptographic use — just a stable digest).
 * Returns a hex string. Falls back to a length+char-code sum if crypto is absent.
 */
export async function deriveContentHash(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  try {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // Fallback (non-crypto envs): simple deterministic hash.
    let h = 0;
    for (let i = 0; i < data.length; i++) {
      h = (h * 31 + data[i]) | 0;
    }
    return `fallback-${h.toString(16)}-${data.length.toString(16)}`;
  }
}
