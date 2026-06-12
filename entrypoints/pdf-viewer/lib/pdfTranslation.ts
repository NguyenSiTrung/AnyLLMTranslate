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

  // Build the translate message — same shape content scripts use
  const pieces = uncached.map(({ paragraph }) => ({ id: paragraph.id, text: paragraph.text }));
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

  // Write-through cache for fresh results so subsequent visits are instant
  const fresh = result.results ?? [];
  for (const { id, translatedText } of fresh) {
    const source = uncached.find(({ paragraph }) => paragraph.id === id);
    if (source) {
      await cacheTranslation(source.paragraph.text, translatedText, sourceLanguage, targetLanguage);
    }
  }

  return [...cached, ...fresh];
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
