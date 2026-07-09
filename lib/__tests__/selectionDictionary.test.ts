import { describe, it, expect } from 'vitest';
import {
  parseSelectionDictionary,
  hasDictionaryFields,
  extractTranslationFallback,
  type SelectionDictionaryResult,
} from '@/lib/selectionDictionary';

const FULL_PAYLOAD = {
  phonetic: '/həˈloʊ/',
  definitions: [
    {
      pos: 'excl.',
      meaning: 'Used as a greeting',
      example: { source: 'Hello there!', target: 'Xin chào!' },
    },
  ],
  translation: 'xin chào',
  contextual_analysis: 'A friendly greeting in context.',
};

describe('parseSelectionDictionary', () => {
  it('parses a full valid dictionary JSON object', () => {
    const result = parseSelectionDictionary(JSON.stringify(FULL_PAYLOAD));
    expect(result).toEqual({
      phonetic: '/həˈloʊ/',
      definitions: [
        {
          pos: 'excl.',
          meaning: 'Used as a greeting',
          example: { source: 'Hello there!', target: 'Xin chào!' },
        },
      ],
      translation: 'xin chào',
      contextualAnalysis: 'A friendly greeting in context.',
    });
  });

  it('tolerates partial fields (translation only)', () => {
    const result = parseSelectionDictionary(
      JSON.stringify({ translation: 'xin chào' }),
    );
    expect(result).toEqual({ translation: 'xin chào' });
  });

  it('parses fenced markdown JSON', () => {
    const raw = `Here is the result:
\`\`\`json
${JSON.stringify(FULL_PAYLOAD, null, 2)}
\`\`\``;
    const result = parseSelectionDictionary(raw);
    expect(result?.translation).toBe('xin chào');
    expect(result?.phonetic).toBe('/həˈloʊ/');
    expect(result?.contextualAnalysis).toBe('A friendly greeting in context.');
    expect(result?.definitions).toHaveLength(1);
  });

  it('strips <think> blocks before parsing', () => {
    const raw = `<think>
I should return dictionary JSON for this word.
</think>
${JSON.stringify(FULL_PAYLOAD)}`;
    const result = parseSelectionDictionary(raw);
    expect(result?.translation).toBe('xin chào');
    expect(result?.phonetic).toBe('/həˈloʊ/');
  });

  it('strips unclosed <think> tails', () => {
    const raw = `<think>still thinking...
{"translation": "hello"}`;
    // Unclosed think strips everything after open tag → empty → null
    // unless braces remain; unclosed strip removes rest of string
    const result = parseSelectionDictionary(raw);
    expect(result).toBeNull();
  });

  it('extracts outermost braces when prose surrounds JSON', () => {
    const raw = `Sure! ${JSON.stringify({ translation: 'bonjour', phonetic: '/bɔ̃.ʒuʁ/' })} Hope that helps.`;
    const result = parseSelectionDictionary(raw);
    expect(result).toEqual({
      translation: 'bonjour',
      phonetic: '/bɔ̃.ʒuʁ/',
    });
  });

  it('maps snake_case contextual_analysis to camelCase', () => {
    const result = parseSelectionDictionary(
      JSON.stringify({ contextual_analysis: 'In this sentence it means X.' }),
    );
    expect(result).toEqual({
      contextualAnalysis: 'In this sentence it means X.',
    });
  });

  it('prefers camelCase contextualAnalysis when both present', () => {
    const result = parseSelectionDictionary(
      JSON.stringify({
        contextualAnalysis: 'camel',
        contextual_analysis: 'snake',
      }),
    );
    expect(result?.contextualAnalysis).toBe('camel');
  });

  it('returns null for garbage input', () => {
    expect(parseSelectionDictionary('not json at all')).toBeNull();
    expect(parseSelectionDictionary('{broken')).toBeNull();
    expect(parseSelectionDictionary('[]')).toBeNull();
  });

  it('returns null for empty or whitespace', () => {
    expect(parseSelectionDictionary('')).toBeNull();
    expect(parseSelectionDictionary('   ')).toBeNull();
  });

  it('returns null when JSON object has no usable fields', () => {
    expect(parseSelectionDictionary(JSON.stringify({ foo: 1 }))).toBeNull();
    expect(
      parseSelectionDictionary(JSON.stringify({ translation: '', phonetic: 123 })),
    ).toBeNull();
    expect(
      parseSelectionDictionary(JSON.stringify({ definitions: [] })),
    ).toBeNull();
  });

  it('ignores non-string fields and keeps valid ones', () => {
    const result = parseSelectionDictionary(
      JSON.stringify({
        phonetic: 42,
        translation: 'ok',
        definitions: 'nope',
        contextual_analysis: null,
      }),
    );
    expect(result).toEqual({ translation: 'ok' });
  });

  it('filters invalid definition entries and keeps partial defs', () => {
    const result = parseSelectionDictionary(
      JSON.stringify({
        definitions: [
          null,
          'skip',
          { pos: 'n.', meaning: 1 },
          { pos: 'v.', meaning: 'to greet' },
          { example: { source: 'hi' } },
        ],
      }),
    );
    expect(result?.definitions).toEqual([
      { pos: 'n.' },
      { pos: 'v.', meaning: 'to greet' },
      { example: { source: 'hi' } },
    ]);
  });

  it('accepts trailing commas in JSON (lenient)', () => {
    const raw = `{"translation": "xin chào", "phonetic": "/həˈloʊ/",}`;
    const result = parseSelectionDictionary(raw);
    expect(result).toEqual({
      translation: 'xin chào',
      phonetic: '/həˈloʊ/',
    });
  });
});

