import { describe, it, expect } from 'vitest';
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
  it('parses dictionary JSON with fences/think/partial fields, checks fields & fallbacks', () => {
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
  });

  it('generates cache keys, classifies candidates, and builds dictionary prompts', async () => {
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
