import { describe, it, expect } from 'vitest';
import { splitPiecesIntoBatches, dedupPiecesByText } from '../textBatching';

describe('textBatching', () => {
  describe('splitPiecesIntoBatches', () => {
    it('returns a single batch when all pieces fit within both budgets', () => {
      const pieces = [
        { id: 'a', text: 'hello' },
        { id: 'b', text: 'world' },
      ];
      const batches = splitPiecesIntoBatches(pieces, {
        maxTextGroupLengthPerRequest: 4,
        maxTextLengthPerRequest: 2000,
      });
      expect(batches).toHaveLength(1);
      expect(batches[0].map((p) => p.id)).toEqual(['a', 'b']);
    });

    it('splits when piece count exceeds maxTextGroupLengthPerRequest', () => {
      const pieces = [
        { id: '1', text: 'a' },
        { id: '2', text: 'b' },
        { id: '3', text: 'c' },
        { id: '4', text: 'd' },
        { id: '5', text: 'e' },
      ];
      const batches = splitPiecesIntoBatches(pieces, {
        maxTextGroupLengthPerRequest: 2,
        maxTextLengthPerRequest: 10000,
      });
      expect(batches).toHaveLength(3);
      expect(batches[0].map((p) => p.id)).toEqual(['1', '2']);
      expect(batches[1].map((p) => p.id)).toEqual(['3', '4']);
      expect(batches[2].map((p) => p.id)).toEqual(['5']);
    });

    it('splits when cumulative char length exceeds maxTextLengthPerRequest', () => {
      const pieces = [
        { id: '1', text: 'aaaaa' }, // 5
        { id: '2', text: 'bbbbb' }, // 5 → running total 10 > 8
        { id: '3', text: 'ccccc' },
      ];
      const batches = splitPiecesIntoBatches(pieces, {
        maxTextGroupLengthPerRequest: 10,
        maxTextLengthPerRequest: 8,
      });
      // First batch holds piece 1 (5 chars); piece 2 would push total to 10 > 8.
      expect(batches).toHaveLength(3);
      expect(batches[0].map((p) => p.id)).toEqual(['1']);
      expect(batches[1].map((p) => p.id)).toEqual(['2']);
      expect(batches[2].map((p) => p.id)).toEqual(['3']);
    });

    it('always emits a piece even if a single piece exceeds the char budget', () => {
      const pieces = [{ id: 'big', text: 'x'.repeat(5000) }];
      const batches = splitPiecesIntoBatches(pieces, {
        maxTextGroupLengthPerRequest: 4,
        maxTextLengthPerRequest: 2000,
      });
      // Don't drop content — emit a singleton batch for the oversized piece.
      expect(batches).toHaveLength(1);
      expect(batches[0][0].id).toBe('big');
    });

    it('treats zero budgets as unlimited (one batch)', () => {
      const pieces = [
        { id: '1', text: 'a' },
        { id: '2', text: 'b'.repeat(10000) },
      ];
      const batches = splitPiecesIntoBatches(pieces, {
        maxTextGroupLengthPerRequest: 0,
        maxTextLengthPerRequest: 0,
      });
      expect(batches).toHaveLength(1);
      expect(batches[0]).toHaveLength(2);
    });

    it('returns empty array for empty input', () => {
      expect(
        splitPiecesIntoBatches([], {
          maxTextGroupLengthPerRequest: 4,
          maxTextLengthPerRequest: 2000,
        }),
      ).toEqual([]);
    });

    it('handles a mix of count-limit and char-limit correctly', () => {
      const pieces = [
        { id: '1', text: 'a' },
        { id: '2', text: 'b' },
        { id: '3', text: 'c' },
        { id: '4', text: 'd' },
      ];
      const batches = splitPiecesIntoBatches(pieces, {
        maxTextGroupLengthPerRequest: 2,
        maxTextLengthPerRequest: 2,
      });
      // Group limit = 2, char limit = 2 → batch size 2 pieces (2 chars) exactly.
      expect(batches).toHaveLength(2);
      expect(batches[0].map((p) => p.id)).toEqual(['1', '2']);
      expect(batches[1].map((p) => p.id)).toEqual(['3', '4']);
    });
  });

  describe('dedupPiecesByText', () => {
    it('removes duplicate texts keeping the first occurrence', () => {
      const pieces = [
        { id: '1', text: 'hello' },
        { id: '2', text: 'hello' },
        { id: '3', text: 'world' },
      ];
      const { deduped, dupes } = dedupPiecesByText(pieces);
      expect(deduped.map((p) => p.id)).toEqual(['1', '3']);
      // dupes maps id → the canonical id whose translation it should adopt.
      expect(dupes.get('2')).toBe('1');
    });

    it('returns identity mapping for unique pieces', () => {
      const pieces = [
        { id: 'a', text: 'x' },
        { id: 'b', text: 'y' },
      ];
      const { deduped, dupes } = dedupPiecesByText(pieces);
      expect(deduped.map((p) => p.id)).toEqual(['a', 'b']);
      expect(dupes.size).toBe(0);
    });

    it('handles empty input', () => {
      const { deduped, dupes } = dedupPiecesByText([]);
      expect(deduped).toEqual([]);
      expect(dupes.size).toBe(0);
    });

    it('is case-sensitive (Hello != hello)', () => {
      const pieces = [
        { id: '1', text: 'Hello' },
        { id: '2', text: 'hello' },
      ];
      const { deduped } = dedupPiecesByText(pieces);
      expect(deduped).toHaveLength(2);
    });
  });
});
