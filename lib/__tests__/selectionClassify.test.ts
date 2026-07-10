import { describe, it, expect } from 'vitest';
import {
  isDictionaryModeCandidate,
  MAX_DICTIONARY_TOKENS,
  SENTENCE_END_PUNCT,
} from '@/lib/selectionClassify';

describe('isDictionaryModeCandidate', () => {
  it('accepts short words/phrases (incl. CJK) and rejects sentences / long spans', () => {
    expect(MAX_DICTIONARY_TOKENS).toBe(3);
    expect(SENTENCE_END_PUNCT).toBeInstanceOf(RegExp);

    expect(isDictionaryModeCandidate('hello')).toBe(true);
    expect(isDictionaryModeCandidate('  hello  ')).toBe(true);
    expect(isDictionaryModeCandidate('hello world')).toBe(true);
    expect(isDictionaryModeCandidate('machine learning model')).toBe(true);
    expect(isDictionaryModeCandidate("don't")).toBe(true);
    expect(isDictionaryModeCandidate('self-aware')).toBe(true);
    expect(isDictionaryModeCandidate('well, okay')).toBe(true);
    expect(isDictionaryModeCandidate('你好')).toBe(true);
    expect(isDictionaryModeCandidate('こんにちは')).toBe(true);
    expect(isDictionaryModeCandidate('你好 世界')).toBe(true);

    expect(isDictionaryModeCandidate('one two three four')).toBe(false);
    expect(isDictionaryModeCandidate('Hello.')).toBe(false);
    expect(isDictionaryModeCandidate('Really?')).toBe(false);
    expect(isDictionaryModeCandidate('Wow!')).toBe(false);
    expect(isDictionaryModeCandidate('wait…')).toBe(false);
    expect(isDictionaryModeCandidate('你好。')).toBe(false);
    expect(isDictionaryModeCandidate('真的吗？')).toBe(false);
    expect(isDictionaryModeCandidate('')).toBe(false);
    expect(isDictionaryModeCandidate('   ')).toBe(false);

    const atLimit = Array.from({ length: MAX_DICTIONARY_TOKENS }, (_, i) => `w${i}`).join(' ');
    const overLimit = Array.from(
      { length: MAX_DICTIONARY_TOKENS + 1 },
      (_, i) => `w${i}`,
    ).join(' ');
    expect(isDictionaryModeCandidate(atLimit)).toBe(true);
    expect(isDictionaryModeCandidate(overLimit)).toBe(false);
  });
});
