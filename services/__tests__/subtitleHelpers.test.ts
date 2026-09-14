/**
 * Tests for subtitle prompt building + response proper-noun extraction.
 */

import { describe, it, expect } from 'vitest';
import { buildSubtitleSystemPrompt } from '@/services/subtitlePrompt';
import { extractProperNouns } from '@/services/subtitleResponse';
import { PROFILE_PRESETS } from '@/lib/subtitleProfiles';

describe('buildSubtitleSystemPrompt named list', () => {
  it('orders the personal dictionary and omits it when absent', () => {
    const prompt = buildSubtitleSystemPrompt(
      'vi',
      PROFILE_PRESETS.media,
      'Translation Glossary (always use these translations):\n- "G" → "g"',
      'Previously translated names in this content (use these consistently):\n- "R" → "r"',
      'Personal dictionary "Pack" (always use these translations; do not alter):\n- "P" → "p"',
    );
    const iNamed = prompt.indexOf('Personal dictionary "Pack"');
    const iGlobal = prompt.indexOf('Translation Glossary');
    const iRolling = prompt.indexOf('Previously translated names');
    expect(iNamed).toBeGreaterThan(-1);
    expect(iNamed).toBeLessThan(iGlobal);
    expect(iGlobal).toBeLessThan(iRolling);
    const promptWithoutNamed = buildSubtitleSystemPrompt('vi', PROFILE_PRESETS.media);
    expect(promptWithoutNamed).not.toContain('Personal dictionary');
  });
});

describe('extractProperNouns', () => {
  it('extracts well-formed maps, ignores invalid/missing properNouns, and strips markdown fences and <think> blocks before parsing', () => {
    expect(
      extractProperNouns(
        JSON.stringify({
          translations: { s1: 'Hola' },
          properNouns: { John: 'Juan', MIT: 'MIT' },
        }),
      ),
    ).toEqual({ John: 'Juan', MIT: 'MIT' });

    const invalid = [
      JSON.stringify({ translations: { s1: 'Hola' } }),
      JSON.stringify({ translations: { s1: 'Hola' }, properNouns: 'not an object' }),
      JSON.stringify({ translations: { s1: 'Hola' }, properNouns: {} }),
      'not json at all',
    ];
    for (const response of invalid) {
      expect(extractProperNouns(response)).toBeUndefined();
    }

    const fenced =
      '```json\n' +
      JSON.stringify({
        translations: { s1: 'Hola' },
        properNouns: { John: 'Juan' },
      }) +
      '\n```';
    expect(extractProperNouns(fenced)).toEqual({ John: 'Juan' });

    const think =
      '<think>let me think</think>' +
      JSON.stringify({
        translations: { s1: 'Hola' },
        properNouns: { John: 'Juan' },
      });
    expect(extractProperNouns(think)).toEqual({ John: 'Juan' });
  });
});
