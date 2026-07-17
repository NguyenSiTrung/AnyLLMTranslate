/**
 * Term list parse + merge pure helpers.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseTermPairsFromLlmJson,
  mergeTermPairsWithGlossary,
  formatPdfTermBlock,
  sampleProseForExtraction,
  clearPdfTermCache,
} from '../pdfTermExtract';
import type { PdfParagraph } from '../pdfTextExtraction';
import type { GlossaryEntry } from '@/types/config';

function para(id: string, text: string, pageNumber = 1, y = 100): PdfParagraph {
  return {
    id,
    pageNumber,
    text,
    x: 50,
    y,
    width: 200,
    height: 20,
    fontSize: 12,
    fontName: 'Helvetica',
    isHeading: false,
  };
}

describe('parseTermPairsFromLlmJson', () => {
  it('parses a JSON array of source/target pairs', () => {
    const raw = JSON.stringify([
      { source: 'gradient descent', target: '梯度下降' },
      { source: 'attention', target: '注意力' },
    ]);
    expect(parseTermPairsFromLlmJson(raw)).toEqual([
      { source: 'gradient descent', target: '梯度下降' },
      { source: 'attention', target: '注意力' },
    ]);
  });

  it('parses { terms: [...] } and strips code fences', () => {
    const raw = '```json\n{"terms":[{"source":"BERT","target":"BERT"}]}\n```';
    expect(parseTermPairsFromLlmJson(raw)).toEqual([{ source: 'BERT', target: 'BERT' }]);
  });

  it('strips junk control chars and fails open on garbage', () => {
    expect(parseTermPairsFromLlmJson('not json at all')).toEqual([]);
    expect(parseTermPairsFromLlmJson('')).toEqual([]);
    const dirty = JSON.stringify([{ source: 'foo\u0001bar', target: 'baz' }]);
    const parsed = parseTermPairsFromLlmJson(dirty);
    expect(parsed[0]?.source).toBe('foobar');
  });

  it('dedupes by source case-insensitively', () => {
    const raw = JSON.stringify([
      { source: 'CNN', target: 'CNN' },
      { source: 'cnn', target: '卷积神经网络' },
    ]);
    expect(parseTermPairsFromLlmJson(raw)).toHaveLength(1);
  });
});

describe('mergeTermPairsWithGlossary', () => {
  const glossary: GlossaryEntry[] = [
    { id: '1', source: 'attention', target: '用户指定注意力' },
  ];

  it('lets user glossary win over extracted terms', () => {
    const extracted = [
      { source: 'attention', target: 'LLM注意力' },
      { source: 'transformer', target: '变换器' },
    ];
    const merged = mergeTermPairsWithGlossary(extracted, glossary);
    expect(merged.find((t) => t.source === 'attention')?.target).toBe('用户指定注意力');
    expect(merged.find((t) => t.source === 'transformer')?.target).toBe('变换器');
  });

  it('returns empty when both empty', () => {
    expect(mergeTermPairsWithGlossary([], [])).toEqual([]);
  });
});

describe('formatPdfTermBlock', () => {
  it('returns empty for no pairs', () => {
    expect(formatPdfTermBlock([])).toBe('');
  });

  it('includes document_terms wrapper', () => {
    const block = formatPdfTermBlock([{ source: 'foo', target: 'bar' }]);
    expect(block).toContain('<document_terms>');
    expect(block).toContain('foo → bar');
  });
});

describe('sampleProseForExtraction', () => {
  beforeEach(() => {
    clearPdfTermCache();
  });

  it('respects page and char budget', () => {
    const items = [
      { pageNumber: 1, paragraph: para('a', 'Alpha paragraph text is long enough here.', 1, 10) },
      { pageNumber: 1, paragraph: para('b', 'Beta paragraph also long enough for sample.', 1, 20) },
      { pageNumber: 4, paragraph: para('c', 'Should be excluded by page window.', 4, 10) },
    ];
    const sample = sampleProseForExtraction(items, { maxPages: 2, charBudget: 80 });
    expect(sample).toContain('Alpha');
    expect(sample.length).toBeLessThanOrEqual(80);
    expect(sample).not.toContain('excluded');
  });

  it('returns empty for empty input', () => {
    expect(sampleProseForExtraction([])).toBe('');
  });
});
