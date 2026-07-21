import type { NamedGlossaryList } from '@/types/config';
import { lockedSourceSet } from '@/lib/namedGlossaryLists';

export interface NamedGlossarySuggestionRow {
  source: string;
  target: string;
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
