import { describe, it, expect } from 'vitest';
import {
  reconcilePendingTranslatedTexts,
  sortCueTextsByPlaybackPriority,
} from '@/lib/subtitleTranslationPriority';
import type { SubtitleCue } from '@/types/subtitle';

describe('subtitleTranslationPriority', () => {
  describe('reconcilePendingTranslatedTexts', () => {
    it('removes pending texts that never received a translation', () => {
      const pending = new Set(['cached', 'in-flight', 'new']);
      const translated = new Map([
        ['cached', 'cached (vi)'],
      ]);

      reconcilePendingTranslatedTexts(pending, translated);

      expect([...pending]).toEqual(['cached']);
    });

    it('is a no-op when every pending text is translated', () => {
      const pending = new Set(['a', 'b']);
      const translated = new Map([
        ['a', 'a (vi)'],
        ['b', 'b (vi)'],
      ]);

      reconcilePendingTranslatedTexts(pending, translated);

      expect([...pending].sort()).toEqual(['a', 'b']);
    });
  });

  describe('sortCueTextsByPlaybackPriority', () => {
    const cues: SubtitleCue[] = [
      { startTime: 10, endTime: 11, text: 'past A' },
      { startTime: 20, endTime: 21, text: 'past B' },
      { startTime: 100, endTime: 101, text: 'near current' },
      { startTime: 110, endTime: 111, text: 'future A' },
      { startTime: 120, endTime: 121, text: 'future B' },
    ];

    it('puts current/future cues before past cues in the segment', () => {
      const texts = ['past A', 'future B', 'past B', 'near current', 'future A'];
      const sorted = sortCueTextsByPlaybackPriority(texts, cues, 100);

      expect(sorted.indexOf('near current')).toBeLessThan(sorted.indexOf('past A'));
      expect(sorted.indexOf('future A')).toBeLessThan(sorted.indexOf('past B'));
      expect(sorted.slice(0, 3)).toEqual(['near current', 'future A', 'future B']);
    });

    it('returns a single-element array unchanged', () => {
      expect(sortCueTextsByPlaybackPriority(['only'], cues, 50)).toEqual(['only']);
    });
  });
});