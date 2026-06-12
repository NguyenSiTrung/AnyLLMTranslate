/**
 * Tests for the in-memory PDF page cache helpers.
 *
 * Validates the simple get/set/clear lifecycle. The cache is module-scoped,
 * so the `clearMemoryCache()` call in `beforeEach` is essential.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ExtensionSettings } from '@/types/config';
import { DEFAULT_SETTINGS } from '@/types/config';
import {
  getMemoryCachedPage,
  setMemoryCachedPage,
  clearMemoryCache,
  translateParagraphs,
  MAX_CACHED_DOCUMENTS,
} from '../pdfTranslation';
import { loadSettings } from '@/lib/config';
import { cacheTranslation } from '@/services/cacheManager';

vi.mock('@/lib/config', () => ({
  loadSettings: vi.fn(),
}));

vi.mock('@/services/cacheManager', () => ({
  cacheTranslation: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  clearMemoryCache();
  vi.mocked(loadSettings).mockResolvedValue({
    ...DEFAULT_SETTINGS,
    sourceLanguage: 'en',
    targetLanguage: 'vi',
    maxBatchChars: 16,
  } as ExtensionSettings);
  vi.mocked(cacheTranslation).mockResolvedValue(undefined);
  vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message: unknown) => {
    const pieces = (message as { pieces: Array<{ id: string }> }).pieces;
    return {
      success: true,
      results: pieces.map(({ id }) => ({ id, translatedText: `translated-${id}` })),
    };
  });
});

describe('pdfTranslation memory cache', () => {
  it('returns null when nothing is cached', () => {
    expect(getMemoryCachedPage('https://example.com/a.pdf', 1, 'en', 'vi')).toBeNull();
  });

  it('round-trips a page translation through the cache', () => {
    const map = new Map<string, string>([
      ['1-0', 'Xin chào'],
      ['1-1', 'Thế giới'],
    ]);
    setMemoryCachedPage('https://example.com/a.pdf', 1, map, 'en', 'vi');
    const cached = getMemoryCachedPage('https://example.com/a.pdf', 1, 'en', 'vi');
    expect(cached).not.toBeNull();
    expect(cached?.get('1-0')).toBe('Xin chào');
    expect(cached?.get('1-1')).toBe('Thế giới');
  });

  it('isolates pages from each other', () => {
    const page1 = new Map<string, string>([['1-0', 'Page one']]);
    const page2 = new Map<string, string>([['2-0', 'Page two']]);
    setMemoryCachedPage('https://example.com/a.pdf', 1, page1, 'en', 'vi');
    setMemoryCachedPage('https://example.com/a.pdf', 2, page2, 'en', 'vi');
    expect(getMemoryCachedPage('https://example.com/a.pdf', 1, 'en', 'vi')?.get('1-0')).toBe('Page one');
    expect(getMemoryCachedPage('https://example.com/a.pdf', 2, 'en', 'vi')?.get('2-0')).toBe('Page two');
  });

  it('isolates caches by (url, source, target) tuple', () => {
    const map = new Map<string, string>([['1-0', 'Hola']]);
    setMemoryCachedPage('https://example.com/a.pdf', 1, map, 'en', 'es');
    setMemoryCachedPage('https://example.com/a.pdf', 1, map, 'en', 'vi');
    expect(getMemoryCachedPage('https://example.com/a.pdf', 1, 'en', 'es')?.get('1-0')).toBe('Hola');
    expect(getMemoryCachedPage('https://example.com/a.pdf', 1, 'en', 'vi')?.get('1-0')).toBe('Hola');
    // Different document URLs are independent
    setMemoryCachedPage('https://example.com/b.pdf', 1, map, 'en', 'es');
    expect(getMemoryCachedPage('https://example.com/b.pdf', 1, 'en', 'es')).not.toBeNull();
  });

  it('returns a copy, not the original map reference', () => {
    const map = new Map<string, string>([['1-0', 'Original']]);
    setMemoryCachedPage('https://example.com/a.pdf', 1, map, 'en', 'vi');
    const cached = getMemoryCachedPage('https://example.com/a.pdf', 1, 'en', 'vi');
    // Mutating the cached map should not affect the originally stored map
    cached?.set('1-0', 'Mutated');
    expect(map.get('1-0')).toBe('Original');
  });

  it('clearMemoryCache empties every entry', () => {
    setMemoryCachedPage('https://example.com/a.pdf', 1, new Map([['1-0', 'X']]), 'en', 'vi');
    setMemoryCachedPage('https://example.com/b.pdf', 1, new Map([['1-0', 'Y']]), 'en', 'vi');
    clearMemoryCache();
    expect(getMemoryCachedPage('https://example.com/a.pdf', 1, 'en', 'vi')).toBeNull();
    expect(getMemoryCachedPage('https://example.com/b.pdf', 1, 'en', 'vi')).toBeNull();
  });

  it('splits uncached paragraphs into maxBatchChars-limited runtime messages', async () => {
    const results = await translateParagraphs(
      [
        { pageNumber: 1, paragraph: { id: '1-0', text: 'aaaaaaaa', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
        { pageNumber: 1, paragraph: { id: '1-1', text: 'bbbbbbbb', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
        { pageNumber: 1, paragraph: { id: '1-2', text: 'cccccccc', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
      ],
      'https://example.com/a.pdf',
    );

    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
    const messages = vi.mocked(chrome.runtime.sendMessage).mock.calls.map(([message]) => message as unknown as { pieces: Array<{ id: string; text: string }> });
    expect(messages.map((message) => message.pieces.map(({ id }) => id))).toEqual([
      ['1-0', '1-1'],
      ['1-2'],
    ]);
    for (const message of messages) {
      const chars = message.pieces.reduce((sum, piece) => sum + piece.text.length, 0);
      expect(chars).toBeLessThanOrEqual(16);
    }
    expect(results.map(({ id }) => id)).toEqual(['1-0', '1-1', '1-2']);
  });

  it('does not perform viewer-side IndexedDB cache lookup (background handles it)', async () => {
    await translateParagraphs(
      [
        { pageNumber: 1, paragraph: { id: '1-0', text: 'hello', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
      ],
      'https://example.com/a.pdf',
    );

    // Only cacheTranslation (write-through) should be called, never getCachedTranslation.
    // The mock factory only defines cacheTranslation — if getCachedTranslation were
    // still imported by pdfTranslation.ts, Vitest would throw at module load time.
    expect(cacheTranslation).toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it(`evicts the oldest document when cache exceeds MAX_CACHED_DOCUMENTS (${MAX_CACHED_DOCUMENTS})`, () => {
    // Fill cache to exactly the limit
    for (let i = 0; i < MAX_CACHED_DOCUMENTS; i++) {
      setMemoryCachedPage(`https://example.com/doc-${i}.pdf`, 1, new Map([['p', `text-${i}`]]), 'en', 'vi');
    }

    // All 10 should be present
    for (let i = 0; i < MAX_CACHED_DOCUMENTS; i++) {
      expect(getMemoryCachedPage(`https://example.com/doc-${i}.pdf`, 1, 'en', 'vi')).not.toBeNull();
    }

    // Add one more — this should evict doc-0 (the oldest)
    setMemoryCachedPage('https://example.com/doc-new.pdf', 1, new Map([['p', 'new']]), 'en', 'vi');

    // doc-0 should be evicted
    expect(getMemoryCachedPage('https://example.com/doc-0.pdf', 1, 'en', 'vi')).toBeNull();

    // doc-1 through doc-9 should still be present
    for (let i = 1; i < MAX_CACHED_DOCUMENTS; i++) {
      expect(getMemoryCachedPage(`https://example.com/doc-${i}.pdf`, 1, 'en', 'vi')).not.toBeNull();
    }

    // The new entry should be present
    expect(getMemoryCachedPage('https://example.com/doc-new.pdf', 1, 'en', 'vi')?.get('p')).toBe('new');
  });
});
