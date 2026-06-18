/**
 * Tests for the PDF view-mode storage helper.
 *
 * Verifies: default 'split' when absent; round-trip save/load; fallback to
 * 'split' for unknown strings, non-string values, and storage errors.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadPdfViewMode, savePdfViewMode } from '../pdfViewMode';
import { STORAGE_KEYS } from '@/lib/constants';

/** In-memory chrome.storage.local backing store. */
function installStorageMock(initial: Record<string, unknown> = {}): {
  store: Record<string, unknown>;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
} {
  const store: Record<string, unknown> = { ...initial };
  const get = vi.fn(async (key: string) => ({ [key]: store[key] }));
  const set = vi.fn(async (items: Record<string, unknown>) => {
    Object.assign(store, items);
  });
  global.chrome = {
    storage: { local: { get, set } },
  } as unknown as typeof chrome;
  return { store, get, set };
}

describe('loadPdfViewMode', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns "split" when the key is absent', async () => {
    installStorageMock();
    expect(await loadPdfViewMode()).toBe('split');
  });

  it('returns the stored value when present', async () => {
    installStorageMock({ [STORAGE_KEYS.PDF_VIEW_MODE]: 'translation-only' });
    expect(await loadPdfViewMode()).toBe('translation-only');
  });

  it('falls back to "split" for an unknown string', async () => {
    installStorageMock({ [STORAGE_KEYS.PDF_VIEW_MODE]: 'banana' });
    expect(await loadPdfViewMode()).toBe('split');
  });

  it('falls back to "split" for a non-string value', async () => {
    installStorageMock({ [STORAGE_KEYS.PDF_VIEW_MODE]: 42 });
    expect(await loadPdfViewMode()).toBe('split');
  });

  it('falls back to "split" when storage throws', async () => {
    const store: Record<string, unknown> = {};
    global.chrome = {
      storage: {
        local: {
          get: vi.fn(async () => {
            throw new Error('storage unavailable');
          }),
          set: vi.fn(async (items: Record<string, unknown>) => {
            Object.assign(store, items);
          }),
        },
      },
    } as unknown as typeof chrome;
    expect(await loadPdfViewMode()).toBe('split');
  });
});

describe('savePdfViewMode', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('writes the value under STORAGE_KEYS.PDF_VIEW_MODE', async () => {
    const { store, set } = installStorageMock();
    await savePdfViewMode('translation-only');
    expect(set).toHaveBeenCalledWith({ [STORAGE_KEYS.PDF_VIEW_MODE]: 'translation-only' });
    expect(store[STORAGE_KEYS.PDF_VIEW_MODE]).toBe('translation-only');
  });

  it('round-trips through loadPdfViewMode', async () => {
    installStorageMock();
    await savePdfViewMode('translation-only');
    expect(await loadPdfViewMode()).toBe('translation-only');
    await savePdfViewMode('split');
    expect(await loadPdfViewMode()).toBe('split');
  });
});
