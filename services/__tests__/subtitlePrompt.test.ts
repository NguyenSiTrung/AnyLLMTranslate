import { describe, it, expect } from 'vitest';
import { buildSubtitleSystemPrompt } from '@/services/subtitlePrompt';
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
