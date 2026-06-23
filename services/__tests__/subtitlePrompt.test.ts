/**
 * Tests for the profile-driven subtitle system prompt builder.
 */
import { describe, it, expect } from 'vitest';
import { buildSubtitleSystemPrompt } from '@/services/subtitlePrompt';
import { PROFILE_PRESETS } from '@/lib/subtitleProfiles';

describe('buildSubtitleSystemPrompt — fixed content', () => {
  const prompt = buildSubtitleSystemPrompt('Vietnamese', PROFILE_PRESETS.media);

  it('identifies the medium as spoken subtitles', () => {
    expect(prompt).toContain('subtitle translator');
    expect(prompt).toContain('spoken lines');
  });

  it('injects the target language and drops the placeholder', () => {
    expect(prompt).toContain('Vietnamese');
    expect(prompt).not.toContain('{{targetLanguage}}');
  });

  it('always carries the JSON output contract', () => {
    expect(prompt).toContain('Respond ONLY with valid JSON');
    expect(prompt).toContain('"translations"');
  });

  it('does not leak web-page-only rules', () => {
    expect(prompt.toLowerCase()).not.toContain('html');
    expect(prompt.toLowerCase()).not.toContain('mathematical');
    expect(prompt.toLowerCase()).not.toContain('url');
  });
});

describe('buildSubtitleSystemPrompt — per-profile knob instructions', () => {
  it('cinematic emits casual + idiomatic', () => {
    const prompt = buildSubtitleSystemPrompt('vi', PROFILE_PRESETS.cinematic);
    expect(prompt).toContain('how people actually talk');
    expect(prompt).toContain('idiomatic, natural phrasing');
  });

  it('educational emits literal', () => {
    const prompt = buildSubtitleSystemPrompt('vi', PROFILE_PRESETS.educational);
    expect(prompt).toContain('precise, faithful translation');
    // educational defaults are neutral/balanced/relaxed/preserve → those lines absent
    expect(prompt).not.toContain('how people actually talk');
    expect(prompt).not.toContain('idiomatic, natural phrasing');
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

describe('buildSubtitleSystemPrompt — knob coverage', () => {
  const base = { register: 'neutral', faithfulness: 'balanced', brevity: 'relaxed', profanity: 'preserve' } as const;

  it('register: formal → formal line', () => {
    const p = buildSubtitleSystemPrompt('vi', { ...base, register: 'formal' });
    expect(p).toContain('formal, polite register');
  });

  it('register: casual → casual line', () => {
    const p = buildSubtitleSystemPrompt('vi', { ...base, register: 'casual' });
    expect(p).toContain('how people actually talk');
  });

  it('faithfulness: literal → literal line', () => {
    const p = buildSubtitleSystemPrompt('vi', { ...base, faithfulness: 'literal' });
    expect(p).toContain('precise, faithful translation');
  });

  it('faithfulness: idiomatic → idiomatic line', () => {
    const p = buildSubtitleSystemPrompt('vi', { ...base, faithfulness: 'idiomatic' });
    expect(p).toContain('idiomatic, natural phrasing');
  });

  it('brevity: terse → concise line', () => {
    const p = buildSubtitleSystemPrompt('vi', { ...base, brevity: 'terse' });
    expect(p).toContain('Be concise');
  });

  it('profanity: soften → soften line', () => {
    const p = buildSubtitleSystemPrompt('vi', { ...base, profanity: 'soften' });
    expect(p).toContain('Soften strong profanity');
  });

  it('profanity: remove → remove line', () => {
    const p = buildSubtitleSystemPrompt('vi', { ...base, profanity: 'remove' });
    expect(p).toContain('Remove strong profanity entirely');
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
