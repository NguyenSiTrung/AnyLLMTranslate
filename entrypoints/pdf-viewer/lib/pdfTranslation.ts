/**
 * PDF Translation Coordinator — bridges the pdf-viewer page to the background
 * service worker's translation pipeline.
 *
 * Why a custom coordinator?
 * - The pdf-viewer is a WXT extension page (NOT a content script), so it sends
 *   messages via `chrome.runtime.sendMessage` (popup-style) instead of the
 *   `chrome.tabs.sendMessage` path content scripts use.
 * - We want page-by-page translation requests that are throttled to viewport
 *   visibility, so we batch the visible pages into a single `translate` call
 *   and stream responses back.
 * - Translation results are cached in-memory per document URL to avoid
 *   redundant LLM calls when the user scrolls back and forth.
 */

import type { ExtensionMessage, TranslationResultItem, ClassifyPdfParagraphsResult } from '@/types/messages';
import { loadSettings } from '@/lib/config';
import { cacheTranslation } from '@/services/cacheManager';
import type { PdfParagraph } from './pdfTextExtraction';
import { classifyMathParagraph } from './pdfContentDetect';

export type PageTranslationState = 'idle' | 'translating' | 'translated' | 'error';

export interface PageTranslations {
  /** Map of paragraph id → translated text. */
  paragraphs: Map<string, string>;
  /**
   * Map of paragraph id → content kind (`'prose'` | `'math'` | `'figure'`).
   * Set by `translateParagraphs` so the renderer can reserve layout space for
   * kept-visible blocks (math/figures) without re-deriving kind from text
   * equality. Absent for legacy cached pages — the renderer then falls back
   * to the text-equality predicate (verbatim → dropped, never a spacer).
   */
  paragraphKinds?: Map<string, 'prose' | 'math' | 'figure'>;
  /** Original extracted paragraphs with their coordinate positions. */
  originalParagraphs?: PdfParagraph[];
  /** Aggregate state of the page translation. */
  state: PageTranslationState;
  /** Error message if state === 'error'. */
  error?: string;
}

export type PageTranslationsListener = (pageNumber: number, page: PageTranslations) => void;

/** Cache key for in-memory cached page translations. */
function cacheKeyFor(url: string, sourceLanguage: string, targetLanguage: string): string {
  return `pdf:${url}::${sourceLanguage}→${targetLanguage}`;
}

function splitIntoBatches<T extends { paragraph: PdfParagraph }>(
  items: T[],
  maxBatchChars: number,
): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let currentChars = 0;
  const limit = Math.max(1, maxBatchChars);

  for (const item of items) {
    const length = item.paragraph.text.length;
    if (current.length > 0 && currentChars + length > limit) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(item);
    currentChars += length;
  }

  if (current.length > 0) {
    batches.push(current);
  }

  return batches;
}

async function sendTranslationBatch(
  batch: Array<{ pageNumber: number; paragraph: PdfParagraph }>,
  pdfUrl: string,
  sourceLanguage: string,
  targetLanguage: string,
): Promise<TranslationResultItem[]> {
  const pieces = batch.map(({ paragraph }) => ({ id: paragraph.id, text: paragraph.text }));
  const message: ExtensionMessage = {
    action: 'translate',
    pieces,
    sourceLanguage,
    targetLanguage,
    pageContext: {
      title: pdfUrl,
      description: 'PDF document translation',
      domain: 'pdf',
      category: 'document',
    },
  };

  const response = await chrome.runtime.sendMessage(message);
  if (!response || typeof response !== 'object') {
    throw new Error('No response from background service worker');
  }
  const result = response as { success: boolean; results?: TranslationResultItem[]; error?: string };
  if (!result.success) {
    throw new Error(result.error ?? 'Translation failed');
  }

  return result.results ?? [];
}

/**
 * Send non-math paragraphs to the background LLM classifier and return the
 * prose/figure labels. Returns null on any failure so the caller can
 * fail-open (treat everything as prose).
 */
async function classifyParagraphs(
  paragraphs: Array<{ id: string; text: string }>,
): Promise<Record<string, 'prose' | 'figure'> | null> {
  if (paragraphs.length === 0) return {};
  const message: ExtensionMessage = {
    action: 'CLASSIFY_PDF_PARAGRAPHS',
    paragraphs,
  };
  try {
    const response = await chrome.runtime.sendMessage(message);
    const result = response as ClassifyPdfParagraphsResult;
    if (!result || !result.success || !result.labels) {
      return null;
    }
    return result.labels;
  } catch {
    return null;
  }
}

