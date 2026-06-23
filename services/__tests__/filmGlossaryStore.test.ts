/**
 * Tests for the film-glossary chrome.storage.local seam.
 * Sub-project 3.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loadFilmGlossary,
  saveFilmGlossary,
  FILM_GLOSSARY_STORAGE_KEY,
} from '@/services/filmGlossaryStore';

// Per-test storage backing object.
let backing: Record<string, unknown>;

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: backing[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(backing, items);
      }),
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
});

beforeEach(() => {
  backing = {};
  vi.clearAllMocks();
});

describe('filmGlossaryStore', () => {
  it('uses the documented storage key', () => {
    expect(FILM_GLOSSARY_STORAGE_KEY).toBe('anyllm-film-glossary');
  });

  it('load returns undefined on miss', async () => {
    expect(await loadFilmGlossary('deadbeef')).toBeUndefined();
  });

  it('save then load round-trips', async () => {
    await saveFilmGlossary('abc123', { Dumbledore: 'Phù thủy' });
    expect(await loadFilmGlossary('abc123')).toEqual({ Dumbledore: 'Phù thủy' });
  });

  it('save overwrites an existing key', async () => {
    await saveFilmGlossary('abc123', { Dumbledore: 'Old' });
    await saveFilmGlossary('abc123', { Voldemort: 'New' });
    expect(await loadFilmGlossary('abc123')).toEqual({ Voldemort: 'New' });
  });

  it('persisted map lives under the film-glossary storage key', async () => {
    await saveFilmGlossary('abc123', { Dumbledore: 'Phù thủy' });
    expect(backing[FILM_GLOSSARY_STORAGE_KEY]).toEqual({
      abc123: { Dumbledore: 'Phù thủy' },
    });
  });

  it('load returns undefined (not throw) on storage read error', async () => {
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('storage exploded'),
    );
    await expect(loadFilmGlossary('abc123')).resolves.toBeUndefined();
  });

  it('save does not throw on storage write error', async () => {
    (chrome.storage.local.set as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('quota exceeded'),
    );
    await expect(saveFilmGlossary('abc123', { a: 'b' })).resolves.toBeUndefined();
  });
});
