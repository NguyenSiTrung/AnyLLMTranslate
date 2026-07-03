/**
 * pdfProgressStore — Persistent PDF translation progress across reloads.
 *
 * Stores a serialized snapshot of the per-page translation state Map keyed by
 * a context hash (pdfUrl + sourceLanguage + targetLanguage + provider + model)
 * so that closing and reopening a translated PDF hydrates instantly from
 * stored state instead of re-translating.
 *
 * Design:
 * - One `chrome.storage.local` key (`anyllm-pdf-progress`) holds an object
 *   mapping context-hash → serialized page-state. Using a single key + nested
 *   object (rather than one key per document) keeps storage usage predictable
 *   and makes bulk invalidation trivial.
 * - Only TERMINAL page states (translated/error) are persisted. In-flight
 *   'translating' pages are incomplete and would mislead on reload.
 * - Hydration is defensive: malformed JSON, wrong shape, or storage failure
 *   all return `null` so the caller falls back to re-translating. Never
 *   throws — a corrupt entry can never break the viewer.
 *
 * The hash components (lang/provider/model) mirror the cache key dimensions
 * in `pdfTranslation.ts` so a context change invalidates BOTH the translation
 * cache and the progress snapshot together.
 */

import { STORAGE_KEYS } from '@/lib/constants';
import type { PageTranslations } from './pdfTranslation';

/** Context that determines whether stored progress is still valid. */
export interface PdfProgressContext {
  pdfUrl: string;
  sourceLanguage: string;
  targetLanguage: string;
  provider: string;
  model: string;
}

/** Storage key under chrome.storage.local. */
const STORAGE_KEY = STORAGE_KEYS.PDF_PROGRESS;

/**
 * Compute a stable hash for the progress context. Any change to pdfUrl, lang,
 * provider, or model produces a different hash so stale progress for a
 * different configuration is never served.
 *
 * Uses a simple FNV-1a-style string hash — not cryptographically secure, but
 * fast, dependency-free, and collision-resistant enough for the small key
 * space of (url × lang × provider × model) tuples a single user produces.
 */
export function computeContextHash(ctx: PdfProgressContext): string {
  const raw = `${ctx.pdfUrl}\u0001${ctx.sourceLanguage}\u0001${ctx.targetLanguage}\u0001${ctx.provider}\u0001${ctx.model}`;
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Unsigned hex
  return (h >>> 0).toString(16);
}

/** Serialized shape of a single page's translation state. */
interface SerializedPage {
  state: 'translated' | 'error';
  /** Paragraph id → translated text. */
  paragraphs: Array<[string, string]>;
  /** Original paragraphs (optional, for bilingual/layout rendering). */
  originalParagraphs?: unknown;
  /** Error message (error state only). */
  error?: string;
}

/** Validate that a parsed value looks like a serialized page-state map. */
function isValidProgressMap(value: unknown): value is Record<string, SerializedPage> {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  for (const v of Object.values(record)) {
    if (typeof v !== 'object' || v === null) return false;
    const page = v as Record<string, unknown>;
    if (page.state !== 'translated' && page.state !== 'error') return false;
    if (!Array.isArray(page.paragraphs)) return false;
  }
  return true;
}

/** Deserialize a serialized page map back into the runtime shape. */
function deserializePages(
  record: Record<string, SerializedPage>,
): Map<number, PageTranslations> {
  const pages = new Map<number, PageTranslations>();
  for (const [key, page] of Object.entries(record)) {
    const pageNumber = Number(key);
    if (!Number.isFinite(pageNumber)) continue;
    pages.set(pageNumber, {
      state: page.state,
      paragraphs: new Map(page.paragraphs),
      originalParagraphs: Array.isArray(page.originalParagraphs)
        ? (page.originalParagraphs as PageTranslations['originalParagraphs'])
        : undefined,
      error: page.error,
    });
  }
  return pages;
}

/** Serialize a runtime page-state map, filtering to terminal states only. */
function serializePages(
  pages: Map<number, PageTranslations>,
): Record<string, SerializedPage> {
  const record: Record<string, SerializedPage> = {};
  for (const [pageNumber, page] of pages) {
    // Only persist terminal states. 'translating' / 'idle' pages are
    // incomplete and would mislead on reload (the user would see stale
    // loading spinners or missing content).
    if (page.state !== 'translated' && page.state !== 'error') continue;
    record[String(pageNumber)] = {
      state: page.state,
      paragraphs: Array.from(page.paragraphs.entries()),
      originalParagraphs: page.originalParagraphs,
      error: page.error,
    };
  }
  return record;
}

/** Read the entire progress store object (or {} when absent/corrupt). */
async function readStore(): Promise<Record<string, string>> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const raw = result[STORAGE_KEY];
    if (typeof raw === 'object' && raw !== null) {
      return raw as Record<string, string>;
    }
    return {};
  } catch {
    return {};
  }
}

/** Write the entire progress store object. */
async function writeStore(record: Record<string, string>): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: record });
  } catch {
    // Storage failures are non-fatal — progress persistence is best-effort.
  }
}

/**
 * Persist the terminal pages of a page-state Map under the given context hash.
 * In-flight (translating/idle) pages are filtered out.
 */
export async function savePdfProgress(
  hash: string,
  pages: Map<number, PageTranslations>,
): Promise<void> {
  const store = await readStore();
  store[hash] = JSON.stringify(serializePages(pages));
  await writeStore(store);
}

/**
 * Load a previously-persisted page-state Map for the given context hash.
 * Returns `null` when nothing is stored, the data is corrupt, or storage
 * fails — callers fall back to re-translating.
 */
export async function loadPdfProgress(
  hash: string,
): Promise<Map<number, PageTranslations> | null> {
  try {
    const store = await readStore();
    const raw = store[hash];
    if (typeof raw !== 'string') return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidProgressMap(parsed)) return null;
    return deserializePages(parsed);
  } catch {
    return null;
  }
}

/**
 * Remove the stored progress for a given context hash (e.g. on full reset).
 * Other documents' progress is preserved.
 */
export async function clearPdfProgress(hash: string): Promise<void> {
  const store = await readStore();
  if (!(hash in store)) return;
  // no-dynamic-delete: rebuild without the cleared hash rather than `delete`.
  const next = Object.fromEntries(Object.entries(store).filter(([k]) => k !== hash));
  await writeStore(next);
}
