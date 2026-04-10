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
  it('exports as formatted JSON', () => {
    const json = exportGlossaryJSON(sampleEntries);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(3);
    expect(parsed[0].source).toBe('React');
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

  it('generates IDs if missing', () => {
    const json = '[{"source": "hello", "target": "xin chào"}]';
    const result = parseGlossaryJSON(json);
    expect(result[0].id).toBeTruthy();
    expect(result[0].id).toContain('json-');
  });

  it('preserves existing IDs', () => {
    const json = '[{"id": "custom-id", "source": "hello", "target": "xin chào"}]';
    const result = parseGlossaryJSON(json);
    expect(result[0].id).toBe('custom-id');
  });
});
