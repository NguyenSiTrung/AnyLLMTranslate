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
    const action = (message as { action: string }).action;
    if (action === 'CLASSIFY_PDF_PARAGRAPHS') {
      // Default: classify everything as prose. Individual tests override this.
      const pieces = (message as { paragraphs: Array<{ id: string }> }).paragraphs;
      return {
        success: true,
        labels: Object.fromEntries(pieces.map(({ id }) => [id, 'prose'])),
      };
    }
    // translate
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

    // Only the 'translate' calls count toward batching; the coordinator also
    // issues one CLASSIFY_PDF_PARAGRAPHS call before translating.
    const translateMessages = vi.mocked(chrome.runtime.sendMessage).mock.calls
      .map(([message]) => message as unknown as { action: string; pieces: Array<{ id: string; text: string }> })
      .filter((message) => message.action === 'translate');
    expect(translateMessages).toHaveLength(2);
    expect(translateMessages.map((message) => message.pieces.map(({ id }) => id))).toEqual([
      ['1-0', '1-1'],
      ['1-2'],
    ]);
    for (const message of translateMessages) {
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
    // The coordinator issues one CLASSIFY_PDF_PARAGRAPHS call plus one 'translate'
    // call. Assert specifically that exactly one translate call happened (the
    // intent of this test is the cache-lookup invariant, not the call count).
    const translateMessages = vi.mocked(chrome.runtime.sendMessage).mock.calls
      .map(([message]) => message as unknown as { action: string })
      .filter((message) => message.action === 'translate');
    expect(translateMessages).toHaveLength(1);
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

  it('keeps math paragraphs verbatim and does not send them to the translator', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message: unknown) => {
      const action = (message as { action: string }).action;
      if (action === 'CLASSIFY_PDF_PARAGRAPHS') {
        const pieces = (message as { paragraphs: Array<{ id: string }> }).paragraphs;
        return {
          success: true,
          labels: Object.fromEntries(pieces.map(({ id }) => [id, 'prose'])),
        };
      }
      const pieces = (message as { pieces: Array<{ id: string }> }).pieces;
      return {
        success: true,
        results: pieces.map(({ id }) => ({ id, translatedText: `translated-${id}` })),
      };
    });

    const results = await translateParagraphs(
      [
        // Pure math — should be kept verbatim, never sent to translator
        { pageNumber: 1, paragraph: { id: '1-0', text: 'f(x) = x² + 2x + 1', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
        // Prose — should be translated
        { pageNumber: 1, paragraph: { id: '1-1', text: 'This is a normal sentence about the model.', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
      ],
      'https://example.com/a.pdf',
    );

    // Math paragraph: translatedText equals its original source text
    const mathResult = results.find((r) => r.id === '1-0');
    expect(mathResult?.translatedText).toBe('f(x) = x² + 2x + 1');

    // Prose paragraph: translated normally
    const proseResult = results.find((r) => r.id === '1-1');
    expect(proseResult?.translatedText).toBe('translated-1-1');

    // The translator must NOT have received the math paragraph. Inspect every
    // sendMessage call whose action is 'translate' and collect their piece ids.
    const calls = vi.mocked(chrome.runtime.sendMessage).mock.calls;
    const translateCalls = calls.filter(
      ([msg]) => (msg as unknown as { action: string }).action === 'translate',
    );
    const translatedIds = translateCalls.flatMap(([msg]) =>
      (msg as unknown as { pieces: Array<{ id: string }> }).pieces.map((p) => p.id),
    );
    expect(translatedIds).not.toContain('1-0');
    expect(translatedIds).toContain('1-1');
  });

  it('keeps figure-labeled paragraphs verbatim', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message: unknown) => {
      const action = (message as { action: string }).action;
      if (action === 'CLASSIFY_PDF_PARAGRAPHS') {
        // Mark the short label as a figure axis label
        return { success: true, labels: { '1-0': 'figure', '1-1': 'prose' } };
      }
      const pieces = (message as { pieces: Array<{ id: string }> }).pieces;
      return {
        success: true,
        results: pieces.map(({ id }) => ({ id, translatedText: `translated-${id}` })),
      };
    });

    const results = await translateParagraphs(
      [
        { pageNumber: 1, paragraph: { id: '1-0', text: 'Accuracy', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
        { pageNumber: 1, paragraph: { id: '1-1', text: 'The model achieves high accuracy.', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
      ],
      'https://example.com/a.pdf',
    );

    expect(results.find((r) => r.id === '1-0')?.translatedText).toBe('Accuracy');
    expect(results.find((r) => r.id === '1-1')?.translatedText).toBe('translated-1-1');
  });

  it('fail-opens to translating all non-math when classification fails', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message: unknown) => {
      const action = (message as { action: string }).action;
      if (action === 'CLASSIFY_PDF_PARAGRAPHS') {
        return { success: false, error: 'network down' };
      }
      const pieces = (message as { pieces: Array<{ id: string }> }).pieces;
      return {
        success: true,
        results: pieces.map(({ id }) => ({ id, translatedText: `translated-${id}` })),
      };
    });

    const results = await translateParagraphs(
      [
        // Math still protected by rules, even though LLM is down
        { pageNumber: 1, paragraph: { id: '1-0', text: 'f(x) = x²', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
        { pageNumber: 1, paragraph: { id: '1-1', text: 'Normal prose sentence here.', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
      ],
      'https://example.com/a.pdf',
    );

    // Math: rule-based protection intact
    expect(results.find((r) => r.id === '1-0')?.translatedText).toBe('f(x) = x²');
    // Prose: translated despite classification failure (fail-open)
    expect(results.find((r) => r.id === '1-1')?.translatedText).toBe('translated-1-1');
  });

  it('defaults to prose when the classifier omits an id', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message: unknown) => {
      const action = (message as { action: string }).action;
      if (action === 'CLASSIFY_PDF_PARAGRAPHS') {
        // Classifier returns labels for only one of two paragraphs
        return { success: true, labels: { '1-0': 'prose' } };
      }
      const pieces = (message as { pieces: Array<{ id: string }> }).pieces;
      return {
        success: true,
        results: pieces.map(({ id }) => ({ id, translatedText: `translated-${id}` })),
      };
    });

    const results = await translateParagraphs(
      [
        { pageNumber: 1, paragraph: { id: '1-0', text: 'First paragraph of prose.', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
        { pageNumber: 1, paragraph: { id: '1-1', text: 'Second paragraph of prose.', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
      ],
      'https://example.com/a.pdf',
    );

    // Missing label → defaults to prose → translated
    expect(results.find((r) => r.id === '1-1')?.translatedText).toBe('translated-1-1');
  });

  it('skips the classification call entirely when all paragraphs are math', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message: unknown) => {
      const action = (message as { action: string }).action;
      if (action === 'CLASSIFY_PDF_PARAGRAPHS') {
        throw new Error('classification should not have been called');
      }
      const pieces = (message as { pieces: Array<{ id: string }> }).pieces;
      return {
        success: true,
        results: pieces.map(({ id }) => ({ id, translatedText: `translated-${id}` })),
      };
    });

    const results = await translateParagraphs(
      [
        { pageNumber: 1, paragraph: { id: '1-0', text: 'f(x) = x²', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
        { pageNumber: 1, paragraph: { id: '1-1', text: 'α + β = γ', fontSize: 12, isHeading: false, x: 0, y: 0, width: 0, height: 0 } },
      ],
      'https://example.com/a.pdf',
    );

    // Both kept verbatim
    expect(results.find((r) => r.id === '1-0')?.translatedText).toBe('f(x) = x²');
    expect(results.find((r) => r.id === '1-1')?.translatedText).toBe('α + β = γ');

    // No classification call was made
    const classifyCalls = vi.mocked(chrome.runtime.sendMessage).mock.calls.filter(
      ([msg]) => (msg as unknown as { action: string }).action === 'CLASSIFY_PDF_PARAGRAPHS',
    );
    expect(classifyCalls).toHaveLength(0);
  });
});
