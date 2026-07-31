/**
 * Subtitle cache-key builder: knobs + glossary + deterministic hex digest.
 */
import { describe, it, expect } from 'vitest';
import {
  hashKnobs,
  hashGlossary,
  generateSubtitleCacheKey,
  type GlossarySnapshot,
} from '@/lib/subtitleCacheKey';
import type { ProfileKnobs } from '@/lib/subtitleProfiles';

const KNOBS_A: ProfileKnobs = {
  register: 'neutral',
  faithfulness: 'literal',
  brevity: 'relaxed',
  profanity: 'preserve',
};
const KNOBS_B: ProfileKnobs = {
  register: 'casual',
  faithfulness: 'idiomatic',
  brevity: 'moderate',
  profanity: 'preserve',
};
const EMPTY_GLOSSARY: GlossarySnapshot = { globalEntries: [], properNouns: [] };

describe('subtitleCacheKey', () => {
  it('is deterministic, order-independent, sensitive to content/named-list, and generates SHA-256 cache keys', async () => {
    expect(hashKnobs(KNOBS_A)).toBe(hashKnobs(KNOBS_A));
    expect(hashKnobs(KNOBS_A)).not.toBe(hashKnobs(KNOBS_B));

    const a: GlossarySnapshot = {
      globalEntries: [
        { source: 'x', target: 'y' },
        { source: 'p', target: 'q' },
      ],
      properNouns: ['Alice', 'Bob'],
    };
    const b: GlossarySnapshot = {
      globalEntries: [
        { source: 'p', target: 'q' },
        { source: 'x', target: 'y' },
      ],
      properNouns: ['Bob', 'Alice'],
    };
    expect(hashGlossary(a)).toBe(hashGlossary(b));
    expect(hashGlossary(EMPTY_GLOSSARY)).not.toBe(
      hashGlossary({ globalEntries: [{ source: 'AI', target: 'x' }], properNouns: [] }),
    );
    const base: GlossarySnapshot = { globalEntries: [], properNouns: [] };
    const withId: GlossarySnapshot = {
      ...base,
      namedListId: 'L1',
      namedListEntries: [{ source: 'A', target: 'B' }],
    };
    const withId2: GlossarySnapshot = {
      ...base,
      namedListId: 'L2',
      namedListEntries: [{ source: 'A', target: 'B' }],
    };
    const edited: GlossarySnapshot = {
      ...base,
      namedListId: 'L1',
      namedListEntries: [{ source: 'A', target: 'C' }],
    };
    expect(hashGlossary(withId)).not.toBe(hashGlossary(base));
    expect(hashGlossary(withId)).not.toBe(hashGlossary(withId2));
    expect(hashGlossary(withId)).not.toBe(hashGlossary(edited));
            expect(hashGlossary(base)).toBe(
      hashGlossary({ ...base, namedListId: null, namedListEntries: [] }),
    );

    // namedList entry order is order-insensitive
    const orderA: GlossarySnapshot = {
      ...base,
      namedListId: 'L1',
      namedListEntries: [
        { source: 'p', target: 'q' },
        { source: 'a', target: 'b' },
      ],
    };
    const orderB: GlossarySnapshot = {
      ...base,
      namedListId: 'L1',
      namedListEntries: [
        { source: 'a', target: 'b' },
        { source: 'p', target: 'q' },
      ],
    };
    expect(hashGlossary(orderA)).toBe(hashGlossary(orderB));

    // is deterministic hex SHA-256 and differs by knobs/glossary/text
    const k1 = await generateSubtitleCacheKey('Hello', 'en', 'vi', KNOBS_A, EMPTY_GLOSSARY);
    const k2 = await generateSubtitleCacheKey('Hello', 'en', 'vi', KNOBS_A, EMPTY_GLOSSARY);
    expect(k1).toBe(k2);
    expect(k1).toMatch(/^[0-9a-f]{64}$/);

    expect(await generateSubtitleCacheKey('Hello', 'en', 'vi', KNOBS_B, EMPTY_GLOSSARY)).not.toBe(
      k1,
    );
    expect(
      await generateSubtitleCacheKey('Hello', 'en', 'vi', KNOBS_A, {
        globalEntries: [{ source: 'AI', target: 'trí tuệ nhân tạo' }],
        properNouns: ['Alice'],
      }),
    ).not.toBe(k1);
    expect(await generateSubtitleCacheKey('World', 'en', 'vi', KNOBS_A, EMPTY_GLOSSARY)).not.toBe(
      k1,
    );
  });
});
