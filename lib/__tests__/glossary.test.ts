/**
 * Tests for glossary utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  formatGlossary,
  parseGlossaryCSV,
  exportGlossaryCSV,
  exportGlossaryJSON,
  parseGlossaryJSON,
  checkGlossaryMismatches,
  findDuplicateSource,
  filterGlossaryEntries,
  sortMismatchesFirst,
} from '@/lib/glossary';
import type { GlossaryEntry } from '@/types/config';

const sampleEntries: GlossaryEntry[] = [
  { id: '1', source: 'React', target: 'React' },
  { id: '2', source: 'machine learning', target: 'học máy' },
  { id: '3', source: 'API', target: 'API' },
];

describe('formatGlossary', () => {
  it('formats entries (empty → empty string)', () => {
    expect(formatGlossary([])).toBe('');
    const result = formatGlossary(sampleEntries);
    expect(result).toContain('Translation Glossary');
    expect(result).toContain('"machine learning" → "học máy"');
  });
});

describe('parse / export CSV', () => {
  it('parses CSV with header, quoted commas, and skips junk lines', () => {
    expect(parseGlossaryCSV('source,target\nReact,React\nAPI,API')).toHaveLength(2);
    const quoted = parseGlossaryCSV('"hello, world","xin chào, thế giới"');
    expect(quoted[0].source).toBe('hello, world');
    expect(parseGlossaryCSV('source,target\n\nReact,React\n\n')).toHaveLength(1);
    expect(parseGlossaryCSV('source,target\nonlyOneColumn')).toHaveLength(0);
  });

  it('exports with header, escapes specials, and round-trips', () => {
    const csv = exportGlossaryCSV(sampleEntries);
    expect(csv.split('\n')[0]).toBe('source,target');
    const escaped = exportGlossaryCSV([
      { id: '1', source: 'hello, world', target: 'quote "test"' },
    ]);
    expect(escaped).toContain('"hello, world"');
    const parsed = parseGlossaryCSV(csv);
    expect(parsed).toHaveLength(sampleEntries.length);
    expect(parsed[1].target).toBe('học máy');
  });
});

describe('parse / export JSON', () => {
  it('exports without ids, parses arrays, rejects bad shapes, regenerates UUIDs', () => {
    const json = exportGlossaryJSON(sampleEntries);
    const exported = JSON.parse(json);
    expect(exported[0]).not.toHaveProperty('id');

    const result = parseGlossaryJSON(JSON.stringify(sampleEntries));
    expect(result).toHaveLength(3);
    expect(() => parseGlossaryJSON('{"key": "value"}')).toThrow('expected an array');
    expect(() => parseGlossaryJSON('[{"source": "hello"}]')).toThrow('must have source and target');

    const fresh = parseGlossaryJSON(
      '[{"id": "custom-id", "source": "hello", "target": "xin chào"}]',
    );
    expect(fresh[0].id).not.toBe('custom-id');
  });
});

describe('checkGlossaryMismatches', () => {
  const entries: GlossaryEntry[] = [
    { id: '1', source: 'machine learning', target: 'học máy' },
    { id: '2', source: 'API', target: 'API' },
  ];

  it('flags missing targets (case-insensitive) and ignores empty inputs', () => {
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
    expect(checkGlossaryMismatches(entries, 'Hello world', 'Xin chào')).toHaveLength(0);
    expect(checkGlossaryMismatches([], 'machine learning', 'hello')).toHaveLength(0);
  });
});

describe('findDuplicateSource', () => {
  const entries: GlossaryEntry[] = [
    { id: '1', source: 'React', target: 'React' },
    { id: '2', source: 'API', target: 'API' },
  ];

  it('finds case-insensitive duplicates and respects excludeId', () => {
    expect(findDuplicateSource(entries, 'react')?.id).toBe('1');
    expect(findDuplicateSource(entries, '  API  ')?.id).toBe('2');
    expect(findDuplicateSource(entries, 'Vue')).toBeUndefined();
    expect(findDuplicateSource(entries, 'React', '1')).toBeUndefined();
    expect(findDuplicateSource(entries, 'React', '2')?.id).toBe('1');
  });
});

describe('filterGlossaryEntries', () => {
  it('filters source and target; empty query returns all', () => {
    expect(filterGlossaryEntries(sampleEntries, '')).toHaveLength(3);
    expect(filterGlossaryEntries(sampleEntries, '  ').map((e) => e.id)).toEqual(
      sampleEntries.map((e) => e.id),
    );
    expect(filterGlossaryEntries(sampleEntries, 'học').map((e) => e.id)).toEqual(['2']);
    expect(filterGlossaryEntries(sampleEntries, 'react').map((e) => e.id)).toEqual(['1']);
  });
});

describe('sortMismatchesFirst', () => {
  it('stable-sorts mismatched ids to the front', () => {
    const entries: GlossaryEntry[] = [
      { id: 'a', source: 'a', target: 'a' },
      { id: 'b', source: 'b', target: 'b' },
      { id: 'c', source: 'c', target: 'c' },
    ];
    const sorted = sortMismatchesFirst(entries, new Set(['c', 'a']));
    expect(sorted.map((e) => e.id)).toEqual(['a', 'c', 'b']);
    expect(sortMismatchesFirst(entries, new Set()).map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });
});
