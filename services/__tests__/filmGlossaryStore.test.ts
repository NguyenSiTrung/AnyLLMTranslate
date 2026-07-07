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
  it('round-trips, overwrites, isolates by key, and persists under the documented storage key', async () => {
    expect(FILM_GLOSSARY_STORAGE_KEY).toBe('anyllm-film-glossary');
    // miss
    expect(await loadFilmGlossary('deadbeef')).toBeUndefined();
    // save then load round-trip
    await saveFilmGlossary('abc123', { Dumbledore: 'Phù thủy' });
    expect(await loadFilmGlossary('abc123')).toEqual({ Dumbledore: 'Phù thủy' });
    // overwrite
    await saveFilmGlossary('abc123', { Voldemort: 'New' });
    expect(await loadFilmGlossary('abc123')).toEqual({ Voldemort: 'New' });
    // persisted under the storage key, namespaced by content id
    expect(backing[FILM_GLOSSARY_STORAGE_KEY]).toEqual({
      abc123: { Voldemort: 'New' },
    });
  });

  it('swallows storage read/write errors (returns undefined instead of throwing)', async () => {
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('storage exploded'),
    );
    await expect(loadFilmGlossary('abc123')).resolves.toBeUndefined();
    (chrome.storage.local.set as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('quota exceeded'),
    );
    await expect(saveFilmGlossary('abc123', { a: 'b' })).resolves.toBeUndefined();
  });
});
