import { describe, it, expect } from 'vitest';
import { splitPiecesIntoBatches, dedupPiecesByText } from '../textBatching';

describe('textBatching', () => {
  describe('splitPiecesIntoBatches', () => {
    it('splits by count and char budgets; emits oversized singles; empty → []', () => {
      const byCount = splitPiecesIntoBatches(
        [
          { id: '1', text: 'a' },
          { id: '2', text: 'b' },
          { id: '3', text: 'c' },
          { id: '4', text: 'd' },
          { id: '5', text: 'e' },
        ],
        { maxTextGroupLengthPerRequest: 2, maxTextLengthPerRequest: 10000 },
      );
      expect(byCount).toHaveLength(3);

      const byChars = splitPiecesIntoBatches(
        [
          { id: '1', text: 'aaaaa' },
          { id: '2', text: 'bbbbb' },
          { id: '3', text: 'ccccc' },
        ],
        { maxTextGroupLengthPerRequest: 10, maxTextLengthPerRequest: 8 },
      );
      expect(byChars).toHaveLength(3);

      const oversized = splitPiecesIntoBatches([{ id: 'big', text: 'x'.repeat(5000) }], {
        maxTextGroupLengthPerRequest: 4,
        maxTextLengthPerRequest: 2000,
      });
      expect(oversized).toHaveLength(1);

      const unlimited = splitPiecesIntoBatches(
        [
          { id: '1', text: 'a' },
          { id: '2', text: 'b'.repeat(10000) },
        ],
        { maxTextGroupLengthPerRequest: 0, maxTextLengthPerRequest: 0 },
      );
      expect(unlimited).toHaveLength(1);

      expect(
        splitPiecesIntoBatches([], {
          maxTextGroupLengthPerRequest: 4,
          maxTextLengthPerRequest: 2000,
        }),
      ).toEqual([]);
    });
  });

  describe('dedupPiecesByText', () => {
    it('dedups case-sensitively and maps dupes to the first id', () => {
      const { deduped, dupes } = dedupPiecesByText([
        { id: '1', text: 'hello' },
        { id: '2', text: 'hello' },
        { id: '3', text: 'world' },
        { id: '4', text: 'Hello' },
      ]);
      expect(deduped.map((p) => p.id)).toEqual(['1', '3', '4']);
      expect(dupes.get('2')).toBe('1');
      expect(dedupPiecesByText([]).deduped).toEqual([]);
    });
  });
});
