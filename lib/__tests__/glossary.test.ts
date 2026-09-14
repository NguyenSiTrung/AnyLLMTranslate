import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeSubtitleSiteHost, resolveActiveSubtitleListId, formatNamedListGlossary, pruneSubtitleListBySite, setSiteListSelection, createNamedList, pushEntriesIntoList, filterUnlockedProperNouns, omitGlobalEntriesCoveredByNamed, MAX_NAMED_LIST_ENTRIES } from '@/lib/namedGlossaryLists';
import type { NamedGlossaryList, GlossaryEntry } from '@/types/config';
import { buildSuggestionRows, mergeSuggestionMaps } from '@/lib/namedGlossarySuggestions';
import { formatGlossary, parseGlossaryCSV, exportGlossaryCSV, exportGlossaryJSON, parseGlossaryJSON, checkGlossaryMismatches, findDuplicateSource, filterGlossaryEntries, sortMismatchesFirst } from '@/lib/glossary';
import { GLOSSARY_CSV_TEMPLATE, GLOSSARY_CSV_TEMPLATE_FILENAME, GLOSSARY_JSON_TEMPLATE, GLOSSARY_JSON_TEMPLATE_FILENAME, downloadGlossaryTemplate } from '@/lib/glossaryImportTemplates';

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

const activeList: NamedGlossaryList = {
  id: 'characters',
  name: 'Characters',
  entries: [{ id: '1', source: 'Alice', target: '爱丽丝' }],
  updatedAt: 1,
};

describe('named glossary suggestions', () => {
  it('merges maps and builds filtered, sorted, capped suggestion rows', () => {
    expect(mergeSuggestionMaps({ Elsa: '艾莎' }, {})).toEqual({ Elsa: '艾莎' });
    expect(mergeSuggestionMaps({ Elsa: '艾莎' }, { '': 'x', Bob: '' })).toEqual({ Elsa: '艾莎' });
    expect(
      mergeSuggestionMaps({ Elsa: '艾莎' }, { Anna: '安娜', Elsa: '艾尔莎' }),
    ).toEqual({ Elsa: '艾尔莎', Anna: '安娜' });

    const existing = { A: '1', B: '2' };
    const incoming = { C: '3', D: '4' };
    expect(mergeSuggestionMaps(existing, incoming, 3)).toEqual({ A: '1', B: '2', C: '3' });
    expect(buildSuggestionRows({ ALICE: '艾丽斯', Bob: '鲍勃' }, activeList)).toEqual([
      { source: 'Bob', target: '鲍勃' },
    ]);

    const auto = { zoe: '佐伊', Amy: '艾米', amy: '阿米' };

    expect(buildSuggestionRows(auto, undefined)).toEqual([
      { source: 'Amy', target: '艾米' },
      { source: 'amy', target: '阿米' },
      { source: 'zoe', target: '佐伊' },
    ]);
    expect(Object.keys(auto)).toEqual(['zoe', 'Amy', 'amy']);

    const capped = Object.fromEntries(
      Array.from({ length: 35 }, (_, index) => [`Name${String(index).padStart(2, '0')}`, `${index}`]),
    );

    expect(buildSuggestionRows(capped, undefined)).toHaveLength(30);
    expect(buildSuggestionRows(capped, undefined, 2)).toEqual([
      { source: 'Name00', target: '0' },
      { source: 'Name01', target: '1' },
    ]);
  });
});

/**
 * Tests for glossary utilities.
 */


const sampleEntries: GlossaryEntry[] = [
  { id: '1', source: 'React', target: 'React' },
  { id: '2', source: 'machine learning', target: 'học máy' },
  { id: '3', source: 'API', target: 'API' },
];

