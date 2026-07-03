/**
 * Tests for pdfProgressStore — persistent PDF translation progress across reloads.
 *
 * Stores a serialized snapshot of the per-page translation state Map keyed by
 * a context hash (pdfUrl + lang + provider + model) so that closing and
 * reopening a translated PDF hydrates instantly instead of re-translating.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  computeContextHash,
  savePdfProgress,
  loadPdfProgress,
  clearPdfProgress,
} from '../pdfProgressStore';
import type { PageTranslations } from '../pdfTranslation';

/** In-memory chrome.storage.local backing store. */
function installStorageMock(initial: Record<string, unknown> = {}): {
  store: Record<string, unknown>;
} {
  const store: Record<string, unknown> = { ...initial };
  global.chrome = {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: store[key] })),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(store, items);
        }),
        remove: vi.fn(async (key: string) => {
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete store[key];
        }),
      },
    },
  } as unknown as typeof chrome;
  return { store };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('computeContextHash', () => {
  it('produces a stable hash for identical inputs', () => {
    const a = computeContextHash({
      pdfUrl: 'https://example.com/doc.pdf',
      sourceLanguage: 'en',
      targetLanguage: 'vi',
      provider: 'custom',
      model: 'gpt-4',
    });
    const b = computeContextHash({
      pdfUrl: 'https://example.com/doc.pdf',
      sourceLanguage: 'en',
      targetLanguage: 'vi',
      provider: 'custom',
      model: 'gpt-4',
    });
    expect(a).toBe(b);
  });

  it('changes when the target language changes', () => {
    const base = {
      pdfUrl: 'https://example.com/doc.pdf',
      sourceLanguage: 'en',
      targetLanguage: 'vi',
      provider: 'custom',
      model: 'gpt-4',
    };
    const a = computeContextHash(base);
    const b = computeContextHash({ ...base, targetLanguage: 'es' });
    expect(a).not.toBe(b);
  });

  it('changes when the model changes', () => {
    const base = {
      pdfUrl: 'https://example.com/doc.pdf',
      sourceLanguage: 'en',
      targetLanguage: 'vi',
      provider: 'custom',
      model: 'gpt-4',
    };
    const a = computeContextHash(base);
    const b = computeContextHash({ ...base, model: 'gpt-3.5' });
    expect(a).not.toBe(b);
  });

  it('changes when the pdfUrl changes', () => {
    const base = {
      pdfUrl: 'https://example.com/doc.pdf',
      sourceLanguage: 'en',
      targetLanguage: 'vi',
      provider: 'custom',
      model: 'gpt-4',
    };
    const a = computeContextHash(base);
    const b = computeContextHash({ ...base, pdfUrl: 'https://example.com/other.pdf' });
    expect(a).not.toBe(b);
  });
});

