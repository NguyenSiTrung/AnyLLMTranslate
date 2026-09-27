import { describe, expect, it } from 'vitest';
import { canonicalizeCueCorpus, contentHash, scopedFilmGlossaryKey } from '@/lib/subtitleFilmGlossary';
import type { ProfileKnobs } from '@/lib/subtitleProfiles';
import type { SubtitleCue } from '@/types/subtitle';

const KNOBS: ProfileKnobs = {
  register: 'neutral',
  faithfulness: 'balanced',
  brevity: 'moderate',
  profanity: 'preserve',
};

const CUES: SubtitleCue[] = [
  { startTime: 0, endTime: 2, text: 'Alice meets the Rabbit' },
  { startTime: 2, endTime: 4, text: 'Alice meets the Rabbit' },
];

describe('film glossary canonicalization', () => {
  it('is order-insensitive and dedupes', () => {
    const reordered: SubtitleCue[] = [
      { startTime: 4, endTime: 6, text: 'alice meets the rabbit ' },
      { startTime: 0, endTime: 2, text: 'Alice meets the Rabbit' },
    ];
    expect(canonicalizeCueCorpus(reordered)).toBe(canonicalizeCueCorpus(CUES));
  });
});

describe('scopedFilmGlossaryKey', () => {
  it('is stable for the same corpus, language, and knobs', async () => {
    const hash = await contentHash(CUES);
    expect(scopedFilmGlossaryKey(hash, 'vi', KNOBS)).toBe(scopedFilmGlossaryKey(hash, 'vi', KNOBS));
  });

  it('changes when the target language changes', async () => {
    const hash = await contentHash(CUES);
    expect(scopedFilmGlossaryKey(hash, 'vi', KNOBS)).not.toBe(scopedFilmGlossaryKey(hash, 'ja', KNOBS));
  });

  it('changes when a knob changes', async () => {
    const hash = await contentHash(CUES);
    const literal = { ...KNOBS, faithfulness: 'literal' as const };
    expect(scopedFilmGlossaryKey(hash, 'vi', KNOBS)).not.toBe(scopedFilmGlossaryKey(hash, 'vi', literal));
  });
});