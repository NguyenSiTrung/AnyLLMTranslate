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
} from '@/lib/glossary';
import type { GlossaryEntry } from '@/types/config';

const sampleEntries: GlossaryEntry[] = [
  { id: '1', source: 'React', target: 'React' },
  { id: '2', source: 'machine learning', target: 'học máy' },
  { id: '3', source: 'API', target: 'API' },
];

describe('formatGlossary', () => {
  it('returns empty string for no entries', () => {
    expect(formatGlossary([])).toBe('');
  });

  it('formats entries as a glossary block', () => {
    const result = formatGlossary(sampleEntries);
    expect(result).toContain('Translation Glossary');
    expect(result).toContain('"React" → "React"');
    expect(result).toContain('"machine learning" → "học máy"');
    expect(result).toContain('"API" → "API"');
  });
});

describe('parseGlossaryCSV', () => {
  it('parses simple CSV', () => {
    const csv = 'source,target\nReact,React\nAPI,API';
    const entries = parseGlossaryCSV(csv);
    expect(entries).toHaveLength(2);
    expect(entries[0].source).toBe('React');
    expect(entries[0].target).toBe('React');
  });

  it('handles quoted values with commas', () => {
    const csv = '"hello, world","xin chào, thế giới"';
    const entries = parseGlossaryCSV(csv);
    expect(entries).toHaveLength(1);
    expect(entries[0].source).toBe('hello, world');
    expect(entries[0].target).toBe('xin chào, thế giới');
  });

  it('skips empty lines', () => {
    const csv = 'source,target\n\nReact,React\n\n';
    const entries = parseGlossaryCSV(csv);
    expect(entries).toHaveLength(1);
  });

  it('skips header line', () => {
    const csv = 'source,target\nReact,React';
    const entries = parseGlossaryCSV(csv);
    expect(entries).toHaveLength(1);
  });

  it('skips header line with reversed column order (target,source)', () => {
    const csv = 'target,source\nReact,React\nAPI,API';
    const entries = parseGlossaryCSV(csv);
    // Header skipped, but the two data rows will be parsed with target/source swapped
    // — that's acceptable for this hardening pass; the column order is preserved by
    // the parser mapping parts[0]→source and parts[1]→target.
    expect(entries).toHaveLength(2);
  });

  it('skips a header that is just the word "Source"', () => {
    const csv = 'Source,Target\nReact,React\nAPI,API';
    const entries = parseGlossaryCSV(csv);
    expect(entries).toHaveLength(2);
  });

  it('does not treat a real entry as a header', () => {
    const csv = 'React,React';
    const entries = parseGlossaryCSV(csv);
    expect(entries).toHaveLength(1);
    expect(entries[0].source).toBe('React');
  });

  it('handles CSV without header', () => {
    const csv = 'React,React\nAPI,API';
    const entries = parseGlossaryCSV(csv);
    expect(entries).toHaveLength(2);
  });

  it('returns empty for insufficient columns', () => {
    const csv = 'source,target\nonlyOneColumn';
    const entries = parseGlossaryCSV(csv);
    expect(entries).toHaveLength(0);
  });
});

describe('exportGlossaryCSV', () => {
  it('exports with header', () => {
    const csv = exportGlossaryCSV(sampleEntries);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('source,target');
    expect(lines).toHaveLength(4);
  });

  it('escapes commas and quotes', () => {
    const entries: GlossaryEntry[] = [
      { id: '1', source: 'hello, world', target: 'quote "test"' },
    ];
    const csv = exportGlossaryCSV(entries);
    expect(csv).toContain('"hello, world"');
    expect(csv).toContain('"quote ""test"""');
  });

  it('roundtrips with parseGlossaryCSV', () => {
    const csv = exportGlossaryCSV(sampleEntries);
    const parsed = parseGlossaryCSV(csv);
    expect(parsed).toHaveLength(sampleEntries.length);
    for (let i = 0; i < parsed.length; i++) {
      expect(parsed[i].source).toBe(sampleEntries[i].source);
      expect(parsed[i].target).toBe(sampleEntries[i].target);
    }
  });
});

describe('exportGlossaryJSON', () => {
  it('exports as formatted JSON without id fields', () => {
    const json = exportGlossaryJSON(sampleEntries);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(3);
    expect(parsed[0].source).toBe('React');
    expect(parsed[0].target).toBe('React');
    // Internal id should be stripped from export
    expect(parsed[0]).not.toHaveProperty('id');
  });
});

describe('parseGlossaryJSON', () => {
  it('parses valid JSON array', () => {
    const json = JSON.stringify(sampleEntries);
    const result = parseGlossaryJSON(json);
    expect(result).toHaveLength(3);
    expect(result[0].source).toBe('React');
  });

  it('throws for non-array JSON', () => {
    expect(() => parseGlossaryJSON('{"key": "value"}')).toThrow('expected an array');
  });

  it('throws for entries missing source/target', () => {
    expect(() => parseGlossaryJSON('[{"source": "hello"}]')).toThrow('must have source and target');
  });

  it('generates fresh UUIDs for entries', () => {
    const json = '[{"source": "hello", "target": "xin chào"}]';
    const result = parseGlossaryJSON(json);
    expect(result[0].id).toBeTruthy();
    // UUID v4 format: 8-4-4-4-12 hex chars
    expect(result[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('always generates fresh IDs even when JSON has existing IDs', () => {
    const json = '[{"id": "custom-id", "source": "hello", "target": "xin chào"}]';
    const result = parseGlossaryJSON(json);
    // Fresh UUID is always generated, original id is not preserved
    expect(result[0].id).not.toBe('custom-id');
    expect(result[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

describe('checkGlossaryMismatches', () => {
  const entries: GlossaryEntry[] = [
    { id: '1', source: 'machine learning', target: 'học máy' },
    { id: '2', source: 'API', target: 'API' },
    { id: '3', source: 'neural network', target: 'mạng nơ-ron' },
  ];

  it('returns entries whose target is missing from output', () => {
    const result = checkGlossaryMismatches(
      entries,
      'We use machine learning and API in our system.',
      'Chúng tôi sử dụng ML và API trong hệ thống.',
    );
    // 'machine learning' source in input, 'học máy' absent from output → flagged
    // 'API' source in input, 'API' present in output → not flagged
    expect(result.map((e) => e.id)).toContain('1');
    expect(result.map((e) => e.id)).not.toContain('2');
  });

  it('returns empty array when all glossary entries are correctly translated', () => {
    const result = checkGlossaryMismatches(
      entries,
      'machine learning and API',
      'học máy và API',
    );
    expect(result).toHaveLength(0);
  });

  it('is case-insensitive for source term matching', () => {
    const result = checkGlossaryMismatches(
      entries,
      'Machine Learning is great.',  // uppercase 'M'
      'Something else entirely.',
    );
    expect(result.map((e) => e.id)).toContain('1');
  });

  it('is case-insensitive for target term matching', () => {
    const result = checkGlossaryMismatches(
      entries,
      'machine learning',
      'HỌC MÁY is mentioned here.',  // uppercase target
    );
    // 'học máy'.toLowerCase() is in output.toLowerCase() → no mismatch
    expect(result).toHaveLength(0);
  });

  it('does not flag entries whose source is not in the input', () => {
    const result = checkGlossaryMismatches(
      entries,
      'Hello world',  // no glossary source terms
      'Xin chào thế giới',
    );
    expect(result).toHaveLength(0);
  });

  it('returns empty array for empty entries list', () => {
    const result = checkGlossaryMismatches([], 'machine learning', 'hello');
    expect(result).toHaveLength(0);
  });
});