describe('savePdfProgress / loadPdfProgress round-trip', () => {
  it('round-trips a page-state Map', async () => {
    installStorageMock();
    const hash = computeContextHash({
      pdfUrl: 'https://example.com/doc.pdf',
      sourceLanguage: 'en',
      targetLanguage: 'vi',
      provider: 'custom',
      model: 'gpt-4',
    });
    const pages = new Map<number, PageTranslations>([
      [
        1,
        {
          state: 'translated',
          paragraphs: new Map([['1-0', 'Bản dịch.']]),
          originalParagraphs: [
            { id: '1-0', text: 'Original.', fontSize: 12, isHeading: false, x: 50, y: 50, width: 100, height: 14 },
          ],
        },
      ],
      [2, { state: 'error', paragraphs: new Map(), error: 'timeout' }],
    ]);

    await savePdfProgress(hash, pages);
    const loaded = await loadPdfProgress(hash);

    expect(loaded).not.toBeNull();
    if (loaded) {
      expect(loaded.size).toBe(2);
      expect(loaded.get(1)?.state).toBe('translated');
      expect(loaded.get(1)?.paragraphs.get('1-0')).toBe('Bản dịch.');
      expect(loaded.get(2)?.state).toBe('error');
      expect(loaded.get(2)?.error).toBe('timeout');
    }
  });

  it('preserves originalParagraphs through serialization', async () => {
    installStorageMock();
    const hash = 'test-hash-1';
    const pages = new Map<number, PageTranslations>([
      [
        1,
        {
          state: 'translated',
          paragraphs: new Map([['1-0', 'trans']]),
          originalParagraphs: [
            { id: '1-0', text: 'orig', fontSize: 12, isHeading: true, x: 1, y: 2, width: 3, height: 4 },
          ],
        },
      ],
    ]);
    await savePdfProgress(hash, pages);
    const loaded = await loadPdfProgress(hash);
    expect(loaded?.get(1)?.originalParagraphs).toEqual([
      { id: '1-0', text: 'orig', fontSize: 12, isHeading: true, x: 1, y: 2, width: 3, height: 4 },
    ]);
  });

  it('returns null when no progress is stored for the hash', async () => {
    installStorageMock();
    const loaded = await loadPdfProgress('nonexistent-hash');
    expect(loaded).toBeNull();
  });

  it('filters out non-terminal (translating) pages on save', async () => {
    // Only persist pages in a terminal state (translated/error). In-flight
    // 'translating' pages are incomplete and would mislead on reload.
    installStorageMock();
    const hash = 'test-hash-2';
    const pages = new Map<number, PageTranslations>([
      [1, { state: 'translated', paragraphs: new Map([['1-0', 'x']]) }],
      [2, { state: 'translating', paragraphs: new Map() }],
      [3, { state: 'error', paragraphs: new Map(), error: 'fail' }],
    ]);
    await savePdfProgress(hash, pages);
    const loaded = await loadPdfProgress(hash);
    expect(loaded).not.toBeNull();
    if (loaded) {
      expect(loaded.size).toBe(2);
      expect(loaded.has(1)).toBe(true);
      expect(loaded.has(2)).toBe(false); // translating filtered out
      expect(loaded.has(3)).toBe(true);
    }
  });
});

describe('corruption / shape-mismatch fallback', () => {
  it('returns null when stored data is malformed JSON', async () => {
    const { store } = installStorageMock();
    store['anyllm-pdf-progress'] = { 'bad-hash': 'not-json{' };
    const loaded = await loadPdfProgress('bad-hash');
    expect(loaded).toBeNull();
  });

  it('returns null when stored data has the wrong shape (not a page map)', async () => {
    const { store } = installStorageMock();
    store['anyllm-pdf-progress'] = { 'bad-shape': JSON.stringify({ weird: 'structure' }) };
    const loaded = await loadPdfProgress('bad-shape');
    expect(loaded).toBeNull();
  });

  it('returns null when storage throws', async () => {
    global.chrome = {
      storage: {
        local: {
          get: vi.fn(async () => {
            throw new Error('storage unavailable');
          }),
          set: vi.fn(),
          remove: vi.fn(),
        },
      },
    } as unknown as typeof chrome;
    const loaded = await loadPdfProgress('any-hash');
    expect(loaded).toBeNull();
  });
});

describe('clearPdfProgress', () => {
  it('removes the stored progress for a hash', async () => {
    const { store } = installStorageMock();
    const hash = 'clear-hash';
    const pages = new Map<number, PageTranslations>([
      [1, { state: 'translated', paragraphs: new Map([['1-0', 'x']]) }],
    ]);
    await savePdfProgress(hash, pages);
    expect(store['anyllm-pdf-progress']).toBeDefined();

    await clearPdfProgress(hash);
    const remaining = store['anyllm-pdf-progress'] as Record<string, string> | undefined;
    // The hash entry is removed (other hashes preserved).
    expect(remaining?.[hash]).toBeUndefined();
  });
});
