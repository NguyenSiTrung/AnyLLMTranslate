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
