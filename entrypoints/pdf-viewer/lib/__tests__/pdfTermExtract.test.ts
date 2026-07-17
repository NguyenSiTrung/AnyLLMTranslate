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

describe('pdfTermExtract', () => {
  beforeEach(() => {
    clearPdfTermCache();
  });

  it('parses LLM term JSON, merges glossary, formats block, samples prose', () => {
    expect(
      parseTermPairsFromLlmJson(
        JSON.stringify([
          { source: 'gradient descent', target: '梯度下降' },
          { source: 'attention', target: '注意力' },
        ]),
      ),
    ).toEqual([
      { source: 'gradient descent', target: '梯度下降' },
      { source: 'attention', target: '注意力' },
    ]);
    expect(parseTermPairsFromLlmJson('```json\n{"terms":[{"source":"BERT","target":"BERT"}]}\n```')).toEqual([
      { source: 'BERT', target: 'BERT' },
    ]);
    expect(parseTermPairsFromLlmJson('not json at all')).toEqual([]);
    expect(parseTermPairsFromLlmJson('')).toEqual([]);
    expect(
      parseTermPairsFromLlmJson(JSON.stringify([{ source: 'foo\u0001bar', target: 'baz' }]))[0]
        ?.source,
    ).toBe('foobar');
    expect(
      parseTermPairsFromLlmJson(
        JSON.stringify([
          { source: 'CNN', target: 'CNN' },
          { source: 'cnn', target: '卷积神经网络' },
        ]),
      ),
    ).toHaveLength(1);

    const glossary: GlossaryEntry[] = [
      { id: '1', source: 'attention', target: '用户指定注意力' },
    ];
    const merged = mergeTermPairsWithGlossary(
      [
        { source: 'attention', target: 'LLM注意力' },
        { source: 'transformer', target: '变换器' },
      ],
      glossary,
    );
    expect(merged.find((t) => t.source === 'attention')?.target).toBe('用户指定注意力');
    expect(merged.find((t) => t.source === 'transformer')?.target).toBe('变换器');
    expect(mergeTermPairsWithGlossary([], [])).toEqual([]);

    expect(formatPdfTermBlock([])).toBe('');
    const block = formatPdfTermBlock([{ source: 'foo', target: 'bar' }]);
    expect(block).toContain('<document_terms>');
    expect(block).toContain('foo → bar');

    const sample = sampleProseForExtraction(
      [
        {
          pageNumber: 1,
          paragraph: para('a', 'Alpha paragraph text is long enough here.', 1, 10),
        },
        {
          pageNumber: 1,
          paragraph: para('b', 'Beta paragraph also long enough for sample.', 1, 20),
        },
        {
          pageNumber: 4,
          paragraph: para('c', 'Should be excluded by page window.', 4, 10),
        },
      ],
      { maxPages: 2, charBudget: 80 },
    );
    expect(sample).toContain('Alpha');
    expect(sample.length).toBeLessThanOrEqual(80);
    expect(sample).not.toContain('excluded');
    expect(sampleProseForExtraction([])).toBe('');
  });
});
