import type {
  GlossaryEntry,
  NamedGlossaryList,
  SubtitleListBySite,
} from '@/types/config';

export const MAX_NAMED_GLOSSARY_LISTS = 50;
export const MAX_NAMED_LIST_ENTRIES = 200;
export const MAX_NAMED_LIST_NAME_LENGTH = 64;

export function normalizeSubtitleSiteHost(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
}

export function resolveActiveSubtitleListId(
  lists: NamedGlossaryList[],
  bySite: SubtitleListBySite,
  hostname: string,
): string | null {
  const id = bySite[normalizeSubtitleSiteHost(hostname)];
  return id && lists.some((list) => list.id === id) ? id : null;
}

export function getNamedListById(
  lists: NamedGlossaryList[],
  id: string | null | undefined,
): NamedGlossaryList | undefined {
  return id ? lists.find((list) => list.id === id) : undefined;
}

export function formatNamedListGlossary(list: NamedGlossaryList): string {
  if (list.entries.length === 0) return '';
  const lines = list.entries.map((entry) => `- "${entry.source}" → "${entry.target}"`);
  return `Personal dictionary "${list.name}" (always use these translations):\n${lines.join('\n')}`;
}

export function pruneSubtitleListBySite(
  bySite: SubtitleListBySite,
  lists: NamedGlossaryList[],
): SubtitleListBySite {
  const ids = new Set(lists.map((list) => list.id));
  return Object.fromEntries(Object.entries(bySite).filter(([, id]) => ids.has(id)));
}

export function setSiteListSelection(
  bySite: SubtitleListBySite,
  hostname: string,
  listId: string | null,
): SubtitleListBySite {
  const host = normalizeSubtitleSiteHost(hostname);
  if (listId !== null) return { ...bySite, [host]: listId };
  return Object.fromEntries(Object.entries(bySite).filter(([key]) => key !== host));
}

export type PushEntriesResult =
  | { ok: true; list: NamedGlossaryList }
  | { ok: false; error: 'duplicate' | 'cap' | 'empty' | 'invalid-name' };

export function createNamedList(
  lists: NamedGlossaryList[],
  name: string,
  now = Date.now(),
):
  | { ok: true; lists: NamedGlossaryList[]; list: NamedGlossaryList }
  | { ok: false; error: 'cap' | 'invalid-name' } {
  const trimmedName = name.trim();
  if (!trimmedName || trimmedName.length > MAX_NAMED_LIST_NAME_LENGTH) {
    return { ok: false, error: 'invalid-name' };
  }
  if (lists.length >= MAX_NAMED_GLOSSARY_LISTS) return { ok: false, error: 'cap' };

  const list: NamedGlossaryList = {
    id: crypto.randomUUID(),
    name: trimmedName,
    entries: [],
    updatedAt: now,
  };
  return { ok: true, lists: [...lists, list], list };
}

export function pushEntriesIntoList(
  list: NamedGlossaryList,
  incoming: Array<{ source: string; target: string }>,
  now = Date.now(),
): PushEntriesResult {
  const sources = lockedSourceSet(list);
  const additions: GlossaryEntry[] = [];
  for (const candidate of incoming) {
    const source = candidate.source.trim();
    const target = candidate.target.trim();
    const key = source.toLowerCase();
    if (!source || !target || sources.has(key)) continue;
    sources.add(key);
    additions.push({ id: crypto.randomUUID(), source, target });
  }
  if (list.entries.length + additions.length > MAX_NAMED_LIST_ENTRIES) {
    return { ok: false, error: 'cap' };
  }
  if (additions.length === 0) return { ok: true, list };
  return {
    ok: true,
    list: { ...list, entries: [...list.entries, ...additions], updatedAt: now },
  };
}

export function lockedSourceSet(list: NamedGlossaryList | undefined): Set<string> {
  const sources = new Set<string>();
  for (const entry of list?.entries ?? []) {
    const source = entry.source.trim().toLowerCase();
    if (source) sources.add(source);
  }
  return sources;
}

export function entriesToLockMap(
  list: NamedGlossaryList | undefined,
): Map<string, string> {
  const entries = new Map<string, string>();
  for (const entry of list?.entries ?? []) {
    if (entry.source.trim() && entry.target.trim() && !entries.has(entry.source)) {
      entries.set(entry.source, entry.target);
    }
  }
  return entries;
}

export function filterUnlockedProperNouns(
  properNouns: Record<string, string>,
  lockedSources: Set<string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(properNouns).filter(
      ([source]) => !lockedSources.has(source.trim().toLowerCase()),
    ),
  );
}

export function omitGlobalEntriesCoveredByNamed(
  global: GlossaryEntry[],
  lockedSources: Set<string>,
): GlossaryEntry[] {
  return global.filter(
    (entry) => !lockedSources.has(entry.source.trim().toLowerCase()),
  );
}
