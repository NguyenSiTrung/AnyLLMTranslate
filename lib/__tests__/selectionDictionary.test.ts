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
  it('parses full/partial JSON and tolerates fences, think tags, and prose wrappers', () => {
    expect(parseSelectionDictionary(JSON.stringify(FULL_PAYLOAD))).toEqual({
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

    expect(parseSelectionDictionary(JSON.stringify({ translation: 'xin chào' }))).toEqual({
      translation: 'xin chào',
    });

    const fenced = `Here is the result:\n\`\`\`json\n${JSON.stringify(FULL_PAYLOAD, null, 2)}\n\`\`\``;
    expect(parseSelectionDictionary(fenced)?.translation).toBe('xin chào');

    const withThink = `<think>\nI should return dictionary JSON for this word.\n</think>\n${JSON.stringify(FULL_PAYLOAD)}`;
    expect(parseSelectionDictionary(withThink)?.phonetic).toBe('/həˈloʊ/');

    // Unclosed think strips remaining content → null
    expect(parseSelectionDictionary(`<think>still thinking...\n{"translation": "hello"}`)).toBeNull();

    const prose = `Sure! ${JSON.stringify({ translation: 'bonjour', phonetic: '/bɔ̃.ʒuʁ/' })} Hope that helps.`;
    expect(parseSelectionDictionary(prose)).toEqual({
      translation: 'bonjour',
      phonetic: '/bɔ̃.ʒuʁ/',
    });
  });

  it('maps contextual_analysis, filters bad fields, and accepts trailing commas', () => {
    expect(
      parseSelectionDictionary(JSON.stringify({ contextual_analysis: 'In this sentence it means X.' })),
    ).toEqual({ contextualAnalysis: 'In this sentence it means X.' });

    expect(
      parseSelectionDictionary(
        JSON.stringify({
          contextualAnalysis: 'camel',
          contextual_analysis: 'snake',
        }),
      )?.contextualAnalysis,
    ).toBe('camel');

    expect(
      parseSelectionDictionary(
        JSON.stringify({
          phonetic: 42,
          translation: 'ok',
          definitions: 'nope',
          contextual_analysis: null,
        }),
      ),
    ).toEqual({ translation: 'ok' });

    expect(
      parseSelectionDictionary(
        JSON.stringify({
          definitions: [
            null,
            'skip',
            { pos: 'n.', meaning: 1 },
            { pos: 'v.', meaning: 'to greet' },
            { example: { source: 'hi' } },
          ],
        }),
      )?.definitions,
    ).toEqual([
      { pos: 'n.' },
      { pos: 'v.', meaning: 'to greet' },
      { example: { source: 'hi' } },
    ]);

    expect(parseSelectionDictionary(`{"translation": "xin chào", "phonetic": "/həˈloʊ/",}`)).toEqual({
      translation: 'xin chào',
      phonetic: '/həˈloʊ/',
    });
  });

  it('returns null for garbage, empty, and unusable objects', () => {
    expect(parseSelectionDictionary('not json at all')).toBeNull();
    expect(parseSelectionDictionary('{broken')).toBeNull();
    expect(parseSelectionDictionary('[]')).toBeNull();
    expect(parseSelectionDictionary('')).toBeNull();
    expect(parseSelectionDictionary('   ')).toBeNull();
    expect(parseSelectionDictionary(JSON.stringify({ foo: 1 }))).toBeNull();
    expect(
      parseSelectionDictionary(JSON.stringify({ translation: '', phonetic: 123 })),
    ).toBeNull();
    expect(parseSelectionDictionary(JSON.stringify({ definitions: [] }))).toBeNull();
  });
});

describe('hasDictionaryFields', () => {
  it('is true only when phonetic or definition meaning/pos is present', () => {
    expect(hasDictionaryFields(null)).toBe(false);
    expect(hasDictionaryFields(undefined)).toBe(false);
    expect(hasDictionaryFields({})).toBe(false);
    expect(hasDictionaryFields({ phonetic: '   ' })).toBe(false);
    expect(hasDictionaryFields({ definitions: [{ example: { source: 'hi' } }] })).toBe(false);
    expect(hasDictionaryFields({ definitions: [] })).toBe(false);

    const onlyTranslation: SelectionDictionaryResult = {
      translation: 'xin chào',
      contextualAnalysis: 'context',
    };
    expect(hasDictionaryFields(onlyTranslation)).toBe(false);

    expect(hasDictionaryFields({ phonetic: '/həˈloʊ/' })).toBe(true);
    expect(hasDictionaryFields({ definitions: [{ meaning: 'greeting' }] })).toBe(true);
    expect(hasDictionaryFields({ definitions: [{ pos: 'n.' }] })).toBe(true);
  });
});

describe('extractTranslationFallback', () => {
  it('prefers parsed.translation, then JSON, then cleaned raw text', () => {
    expect(extractTranslationFallback('raw junk', { translation: 'xin chào' })).toBe('xin chào');
    expect(
      extractTranslationFallback(JSON.stringify({ translation: 'bonjour', foo: 1 }), null),
    ).toBe('bonjour');
    expect(extractTranslationFallback(`<think>reason</think>\nHello world`, null)).toBe(
      'Hello world',
    );
    expect(extractTranslationFallback('', null)).toBe('');
    expect(
      extractTranslationFallback(JSON.stringify({ translation: 'from-json' }), {
        translation: '   ',
      }),
    ).toBe('from-json');
  });
});
