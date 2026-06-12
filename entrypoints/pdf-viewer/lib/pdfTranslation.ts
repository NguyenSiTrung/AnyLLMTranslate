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

import type { ExtensionMessage, TranslationResultItem } from '@/types/messages';
import { loadSettings } from '@/lib/config';
import { getCachedTranslation, cacheTranslation } from '@/services/cacheManager';
import type { PdfParagraph } from './pdfTextExtraction';

export type PageTranslationState = 'idle' | 'translating' | 'translated' | 'error';

export interface PageTranslations {
  /** Map of paragraph id → translated text. */
  paragraphs: Map<string, string>;
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

/** Single batched LLM request for one or more pages of the document. */
export async function translateParagraphs(
  paragraphs: Array<{ pageNumber: number; paragraph: PdfParagraph }>,
  pdfUrl: string,
): Promise<TranslationResultItem[]> {
  if (paragraphs.length === 0) return [];

  const settings = await loadSettings();
  const sourceLanguage = settings.sourceLanguage;
  const targetLanguage = settings.targetLanguage;

  // Cache check first
  const cached: TranslationResultItem[] = [];
  const uncached: Array<{ pageNumber: number; paragraph: PdfParagraph }> = [];
  for (const item of paragraphs) {
    const cachedText = await getCachedTranslation(
      item.paragraph.text,
      sourceLanguage,
      targetLanguage,
      settings.cacheTTLDays,
    );
    if (cachedText !== null) {
      cached.push({ id: item.paragraph.id, translatedText: cachedText });
    } else {
      uncached.push({ pageNumber: item.pageNumber, paragraph: item.paragraph });
    }
  }

  if (uncached.length === 0) {
    return cached;
  }

  const batches = splitIntoBatches(uncached, settings.maxBatchChars);
  const fresh: TranslationResultItem[] = [];
  for (const batch of batches) {
    fresh.push(...await sendTranslationBatch(batch, pdfUrl, sourceLanguage, targetLanguage));
  }

  // Write-through cache for fresh results so subsequent visits are instant
  const sourceById = new Map(uncached.map((item) => [item.paragraph.id, item.paragraph.text]));
  for (const { id, translatedText } of fresh) {
    const source = sourceById.get(id);
    if (source) {
      await cacheTranslation(source, translatedText, sourceLanguage, targetLanguage);
    }
  }

  const translations = new Map<string, string>();
  for (const result of [...cached, ...fresh]) {
    translations.set(result.id, result.translatedText);
  }
  return paragraphs
    .map(({ paragraph }) => {
      if (!translations.has(paragraph.id)) return null;
      const translatedText = translations.get(paragraph.id);
      return { id: paragraph.id, translatedText: translatedText ?? '' };
    })
    .filter((result): result is TranslationResultItem => result !== null);
}

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
  }
  doc.set(`page-${pageNumber}`, new Map(paragraphs));
}

/** Clear the in-memory cache (e.g. when the user changes languages). */
export function clearMemoryCache(): void {
  memoryCache.clear();
}
