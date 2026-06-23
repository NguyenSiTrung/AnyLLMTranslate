/**
 * Film-glossary storage seam.
 *
 * Persists per-film proper-noun glossaries under chrome.storage.local, keyed
 * by content hash. Separate namespace from the translation cache
 * (anyllm-translate-cache, IndexedDB-backed cacheManager) and from settings/stats:
 * a film's names don't expire and don't participate in LRU eviction.
 *
 * Never throws — every failure degrades to a miss / no-op so the subtitle
 * pipeline still translates.
 *
 * See docs/superpowers/specs/2026-06-23-subtitle-per-film-proper-noun-extraction-design.md.
 */

export const FILM_GLOSSARY_STORAGE_KEY = 'anyllm-film-glossary';

/** Shape persisted: { [contentHash]: { sourceName: targetName, ... } }. */
type FilmGlossaryMap = Record<string, Record<string, string>>;

/** Load a persisted film glossary by content hash.
 *  Returns undefined on miss OR on any storage error (never throws). */
export async function loadFilmGlossary(
  contentHash: string,
): Promise<Record<string, string> | undefined> {
  try {
    const result = await chrome.storage.local.get(FILM_GLOSSARY_STORAGE_KEY);
    const all = result[FILM_GLOSSARY_STORAGE_KEY] as FilmGlossaryMap | undefined;
    return all?.[contentHash];
  } catch {
    return undefined;
  }
}

/** Persist a film glossary keyed by content hash. Overwrites. Never throws. */
export async function saveFilmGlossary(
  contentHash: string,
  glossary: Record<string, string>,
): Promise<void> {
  try {
    const result = await chrome.storage.local.get(FILM_GLOSSARY_STORAGE_KEY);
    const all = (result[FILM_GLOSSARY_STORAGE_KEY] as FilmGlossaryMap | undefined) ?? {};
    all[contentHash] = glossary;
    await chrome.storage.local.set({ [FILM_GLOSSARY_STORAGE_KEY]: all });
  } catch {
    // Degrade silently: no persistence this session. Caller proceeds in-memory.
  }
}
