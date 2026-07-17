import { describe, it, expect } from 'vitest';
import {
  detectPieceQualityIssues,
  detectBatchQualityIssues,
  countZTags,
} from '@/lib/translationQualityCheck';

describe('translationQualityCheck', () => {
  it('counts z tags, detects echo/dropped tags, and batch-scans pieces', () => {
    expect(countZTags('Hello <z id="1">world</z> and <z id="2">x</z>')).toBe(2);

    expect(
      detectPieceQualityIssues({
        id: 'p1',
        source: 'This is a long enough English sentence.',
        translated: 'This is a long enough English sentence.',
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      }).some((i) => i.kind === 'source_echo'),
    ).toBe(true);

    expect(
      detectPieceQualityIssues({
        id: 'p1',
        source: 'See <z id="1">docs</z> please',
        translated: 'Xem docs di',
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      }).some((i) => i.kind === 'dropped_z_tags'),
    ).toBe(true);

    expect(
      detectPieceQualityIssues({
        id: 'p1',
        source: 'Hello world today',
        translated: 'Xin chào thế giới hôm nay',
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      }),
    ).toEqual([]);

    const issues = detectBatchQualityIssues(
      new Map([
        ['a', 'This is a long enough English sentence.'],
        ['b', 'Short'],
      ]),
      new Map([
        ['a', 'This is a long enough English sentence.'],
        ['b', 'Ngắn'],
      ]),
      { sourceLanguage: 'en', targetLanguage: 'vi' },
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.id).toBe('a');
  });
});
