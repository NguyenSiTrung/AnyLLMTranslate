import { describe, it, expect } from 'vitest';
import {
  detectPieceQualityIssues,
  detectBatchQualityIssues,
  countZTags,
  validateRichTranslation,
  findMissingTranslationIds,
  areZTagsBalanced,
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

  it('FR-16: validates rich token balance, ids, allowed tags, incomplete maps', () => {
    expect(areZTagsBalanced('<z id="1">a</z>')).toBe(true);
    expect(areZTagsBalanced('<z id="1">a')).toBe(false);

    const unbalanced = validateRichTranslation({
      id: 'r1',
      source: 'See <z id="1">docs</z>',
      translated: 'Xem <z id="1">docs',
    });
    expect(unbalanced.some((i) => i.kind === 'unbalanced_z_tags')).toBe(true);

    const unknownId = validateRichTranslation({
      id: 'r2',
      source: 'See <z id="1">docs</z>',
      translated: 'Xem <z id="9">docs</z>',
    });
    expect(unknownId.some((i) => i.kind === 'unknown_z_id')).toBe(true);

    const badTag = validateRichTranslation({
      id: 'r3',
      source: 'See <z id="1">docs</z>',
      translated: 'Xem <script>x</script> <z id="1">docs</z>',
    });
    expect(badTag.some((i) => i.kind === 'disallowed_tag')).toBe(true);

    expect(findMissingTranslationIds(['a', 'b', 'c'], ['a', 'c'])).toEqual(['b']);
    expect(findMissingTranslationIds(['a'], ['a', 'b'])).toEqual([]);
  });
});
