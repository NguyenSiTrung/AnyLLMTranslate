import type { NamedGlossaryList } from '@/types/config';
import { lockedSourceSet } from '@/lib/namedGlossaryLists';
import { MAX_ROLLING_GLOSSARY } from '@/lib/subtitleGlossary';

export interface NamedGlossarySuggestionRow {
  source: string;
  target: string;
}

/**
 * Accumulate session-storage suggestion maps.
 * - Empty / invalid incoming is a no-op (never wipe existing names).
 * - Non-empty incoming targets overwrite the same source key (latest wins).
 * - Caps total size so DOM deltas cannot grow storage without bound.
 */
export function mergeSuggestionMaps(
  existing: Record<string, string>,
  incoming: Record<string, string>,
  limit = MAX_ROLLING_GLOSSARY,
): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const [source, target] of Object.entries(incoming)) {
    if (typeof source !== 'string' || !source.trim()) continue;
    if (typeof target !== 'string' || !target.trim()) continue;
    cleaned[source] = target.trim();
  }
  if (Object.keys(cleaned).length === 0) {
    return { ...existing };
  }

  const out: Record<string, string> = { ...existing, ...cleaned };
  const entries = Object.entries(out);
  if (entries.length <= limit) return out;

  // Prefer keys already present, then newly added, so growth from deltas
  // does not evict names the user may already have seen.
  const existingKeys = new Set(Object.keys(existing));
  const preferred = entries.filter(([key]) => existingKeys.has(key));
  const rest = entries.filter(([key]) => !existingKeys.has(key));
  return Object.fromEntries([...preferred, ...rest].slice(0, Math.max(0, limit)));
}

export function buildSuggestionRows(
  auto: Record<string, string>,
  activeList: NamedGlossaryList | undefined,
  limit = 30,
): NamedGlossarySuggestionRow[] {
  const lockedSources = lockedSourceSet(activeList);
  return Object.entries(auto)
    .map(([source, target], index) => ({ source, target, index }))
    .filter(({ source }) => !lockedSources.has(source.trim().toLowerCase()))
    .sort(
      (a, b) =>
        a.source.toLocaleLowerCase().localeCompare(b.source.toLocaleLowerCase()) ||
        a.index - b.index,
    )
    .slice(0, Math.max(0, limit))
    .map(({ source, target }) => ({ source, target }));
}
