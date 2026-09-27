import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FILM_GLOSSARY_STORAGE_KEY,
  SCOPED_FILM_GLOSSARY_STORAGE_KEY,
  loadFilmGlossary,
  loadScopedFilmGlossary,
  saveFilmGlossary,
  saveScopedFilmGlossary,
} from '@/services/filmGlossaryStore';

const mockStorage: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: mockStorage[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
      }),
    },
  },
});

describe('film glossary store', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStorage)) delete mockStorage[key];
  });

  it('round-trips a scoped glossary under its own namespace', async () => {
    await saveScopedFilmGlossary('hash:vi:knobs', { Alice: 'A-lít' });
    expect(await loadScopedFilmGlossary('hash:vi:knobs')).toEqual({ Alice: 'A-lít' });
    // Scoped writes never touch the progressive namespace.
    expect(mockStorage[FILM_GLOSSARY_STORAGE_KEY]).toBeUndefined();
    expect(mockStorage[SCOPED_FILM_GLOSSARY_STORAGE_KEY]).toEqual({
      'hash:vi:knobs': { Alice: 'A-lít' },
    });
  });

  it('misses for an unknown scoped key', async () => {
    expect(await loadScopedFilmGlossary('nope')).toBeUndefined();
  });

  it('leaves the unscoped namespace untouched by scoped writes', async () => {
    await saveFilmGlossary('plain', { Bob: 'Bóp' });
    await saveScopedFilmGlossary('scoped', { Alice: 'A-lít' });
    expect(await loadFilmGlossary('plain')).toEqual({ Bob: 'Bóp' });
    expect(await loadFilmGlossary('scoped')).toBeUndefined();
  });

  it('never throws when storage fails', async () => {
    const get = chrome.storage.local.get as unknown as ReturnType<typeof vi.fn>;
    get.mockRejectedValueOnce(new Error('quota'));
    expect(await loadScopedFilmGlossary('x')).toBeUndefined();
  });
});