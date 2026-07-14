import { describe, it, expect } from 'vitest';
import {
  detectPieceQualityIssues,
  detectBatchQualityIssues,
  countZTags,
} from '@/lib/translationQualityCheck';

describe('countZTags', () => {
  it('counts open tags', () => {
    expect(countZTags('Hello <z id="1">world</z> and <z id="2">x</z>')).toBe(2);
  });
});

describe('detectPieceQualityIssues', () => {
  it('flags source echo when languages differ', () => {
    const issues = detectPieceQualityIssues({
      id: 'p1',
      source: 'This is a long enough English sentence.',
      translated: 'This is a long enough English sentence.',
      sourceLanguage: 'en',
      targetLanguage: 'vi',
    });
    expect(issues.some((i) => i.kind === 'source_echo')).toBe(true);
  });

  it('flags dropped z tags', () => {
    const issues = detectPieceQualityIssues({
      id: 'p1',
      source: 'See <z id="1">docs</z> please',
      translated: 'Xem docs di',
      sourceLanguage: 'en',
      targetLanguage: 'vi',
    });
    expect(issues.some((i) => i.kind === 'dropped_z_tags')).toBe(true);
  });

  it('passes clean translation', () => {
    const issues = detectPieceQualityIssues({
      id: 'p1',
      source: 'Hello world today',
      translated: 'Xin chào thế giới hôm nay',
      sourceLanguage: 'en',
      targetLanguage: 'vi',
    });
    expect(issues).toEqual([]);
  });
});

describe('detectBatchQualityIssues', () => {
  it('scans all pieces', () => {
    const sources = new Map([
      ['a', 'This is a long enough English sentence.'],
      ['b', 'Short'],
    ]);
    const translations = new Map([
      ['a', 'This is a long enough English sentence.'],
      ['b', 'Ngắn'],
    ]);
    const issues = detectBatchQualityIssues(sources, translations, {
      sourceLanguage: 'en',
      targetLanguage: 'vi',
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.id).toBe('a');
  });
});
