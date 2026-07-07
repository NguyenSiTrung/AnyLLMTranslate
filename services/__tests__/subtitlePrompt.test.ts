/**
 * Tests for the profile-driven subtitle system prompt builder.
 */
import { describe, it, expect } from 'vitest';
import { buildSubtitleSystemPrompt } from '@/services/subtitlePrompt';
import { PROFILE_PRESETS } from '@/lib/subtitleProfiles';

describe('buildSubtitleSystemPrompt — fixed content', () => {
  const prompt = buildSubtitleSystemPrompt('Vietnamese', PROFILE_PRESETS.media);

  it('identifies spoken-subtitle medium, injects target language, carries JSON contract, and omits web-page-only rules', () => {
    expect(prompt).toContain('subtitle translator');
    expect(prompt).toContain('spoken lines');
    expect(prompt).toContain('Vietnamese');
    expect(prompt).not.toContain('{{targetLanguage}}');
    expect(prompt).toContain('Respond ONLY with valid JSON');
    expect(prompt).toContain('"translations"');
    expect(prompt.toLowerCase()).not.toContain('html');
    expect(prompt.toLowerCase()).not.toContain('mathematical');
    expect(prompt.toLowerCase()).not.toContain('url');
  });
});

describe('buildSubtitleSystemPrompt — knob coverage', () => {
  const base = { register: 'neutral', faithfulness: 'balanced', brevity: 'relaxed', profanity: 'preserve' } as const;

  it('emits the expected instruction line for each non-default knob value', () => {
    const cases: ReadonlyArray<readonly [Partial<typeof base>, string]> = [
      [{ ...base, register: 'formal' }, 'formal, polite register'],
      [{ ...base, register: 'casual' }, 'how people actually talk'],
      [{ ...base, faithfulness: 'literal' }, 'precise, faithful translation'],
      [{ ...base, faithfulness: 'idiomatic' }, 'idiomatic, natural phrasing'],
      [{ ...base, brevity: 'terse' }, 'Be concise'],
      [{ ...base, profanity: 'soften' }, 'Soften strong profanity'],
      [{ ...base, profanity: 'remove' }, 'Remove strong profanity entirely'],
    ];
    for (const [profile, expectedLine] of cases) {
      expect(buildSubtitleSystemPrompt('vi', profile)).toContain(expectedLine);
    }
  });

  it('media (all defaults) emits no knob instruction lines', () => {
    const prompt = buildSubtitleSystemPrompt('vi', PROFILE_PRESETS.media);
    expect(prompt).not.toContain('how people actually talk');
    expect(prompt).not.toContain('precise, faithful translation');
    expect(prompt).not.toContain('idiomatic, natural phrasing');
    expect(prompt).not.toContain('Be concise');
    expect(prompt).not.toContain('profanity');
  });
});

describe('buildSubtitleSystemPrompt — glossary', () => {
  it('appends glossary block when provided', () => {
    const glossary = 'Translation Glossary (always use these translations):\n- "React" → "React"';
    const p = buildSubtitleSystemPrompt('vi', PROFILE_PRESETS.media, glossary);
    expect(p).toContain('Translation Glossary');
    expect(p).toContain('"React"');
  });

  it('omits glossary entirely when not provided', () => {
    const p = buildSubtitleSystemPrompt('vi', PROFILE_PRESETS.media);
    expect(p).not.toContain('Glossary');
  });
});

describe('buildSubtitleSystemPrompt — voice instruction', () => {
  it('includes the speaker prefix instruction', () => {
    const prompt = buildSubtitleSystemPrompt('vi', PROFILE_PRESETS.media);
    expect(prompt).toContain('[Speaker Name]');
    expect(prompt).toContain('who is speaking');
    expect(prompt).toContain('Do not translate or repeat the speaker name');
  });
});

describe('buildSubtitleSystemPrompt — rolling glossary', () => {
  it('appends rolling glossary block when provided', () => {
    const rolling = 'Previously translated names in this content (use these consistently):\n- "John" → "Juan"';
    const p = buildSubtitleSystemPrompt('vi', PROFILE_PRESETS.media, undefined, rolling);
    expect(p).toContain('Previously translated names');
    expect(p).toContain('"John" → "Juan"');
  });

  it('omits rolling glossary when not provided', () => {
    const p = buildSubtitleSystemPrompt('vi', PROFILE_PRESETS.media);
    expect(p).not.toContain('Previously translated names');
  });

  it('places rolling glossary after user glossary and before JSON contract', () => {
    const glossary = 'Translation Glossary (always use these translations):\n- "React" → "React"';
    const rolling = 'Previously translated names in this content (use these consistently):\n- "John" → "Juan"';
    const p = buildSubtitleSystemPrompt('vi', PROFILE_PRESETS.media, glossary, rolling);
    const glossaryIdx = p.indexOf('Translation Glossary');
    const rollingIdx = p.indexOf('Previously translated names');
    const contractIdx = p.indexOf('Respond ONLY with valid JSON');
    expect(glossaryIdx).toBeLessThan(rollingIdx);
    expect(rollingIdx).toBeLessThan(contractIdx);
  });
});

describe('buildSubtitleSystemPrompt — extended JSON contract', () => {
  it('mentions properNouns in the JSON contract', () => {
    const prompt = buildSubtitleSystemPrompt('vi', PROFILE_PRESETS.media);
    expect(prompt).toContain('properNouns');
  });
});