describe('glossary utilities', () => {
  it('formats, CSV/JSON round-trips, validates shapes, and checks mismatches/duplicates/filter/sort', () => {
    expect(formatGlossary([])).toBe('');
    const formatted = formatGlossary(sampleEntries);
    expect(formatted).toContain('Translation Glossary');
    expect(formatted).toContain('"machine learning" → "học máy"');

    expect(parseGlossaryCSV('source,target\nReact,React\nAPI,API')).toHaveLength(2);
    expect(parseGlossaryCSV('"hello, world","xin chào, thế giới"')[0]!.source).toBe('hello, world');
    expect(parseGlossaryCSV('source,target\n\nReact,React\n\n')).toHaveLength(1);
    expect(parseGlossaryCSV('source,target\nonlyOneColumn')).toHaveLength(0);

    const csv = exportGlossaryCSV(sampleEntries);
    expect(csv.split('\n')[0]).toBe('source,target');
    expect(
      exportGlossaryCSV([{ id: '1', source: 'hello, world', target: 'quote "test"' }]),
    ).toContain('"hello, world"');
    const parsedCsv = parseGlossaryCSV(csv);
    expect(parsedCsv).toHaveLength(sampleEntries.length);
    expect(parsedCsv[1]!.target).toBe('học máy');

    const exported = JSON.parse(exportGlossaryJSON(sampleEntries));
    expect(exported[0]).not.toHaveProperty('id');
    expect(parseGlossaryJSON(JSON.stringify(sampleEntries))).toHaveLength(3);
    expect(() => parseGlossaryJSON('{"key": "value"}')).toThrow('expected an array');
    expect(() => parseGlossaryJSON('[{"source": "hello"}]')).toThrow(
      'must have source and target',
    );
    expect(
      parseGlossaryJSON('[{"id": "custom-id", "source": "hello", "target": "xin chào"}]')[0]!.id,
    ).not.toBe('custom-id');

    // mismatches, duplicates, filter, and sort helpers
    const entries: GlossaryEntry[] = [
      { id: '1', source: 'machine learning', target: 'học máy' },
      { id: '2', source: 'API', target: 'API' },
    ];
    const missed = checkGlossaryMismatches(
      entries,
      'We use machine learning and API in our system.',
      'Chúng tôi sử dụng ML và API trong hệ thống.',
    );
    expect(missed.map((e) => e.id)).toContain('1');
    expect(missed.map((e) => e.id)).not.toContain('2');
    expect(
      checkGlossaryMismatches(entries, 'machine learning', 'HỌC MÁY is mentioned here.'),
    ).toHaveLength(0);
    expect(checkGlossaryMismatches([], 'machine learning', 'hello')).toHaveLength(0);

    const dups: GlossaryEntry[] = [
      { id: '1', source: 'React', target: 'React' },
      { id: '2', source: 'API', target: 'API' },
    ];
    expect(findDuplicateSource(dups, 'react')?.id).toBe('1');
    expect(findDuplicateSource(dups, '  API  ')?.id).toBe('2');
    expect(findDuplicateSource(dups, 'Vue')).toBeUndefined();
    expect(findDuplicateSource(dups, 'React', '1')).toBeUndefined();

    expect(filterGlossaryEntries(sampleEntries, '')).toHaveLength(3);
    expect(filterGlossaryEntries(sampleEntries, 'học').map((e) => e.id)).toEqual(['2']);
    expect(filterGlossaryEntries(sampleEntries, 'react').map((e) => e.id)).toEqual(['1']);

    const sortable: GlossaryEntry[] = [
      { id: 'a', source: 'a', target: 'a' },
      { id: 'b', source: 'b', target: 'b' },
      { id: 'c', source: 'c', target: 'c' },
    ];
    expect(sortMismatchesFirst(sortable, new Set(['c', 'a'])).map((e) => e.id)).toEqual([
      'a',
      'c',
      'b',
    ]);
  });
});

/** @vitest-environment jsdom */

describe('glossary import templates', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('JSON and CSV templates parse to example terms and downloadGlossaryTemplate creates blob downloads', () => {
    const jsonEntries = parseGlossaryJSON(GLOSSARY_JSON_TEMPLATE);
    expect(jsonEntries).toHaveLength(3);
    expect(jsonEntries.map((e) => e.source)).toEqual([
      'React',
      'API',
      'machine learning',
    ]);
    expect(jsonEntries.map((e) => e.target)).toEqual([
      'React',
      'API',
      'machine learning',
    ]);

    const csvEntries = parseGlossaryCSV(GLOSSARY_CSV_TEMPLATE);
    expect(csvEntries).toHaveLength(3);
    expect(csvEntries[0]).toMatchObject({ source: 'React', target: 'React' });
    expect(csvEntries[1]).toMatchObject({ source: 'API', target: 'API' });
    expect(csvEntries[2]).toMatchObject({
      source: 'machine learning',
      target: 'machine learning',
    });

    // downloadGlossaryTemplate creates a blob download with the right name
    const createObjectURL = vi.fn((blob: Blob) => {
      expect(blob).toBeInstanceOf(Blob);
      return 'blob:template';
    });
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', {
      createObjectURL,
      revokeObjectURL,
    });

    const click = vi.fn();
    const anchor = {
      href: '',
      download: '',
      click,
    } as unknown as HTMLAnchorElement;
    const createElement = vi
      .spyOn(document, 'createElement')
      .mockReturnValue(anchor);

    downloadGlossaryTemplate('json');

    expect(createElement).toHaveBeenCalledWith('a');
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(createObjectURL.mock.calls[0]![0].type).toBe('application/json');
    expect(anchor.download).toBe(GLOSSARY_JSON_TEMPLATE_FILENAME);
    expect(anchor.href).toBe('blob:template');
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:template');

    downloadGlossaryTemplate('csv');
    expect(anchor.download).toBe(GLOSSARY_CSV_TEMPLATE_FILENAME);
    expect(createObjectURL.mock.calls[1]![0].type).toBe('text/csv');
  });
});