describe('hasDictionaryFields', () => {
  it('is false for null/undefined/empty', () => {
    expect(hasDictionaryFields(null)).toBe(false);
    expect(hasDictionaryFields(undefined)).toBe(false);
    expect(hasDictionaryFields({})).toBe(false);
  });

  it('is true when phonetic is non-empty', () => {
    expect(hasDictionaryFields({ phonetic: '/həˈloʊ/' })).toBe(true);
  });

  it('is false when phonetic is empty/whitespace', () => {
    expect(hasDictionaryFields({ phonetic: '   ' })).toBe(false);
  });

  it('is true when a definition has meaning or pos', () => {
    expect(
      hasDictionaryFields({ definitions: [{ meaning: 'greeting' }] }),
    ).toBe(true);
    expect(hasDictionaryFields({ definitions: [{ pos: 'n.' }] })).toBe(true);
  });

  it('is false when definitions lack meaning and pos', () => {
    expect(
      hasDictionaryFields({
        definitions: [{ example: { source: 'hi' } }],
      }),
    ).toBe(false);
    expect(hasDictionaryFields({ definitions: [] })).toBe(false);
  });

  it('is false when only translation / contextualAnalysis present', () => {
    const onlyTranslation: SelectionDictionaryResult = {
      translation: 'xin chào',
      contextualAnalysis: 'context',
    };
    expect(hasDictionaryFields(onlyTranslation)).toBe(false);
  });
});

describe('extractTranslationFallback', () => {
  it('prefers parsed.translation when non-empty', () => {
    expect(
      extractTranslationFallback('raw junk', { translation: 'xin chào' }),
    ).toBe('xin chào');
  });

  it('extracts translation from JSON when parsed is null', () => {
    const raw = JSON.stringify({ translation: 'bonjour', foo: 1 });
    // mapToResult would keep translation, but simulate null parse path
    expect(extractTranslationFallback(raw, null)).toBe('bonjour');
  });

  it('falls back to cleaned raw text when no translation field', () => {
    const raw = `<think>reason</think>\nHello world`;
    expect(extractTranslationFallback(raw, null)).toBe('Hello world');
  });

  it('returns empty string for empty raw and null parse', () => {
    expect(extractTranslationFallback('', null)).toBe('');
    expect(extractTranslationFallback('   ', null)).toBe('');
  });

  it('ignores empty parsed.translation and tries JSON/raw', () => {
    const raw = JSON.stringify({ translation: 'from-json' });
    expect(
      extractTranslationFallback(raw, { translation: '   ' }),
    ).toBe('from-json');
  });
});
