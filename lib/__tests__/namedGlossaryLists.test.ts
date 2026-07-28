import { describe, it, expect } from 'vitest';
import {
  normalizeSubtitleSiteHost,
  resolveActiveSubtitleListId,
  formatNamedListGlossary,
  pruneSubtitleListBySite,
  setSiteListSelection,
  createNamedList,
  pushEntriesIntoList,
  filterUnlockedProperNouns,
  omitGlobalEntriesCoveredByNamed,
  MAX_NAMED_LIST_ENTRIES,
} from '@/lib/namedGlossaryLists';
import type { NamedGlossaryList } from '@/types/config';

const list = (over: Partial<NamedGlossaryList> = {}): NamedGlossaryList => ({
  id: 'L1',
  name: '三体',
  entries: [{ id: 'e1', source: '叶文洁', target: 'Ye Wenjie' }],
  updatedAt: 1,
  ...over,
});

describe('normalizeSubtitleSiteHost / resolveActiveSubtitleListId', () => {
  it('normalizes hosts and resolves site memory when the list exists', () => {
    expect(normalizeSubtitleSiteHost('WWW.Youku.com.')).toBe('youku.com');
    expect(normalizeSubtitleSiteHost('play.hbomax.com')).toBe('play.hbomax.com');

    const lists = [list()];
    expect(resolveActiveSubtitleListId(lists, { 'youku.com': 'L1' }, 'www.youku.com')).toBe('L1');
    expect(resolveActiveSubtitleListId(lists, { 'youku.com': 'GONE' }, 'youku.com')).toBeNull();
    expect(resolveActiveSubtitleListId(lists, {}, 'youku.com')).toBeNull();
  });
});

describe('formatNamedListGlossary', () => {
  it('formats personal dictionary block and empty list as empty string', () => {
    expect(formatNamedListGlossary(list())).toContain('Personal dictionary "三体"');
    expect(formatNamedListGlossary(list())).toContain('"叶文洁" → "Ye Wenjie"');
    expect(formatNamedListGlossary(list({ entries: [] }))).toBe('');
  });
});

describe('setSiteListSelection / prune', () => {
  it('sets, clears None, and prunes deleted lists', () => {
    let map = setSiteListSelection({}, 'www.youku.com', 'L1');
    expect(map).toEqual({ 'youku.com': 'L1' });
    map = setSiteListSelection(map, 'youku.com', null);
    expect(map).toEqual({});
    expect(pruneSubtitleListBySite({ a: 'L1', b: 'X' }, [list()])).toEqual({ a: 'L1' });
  });
});

describe('createNamedList / pushEntriesIntoList', () => {
  it('creates, pushes, rejects dups and caps', () => {
    const created = createNamedList([], '  CS50  ');
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.list.name).toBe('CS50');

    const pushed = pushEntriesIntoList(created.list, [
      { source: 'MIT', target: 'MIT' },
      { source: 'mit', target: 'dup' },
    ]);
    expect(pushed.ok).toBe(true);
    if (!pushed.ok) return;
    expect(pushed.list.entries.filter((e) => e.source.toLowerCase() === 'mit')).toHaveLength(1);

    const full: NamedGlossaryList = {
      ...created.list,
      entries: Array.from({ length: MAX_NAMED_LIST_ENTRIES }, (_, i) => ({
        id: `id${i}`,
        source: `s${i}`,
        target: `t${i}`,
      })),
    };
    const cap = pushEntriesIntoList(full, [{ source: 'new', target: 'x' }]);
    expect(cap).toEqual({ ok: false, error: 'cap' });
  });
});

describe('lock filters', () => {
  it('drops locked proper nouns and omits covered global entries', () => {
    const locked = new Set(['elsa']);
    expect(filterUnlockedProperNouns({ Elsa: '艾莎', Anna: '安娜' }, locked)).toEqual({
      Anna: '安娜',
    });
    expect(
      omitGlobalEntriesCoveredByNamed(
        [
          { id: '1', source: 'Elsa', target: 'wrong' },
          { id: '2', source: 'Olaf', target: 'Olaf' },
        ],
        locked,
      ).map((e) => e.source),
    ).toEqual(['Olaf']);
  });
});
