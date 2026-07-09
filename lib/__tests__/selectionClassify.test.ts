import { describe, it, expect } from 'vitest';
import {
  isDictionaryModeCandidate,
  MAX_DICTIONARY_TOKENS,
  SENTENCE_END_PUNCT,
} from '@/lib/selectionClassify';

describe('selectionClassify constants', () => {
  it('exports named thresholds', () => {
    expect(MAX_DICTIONARY_TOKENS).toBe(3);
    expect(SENTENCE_END_PUNCT).toBeInstanceOf(RegExp);
  });
});

describe('isDictionaryModeCandidate', () => {
  it('returns true for a single English word', () => {
    expect(isDictionaryModeCandidate('hello')).toBe(true);
    expect(isDictionaryModeCandidate('  hello  ')).toBe(true);
    expect(isDictionaryModeCandidate('serendipity')).toBe(true);
  });

  it('returns true for 2–3 word phrases', () => {
    expect(isDictionaryModeCandidate('hello world')).toBe(true);
    expect(isDictionaryModeCandidate('look up')).toBe(true);
    expect(isDictionaryModeCandidate('machine learning model')).toBe(true);
    expect(isDictionaryModeCandidate('  machine learning model  ')).toBe(true);
  });

  it('returns false for 4+ words', () => {
    expect(isDictionaryModeCandidate('one two three four')).toBe(false);
    expect(isDictionaryModeCandidate('the quick brown fox jumps')).toBe(false);
  });

  it('returns false for short selections ending with sentence punctuation', () => {
    expect(isDictionaryModeCandidate('Hello.')).toBe(false);
    expect(isDictionaryModeCandidate('Really?')).toBe(false);
    expect(isDictionaryModeCandidate('Wow!')).toBe(false);
    expect(isDictionaryModeCandidate('hi there?')).toBe(false);
    expect(isDictionaryModeCandidate('ok go!')).toBe(false);
  });

  it('returns true for a single CJK token (no spaces)', () => {
    expect(isDictionaryModeCandidate('你好')).toBe(true);
    expect(isDictionaryModeCandidate('漢字')).toBe(true);
    expect(isDictionaryModeCandidate('こんにちは')).toBe(true);
    expect(isDictionaryModeCandidate('한국어')).toBe(true);
    expect(isDictionaryModeCandidate('  辞書  ')).toBe(true);
  });

  it('returns true for short multi-token CJK phrases without sentence punct', () => {
    expect(isDictionaryModeCandidate('你好 世界')).toBe(true);
    expect(isDictionaryModeCandidate('机器学习 模型')).toBe(true);
  });

  it('returns false for empty or whitespace-only input', () => {
    expect(isDictionaryModeCandidate('')).toBe(false);
    expect(isDictionaryModeCandidate('   ')).toBe(false);
    expect(isDictionaryModeCandidate('\t\n')).toBe(false);
  });

  it('handles ellipsis and Chinese sentence punctuation as sentence-mode', () => {
    expect(isDictionaryModeCandidate('wait…')).toBe(false);
    expect(isDictionaryModeCandidate('等等……')).toBe(false);
    expect(isDictionaryModeCandidate('你好。')).toBe(false);
    expect(isDictionaryModeCandidate('真的吗？')).toBe(false);
    expect(isDictionaryModeCandidate('太棒了！')).toBe(false);
    // fullwidth-style endings covered by 。？！
    expect(isDictionaryModeCandidate('好的。')).toBe(false);
  });

  it('treats mid-phrase non-terminal punctuation as dictionary-mode when short', () => {
    // apostrophe / hyphen / internal commas without terminal sentence punct
    expect(isDictionaryModeCandidate("don't")).toBe(true);
    expect(isDictionaryModeCandidate('self-aware')).toBe(true);
    expect(isDictionaryModeCandidate('well, okay')).toBe(true);
  });

  it('respects MAX_DICTIONARY_TOKENS boundary', () => {
    const atLimit = Array.from({ length: MAX_DICTIONARY_TOKENS }, (_, i) => `w${i}`).join(' ');
    const overLimit = Array.from(
      { length: MAX_DICTIONARY_TOKENS + 1 },
      (_, i) => `w${i}`,
    ).join(' ');
    expect(isDictionaryModeCandidate(atLimit)).toBe(true);
    expect(isDictionaryModeCandidate(overLimit)).toBe(false);
  });
});
