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
});

describe('corruption / shape-mismatch fallback', () => {
  it('returns null when stored data is malformed JSON', async () => {
    const { store } = installStorageMock();
    store['anyllm-pdf-progress'] = { 'bad-hash': 'not-json{' };
    const loaded = await loadPdfProgress('bad-hash');
    expect(loaded).toBeNull();
  });
});
