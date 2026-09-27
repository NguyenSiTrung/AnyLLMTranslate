import { describe, expect, it } from 'vitest';
import {
  generateSubtitleCacheKey,
  generateSubtitlePlusCacheKey,
  hashGlossary,
  type GlossarySnapshot,
  type PlusGlossarySnapshot,
} from '@/lib/subtitleCacheKey';
import type { ProfileKnobs } from '@/lib/subtitleProfiles';

const KNOBS: ProfileKnobs = {
  register: 'neutral',
  faithfulness: 'balanced',
  brevity: 'moderate',
  profanity: 'preserve',
};

const PLUS_SNAPSHOT: PlusGlossarySnapshot = {
  globalEntries: [{ source: 'Rabbit', target: 'Con thỏ' }],
  namedListId: 'cast',
  namedListEntries: [{ source: 'Alice', target: 'A-lít' }],
  frozenPairs: [{ source: 'Dumbledore', target: 'Cụ Dumbledore' }],
};

describe('generateSubtitlePlusCacheKey', () => {
  it('is deterministic', async () => {
    const a = await generateSubtitlePlusCacheKey('hello', 'en', 'vi', KNOBS, PLUS_SNAPSHOT);
    const b = await generateSubtitlePlusCacheKey('hello', 'en', 'vi', KNOBS, PLUS_SNAPSHOT);
    expect(a).toBe(b);
  });

  it('changes when a frozen target changes', async () => {
    const changed: PlusGlossarySnapshot = {
      ...PLUS_SNAPSHOT,
      frozenPairs: [{ source: 'Dumbledore', target: 'Thầy Dumbledore' }],
    };
    const a = await generateSubtitlePlusCacheKey('hello', 'en', 'vi', KNOBS, PLUS_SNAPSHOT);
    const b = await generateSubtitlePlusCacheKey('hello', 'en', 'vi', KNOBS, changed);
    expect(a).not.toBe(b);
  });

  it('never collides with the progressive key for the same inputs', async () => {
    const progressiveSnapshot: GlossarySnapshot = {
      globalEntries: PLUS_SNAPSHOT.globalEntries,
      properNouns: ['Dumbledore'],
      namedListId: PLUS_SNAPSHOT.namedListId,
      namedListEntries: PLUS_SNAPSHOT.namedListEntries,
    };
    const plus = await generateSubtitlePlusCacheKey('hello', 'en', 'vi', KNOBS, PLUS_SNAPSHOT);
    const progressive = await generateSubtitleCacheKey('hello', 'en', 'vi', KNOBS, progressiveSnapshot);
    expect(plus).not.toBe(progressive);
  });

  it('keeps the progressive glossary hash shape unchanged', () => {
    const snapshot: GlossarySnapshot = { globalEntries: [], properNouns: ['Alice'] };
    expect(hashGlossary(snapshot)).toBe('7b64b14d');
  });
});
