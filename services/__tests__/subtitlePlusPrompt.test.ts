import { describe, expect, it } from 'vitest';
import { buildSubtitleSystemPrompt } from '@/services/subtitlePrompt';
import { PROFILE_PRESETS } from '@/lib/subtitleProfiles';

const KNOBS = PROFILE_PRESETS.media;
const FROZEN = 'Frozen terminology for this track (use these consistently):\n- "Alice" → "A-lít"';
const ROLLING = 'Previously translated names in this content (use these consistently):\n- "Bob" → "Bóp"';

describe('buildSubtitleSystemPrompt frozen slot', () => {
  it('omits the frozen block when not provided (progressive path unchanged)', () => {
    const prompt = buildSubtitleSystemPrompt('vi', KNOBS, undefined, ROLLING);
    expect(prompt).not.toContain('Frozen terminology');
  });

  it('places the frozen block after the rolling block and before the JSON contract', () => {
    const prompt = buildSubtitleSystemPrompt('vi', KNOBS, undefined, ROLLING, undefined, FROZEN);
    expect(prompt).toContain(FROZEN);
    expect(prompt.indexOf(FROZEN)).toBeGreaterThan(prompt.indexOf(ROLLING));
    expect(prompt.indexOf(FROZEN)).toBeLessThan(prompt.indexOf('Respond ONLY with valid JSON'));
  });

  it('produces an identical string for the 5-argument call', () => {
    const five = buildSubtitleSystemPrompt('vi', KNOBS, 'G', ROLLING, 'N');
    const six = buildSubtitleSystemPrompt('vi', KNOBS, 'G', ROLLING, 'N', undefined);
    expect(six).toBe(five);
  });

  it('matches the exact pre-change output for progressive calls (golden)', () => {
    // Golden strings captured from buildSubtitleSystemPrompt at HEAD~ (before
    // the frozenGlossaryBlock parameter existed), proving the progressive path
    // is byte-for-byte unchanged when the new argument is absent.
    const GOLDEN_NO_GLOSSARY =
      'You are a professional subtitle translator for film, TV, and video.\n' +
      'The texts are short spoken lines, not web prose or documents. Translate them to Vietnamese (vi).\n' +
      '\n' +
      'Subtitle rules:\n' +
      '- Translate as natural spoken dialogue that a viewer reads at a glance while listening.\n' +
      '- Preserve the meaning and tone of the original line.\n' +
      '- Keep each translation roughly the same length as the source so it fits on screen.\n' +
      '- Maintain continuity of names and references across lines.\n' +
      '- When a line is prefixed with [Speaker Name], that identifies who is speaking. Use this to maintain dialogue flow and speaker-appropriate tone. Do not translate or repeat the speaker name in the output.\n' +
      '\n' +
      'Respond ONLY with valid JSON in this exact format: {"translations": {"id1": "...", "id2": "..."}, "properNouns": {"SourceName": "TranslatedName"}}\n' +
      'The keys in "translations" must exactly match the input keys.\n' +
      'In "properNouns", include proper nouns (character names, place names, brands, technical terms) from the source texts and their translations.';

    const GOLDEN_FIVE =
      'You are a professional subtitle translator for film, TV, and video.\n' +
      'The texts are short spoken lines, not web prose or documents. Translate them to Vietnamese (vi).\n' +
      '\n' +
      'Subtitle rules:\n' +
      '- Translate as natural spoken dialogue that a viewer reads at a glance while listening.\n' +
      '- Preserve the meaning and tone of the original line.\n' +
      '- Keep each translation roughly the same length as the source so it fits on screen.\n' +
      '- Maintain continuity of names and references across lines.\n' +
      '- When a line is prefixed with [Speaker Name], that identifies who is speaking. Use this to maintain dialogue flow and speaker-appropriate tone. Do not translate or repeat the speaker name in the output.\n' +
      '\n' +
      'N\n' +
      '\n' +
      'G\n' +
      '\n' +
      'ROLLING\n' +
      '\n' +
      'Respond ONLY with valid JSON in this exact format: {"translations": {"id1": "...", "id2": "..."}, "properNouns": {"SourceName": "TranslatedName"}}\n' +
      'The keys in "translations" must exactly match the input keys.\n' +
      'In "properNouns", include proper nouns (character names, place names, brands, technical terms) from the source texts and their translations.';

    expect(buildSubtitleSystemPrompt('vi', KNOBS)).toBe(GOLDEN_NO_GLOSSARY);
    expect(buildSubtitleSystemPrompt('vi', KNOBS, 'G', 'ROLLING', 'N')).toBe(GOLDEN_FIVE);
  });
});