/** Single batched LLM request for one or more pages of the document. */
export async function translateParagraphs(
  paragraphs: Array<{ pageNumber: number; paragraph: PdfParagraph }>,
  pdfUrl: string,
): Promise<TranslationResultItem[]> {
  if (paragraphs.length === 0) return [];

  const settings = await loadSettings();
  const sourceLanguage = settings.sourceLanguage;
  const targetLanguage = settings.targetLanguage;

  // 1. Rule-based math split (deterministic, free, immune to network failure).
  const mathItems: Array<{ pageNumber: number; paragraph: PdfParagraph }> = [];
  const restItems: Array<{ pageNumber: number; paragraph: PdfParagraph }> = [];
  for (const item of paragraphs) {
    if (classifyMathParagraph(item.paragraph.text) === 'math') {
      mathItems.push(item);
    } else {
      restItems.push(item);
    }
  }

  // 2. LLM classification of the remaining paragraphs into prose vs figure.
  //    Failure → null → fail-open: translate everything in `restItems`.
  const labels = await classifyParagraphs(
    restItems.map((item) => ({ id: item.paragraph.id, text: item.paragraph.text })),
  );

  // Warn (but still fail-open to prose) when the classifier omits some ids —
  // matches the project's existing pattern in parseTranslationResponse.
  if (labels) {
    const missingIds = restItems
      .map((item) => item.paragraph.id)
      .filter((id) => labels[id] === undefined);
    if (missingIds.length > 0) {
      console.warn('AnyLLMTranslate: Missing paragraph ids in classification response', missingIds);
    }
  }

  const proseItems = restItems.filter((item) => labels?.[item.paragraph.id] !== 'figure');

  // 3. Translate only the prose subset via the existing batched path.
  const batches = splitIntoBatches(proseItems, settings.maxBatchChars);
  const batchResults = await Promise.all(
    batches.map((batch) => sendTranslationBatch(batch, pdfUrl, sourceLanguage, targetLanguage)),
  );
  const translatedResults = batchResults.flat().map((r) => ({ ...r, kind: 'prose' as const }));

  // 4. Merge: prose → LLM output (kind 'prose'); figure & math → verbatim source
  //    text (kind 'figure'/'math'). Propagating the kind lets the renderer
  //    reserve layout space for kept-visible blocks without guessing from
  //    text equality — see PdfTranslationPane LayoutOverlay.
  const results: TranslationResultItem[] = [...translatedResults];
  const sourceById = new Map<string, string>();
  for (const { paragraph } of proseItems) {
    sourceById.set(paragraph.id, paragraph.text);
  }
  for (const { paragraph } of restItems) {
    if (labels?.[paragraph.id] === 'figure') {
      results.push({ id: paragraph.id, translatedText: paragraph.text, kind: 'figure' });
      sourceById.set(paragraph.id, paragraph.text);
    }
  }
  for (const { paragraph } of mathItems) {
    results.push({ id: paragraph.id, translatedText: paragraph.text, kind: 'math' });
    sourceById.set(paragraph.id, paragraph.text);
  }

  // 5. Write-through cache for every result (including the source→source ones).
  for (const { id, translatedText } of results) {
    const source = sourceById.get(id);
    if (source) {
      await cacheTranslation(source, translatedText, sourceLanguage, targetLanguage);
    }
  }

  return results;
}

/** Maximum number of document entries kept in the in-memory cache.
 *  When exceeded, the oldest entry (FIFO by insertion order) is evicted. */
export const MAX_CACHED_DOCUMENTS = 10;

/** In-memory cache so re-translation of the same page is instant.
 *  Key: `cacheKeyFor(pdfUrl, source, target)` -> map of `page-N` -> paragraph translations. */
const memoryCache = new Map<string, Map<string, Map<string, string>>>();

/** Look up in-memory cached translations for a page. */
export function getMemoryCachedPage(
  pdfUrl: string,
  pageNumber: number,
  sourceLanguage: string,
  targetLanguage: string,
): Map<string, string> | null {
  const doc = memoryCache.get(cacheKeyFor(pdfUrl, sourceLanguage, targetLanguage));
  if (!doc) return null;
  const page = doc.get(`page-${pageNumber}`);
  if (!page) return null;
  return new Map(page);
}

/** Store a page's translations in the in-memory cache. */
export function setMemoryCachedPage(
  pdfUrl: string,
  pageNumber: number,
  paragraphs: Map<string, string>,
  sourceLanguage: string,
  targetLanguage: string,
): void {
  const key = cacheKeyFor(pdfUrl, sourceLanguage, targetLanguage);
  let doc = memoryCache.get(key);
  if (!doc) {
    doc = new Map<string, Map<string, string>>();
    memoryCache.set(key, doc);
    // Evict oldest document if over limit
    if (memoryCache.size > MAX_CACHED_DOCUMENTS) {
      const oldest = memoryCache.keys().next().value;
      if (oldest !== undefined) {
        memoryCache.delete(oldest);
      }
    }
  }
  doc.set(`page-${pageNumber}`, new Map(paragraphs));
}

/** Clear the in-memory cache (e.g. when the user changes languages). */
export function clearMemoryCache(): void {
  memoryCache.clear();
}
