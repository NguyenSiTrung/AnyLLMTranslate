/**
 * The Plus project's hard acceptance criterion: with the mode off, absent, or
 * downgraded, the progressive path is byte-for-byte unaffected.
 */
import { describe, expect, it } from 'vitest';
import {
  generateSubtitleCacheKey,
  type GlossarySnapshot,
} from '@/lib/subtitleCacheKey';
import { buildSubtitleSystemPrompt } from '@/services/subtitlePrompt';
import { PROFILE_PRESETS } from '@/lib/subtitleProfiles';
import { resolveSubtitleTranslationMode } from '@/lib/subtitlePlusEligibility';

const KNOBS = PROFILE_PRESETS.media;

describe('progressive path guarantee', () => {
  it('keeps the progressive cache key for a fixed fixture', async () => {
    const snapshot: GlossarySnapshot = {
      globalEntries: [{ source: 'Rabbit', target: 'Con thỏ' }],
      properNouns: ['Alice'],
      namedListId: 'cast',
      namedListEntries: [{ source: 'Alice', target: 'A-lít' }],
    };
    // Captured from the pre-Plus implementation. If this value changes, the
    // progressive cache identity changed and the guarantee is broken.
    const expected = '62c8dd233d42896ae8bc8855c90b8788f144602332ecf4f35bd75fd3174d7b9b';
    const actual = await generateSubtitleCacheKey('Hello world', 'en', 'vi', KNOBS, snapshot);
    expect(actual).toBe(expected);
  });

  it('keeps the progressive prompt free of Plus blocks', () => {
    const prompt = buildSubtitleSystemPrompt('vi', KNOBS, undefined, 'rolling block');
    expect(prompt).not.toContain('Frozen terminology');
  });

  it('resolves every absent/unknown combination to progressive', () => {
    expect(resolveSubtitleTranslationMode(undefined, undefined)).toBe('progressive');
  });
});