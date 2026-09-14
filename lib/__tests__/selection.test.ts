import { beforeEach, describe, expect, it } from 'vitest';
import {
  SELECTION_CONTEXT_MAX_CHARS,
  extractSelectionContext,
  getSurroundingTextFromRange,
} from '../selectionContext';
import {
  parseSelectionDictionary,
  hasDictionaryFields,
  extractTranslationFallback,
  type SelectionDictionaryResult,
} from '@/lib/selectionDictionary';
import {
  generateSelectionDictionaryCacheKey,
  SELECTION_DICTIONARY_CACHE_PREFIX,
} from '../selectionCacheKey';
import { generateCacheKey } from '@/services/cacheManager';
import {
  isDictionaryModeCandidate,
  MAX_DICTIONARY_TOKENS,
} from '@/lib/selectionClassify';
import {
  SELECTION_DICTIONARY_SYSTEM_TEMPLATE,
  buildSelectionDictionarySystemPrompt,
  buildSelectionDictionaryUserPrompt,
} from '@/lib/selectionDictionaryPrompt';

// @vitest-environment jsdom

describe('selectionContext', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('extractSelectionContext windows text; getSurroundingTextFromRange reads nearest block ancestor', () => {
    expect(SELECTION_CONTEXT_MAX_CHARS).toBe(300);

    expect(
      extractSelectionContext({
        selectedText: 'word',
        parentText: 'This is a parent sentence with word inside.',
      }),
    ).toBe('This is a parent sentence with word inside.');

    expect(
      extractSelectionContext({
        selectedText: 'hello',
        parentText: '  Hello   world\n\tfoo  ',
      }),
    ).toBe('Hello world foo');

    const long = 'a'.repeat(500);
    expect(
      extractSelectionContext({
        selectedText: 'x',
        parentText: long,
        maxChars: 100,
      }).length,
    ).toBe(100);

    const prefix = 'PREFIX_'.repeat(40);
    const selected = 'TARGET';
    const suffix = '_SUFFIX'.repeat(40);
    const parentText = `${prefix}${selected}${suffix}`;
    const windowed = extractSelectionContext({
      selectedText: selected,
      parentText,
      maxChars: 60,
    });
    expect(windowed.length).toBeLessThanOrEqual(60);
    expect(windowed).toContain(selected);
    expect(windowed).not.toBe(parentText.slice(0, 60));

    const missing = 'abcdefghij'.repeat(40);
    expect(
      extractSelectionContext({
        selectedText: 'NOTFOUND',
        parentText: missing,
        maxChars: 50,
      }),
    ).toBe(missing.slice(0, 50));

    expect(extractSelectionContext({ selectedText: 'word' })).toBe('');
    expect(extractSelectionContext({ selectedText: 'word', parentText: '   ' })).toBe('');
    expect(extractSelectionContext({ selectedText: '', parentText: '' })).toBe('');
    expect(
      extractSelectionContext({
        selectedText: 'x',
        range: {
          get commonAncestorContainer(): Node {
            throw new Error('boom');
          },
        } as unknown as Range,
      }),
    ).toBe('');

    const p = document.createElement('p');
    p.textContent = 'Range paragraph text with hello here.';
    document.body.appendChild(p);
    const textNode = p.firstChild as Text;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 5);

    expect(
      extractSelectionContext({
        selectedText: 'hello',
        parentText: 'Explicit parent text with hello.',
        range,
      }),
    ).toBe('Explicit parent text with hello.');

    const start = (p.textContent ?? '').indexOf('hello');
    range.setStart(textNode, start);
    range.setEnd(textNode, start + 'hello'.length);
    expect(
      extractSelectionContext({
        selectedText: 'hello',
        range,
      }),
    ).toBe('Range paragraph text with hello here.');

    // getSurroundingTextFromRange reads nearest block ancestor and fails open
    const p2 = document.createElement('p');
    p2.textContent = 'Hello from paragraph.';
    document.body.appendChild(p2);
    const pRange = document.createRange();
    pRange.setStart(p2.firstChild as Text, 0);
    pRange.setEnd(p2.firstChild as Text, 5);
    expect(getSurroundingTextFromRange(pRange)).toBe('Hello from paragraph.');

    const article = document.createElement('article');
    const span = document.createElement('span');
    span.textContent = 'Nested word content';
    article.appendChild(span);
    document.body.appendChild(article);
    const nested = document.createRange();
    nested.setStart(span.firstChild as Text, 0);
    nested.setEnd(span.firstChild as Text, 6);
    expect(getSurroundingTextFromRange(nested)).toBe('Nested word content');

    const div = document.createElement('div');
    div.textContent = 'Div block text';
    document.body.appendChild(div);
    const divRange = document.createRange();
    divRange.setStart(div.firstChild as Text, 0);
    divRange.setEnd(div.firstChild as Text, 3);
    expect(getSurroundingTextFromRange(divRange)).toBe('Div block text');

    expect(
      getSurroundingTextFromRange({
        get commonAncestorContainer(): Node {
          throw new Error('fail');
        },
      } as unknown as Range),
    ).toBe('');
  });
});

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

describe('selection dictionary, cache keys, classification & prompts', () => {
  it('parses payloads, checks fields & fallbacks, generates cache keys, classifies candidates, and builds prompts', async () => {
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
    expect(parseSelectionDictionary('not json at all')).toBeNull();

    const onlyTranslation: SelectionDictionaryResult = {
      translation: 'xin chào',
      contextualAnalysis: 'context',
    };
    expect(hasDictionaryFields(onlyTranslation)).toBe(false);
    expect(hasDictionaryFields({ phonetic: '/həˈloʊ/' })).toBe(true);
    expect(extractTranslationFallback('raw junk', { translation: 'xin chào' })).toBe('xin chào');

    // Cache key
    const plain = await generateCacheKey('hello', 'en', 'vi');
    const dict = await generateSelectionDictionaryCacheKey('hello', 'en', 'vi');
    expect(dict).toBe(`${SELECTION_DICTIONARY_CACHE_PREFIX}${plain}`);

    // Candidate classification
    expect(MAX_DICTIONARY_TOKENS).toBe(3);
    expect(isDictionaryModeCandidate('hello world')).toBe(true);
    expect(isDictionaryModeCandidate('one two three four')).toBe(false);

    // Prompts
    expect(SELECTION_DICTIONARY_SYSTEM_TEMPLATE).toContain('{{from}}');
    const systemPrompt = buildSelectionDictionarySystemPrompt({
      from: 'English',
      to: 'Chinese',
      text: 'hello',
      contextText: 'She said hello.',
    });
    expect(systemPrompt).toContain('translating from English into Chinese');
    expect(buildSelectionDictionaryUserPrompt({ text: 'serendipity' })).toBe(
      `【Content to Translate】:\n"serendipity"`,
    );
  });
});
