import { describe, it, expect } from 'vitest';
import {
  SELECTION_DICTIONARY_SYSTEM_TEMPLATE,
  SELECTION_DICTIONARY_USER_TEMPLATE,
  buildSelectionDictionarySystemPrompt,
  buildSelectionDictionaryUserPrompt,
} from '@/lib/selectionDictionaryPrompt';

describe('SELECTION_DICTIONARY_SYSTEM_TEMPLATE', () => {
  it('contains required placeholders and structure markers', () => {
    expect(SELECTION_DICTIONARY_SYSTEM_TEMPLATE).toContain('{{from}}');
    expect(SELECTION_DICTIONARY_SYSTEM_TEMPLATE).toContain('{{to}}');
    expect(SELECTION_DICTIONARY_SYSTEM_TEMPLATE).toContain('{{context_text}}');
    expect(SELECTION_DICTIONARY_SYSTEM_TEMPLATE).toContain('# Role Definition');
    expect(SELECTION_DICTIONARY_SYSTEM_TEMPLATE).toContain('# Core Capabilities');
    expect(SELECTION_DICTIONARY_SYSTEM_TEMPLATE).toContain('# Translation Rules');
    expect(SELECTION_DICTIONARY_SYSTEM_TEMPLATE).toContain('# Output Examples');
    expect(SELECTION_DICTIONARY_SYSTEM_TEMPLATE).toContain('【Word Example】');
    expect(SELECTION_DICTIONARY_SYSTEM_TEMPLATE).toContain('【Sentence Example】');
    expect(SELECTION_DICTIONARY_SYSTEM_TEMPLATE).toContain('"phonetic"');
    expect(SELECTION_DICTIONARY_SYSTEM_TEMPLATE).toContain('"definitions"');
    expect(SELECTION_DICTIONARY_SYSTEM_TEMPLATE).toContain('"translation"');
    expect(SELECTION_DICTIONARY_SYSTEM_TEMPLATE).toContain('"contextual_analysis"');
  });

  it('does not leave page/subtitle-style placeholders', () => {
    expect(SELECTION_DICTIONARY_SYSTEM_TEMPLATE).not.toContain('{{targetLanguage}}');
    expect(SELECTION_DICTIONARY_SYSTEM_TEMPLATE).not.toContain('{{glossary}}');
  });
});

describe('SELECTION_DICTIONARY_USER_TEMPLATE', () => {
  it('contains text placeholder and content marker', () => {
    expect(SELECTION_DICTIONARY_USER_TEMPLATE).toContain('{{text}}');
    expect(SELECTION_DICTIONARY_USER_TEMPLATE).toContain('【Content to Translate】');
  });
});

describe('buildSelectionDictionarySystemPrompt', () => {
  it('substitutes from, to, and context_text', () => {
    const prompt = buildSelectionDictionarySystemPrompt({
      from: 'English',
      to: 'Chinese',
      text: 'hello',
      contextText: 'She said hello to the guests.',
    });

    expect(prompt).toContain('translating from English into Chinese');
    expect(prompt).toContain('【Current Context】: "She said hello to the guests."');
    expect(prompt).toContain('Source language is English; target language is Chinese');
    expect(prompt).toContain(
      'must be entirely in the target language Chinese',
    );
    // no leftover placeholders
    expect(prompt).not.toContain('{{from}}');
    expect(prompt).not.toContain('{{to}}');
    expect(prompt).not.toContain('{{context_text}}');
  });

  it('uses empty string for missing contextText', () => {
    const prompt = buildSelectionDictionarySystemPrompt({
      from: 'Japanese',
      to: 'English',
      text: 'こんにちは',
    });

    expect(prompt).toContain('【Current Context】: ""');
    expect(prompt).not.toContain('{{context_text}}');
    expect(prompt).toContain('translating from Japanese into English');
  });

  it('uses empty string when contextText is explicitly undefined', () => {
    const prompt = buildSelectionDictionarySystemPrompt({
      from: 'French',
      to: 'Spanish',
      text: 'bonjour',
      contextText: undefined,
    });

    expect(prompt).toContain('【Current Context】: ""');
    expect(prompt).not.toContain('{{context_text}}');
  });

  it('replaces every occurrence of multi-use placeholders', () => {
    const prompt = buildSelectionDictionarySystemPrompt({
      from: 'English',
      to: 'Vietnamese',
      text: 'run',
      contextText: 'I run every morning.',
    });

    // {{from}} and {{to}} appear multiple times in the template
    expect(prompt).not.toContain('{{from}}');
    expect(prompt).not.toContain('{{to}}');
    expect(prompt).toContain('source language English');
    expect(prompt).toContain('target language Vietnamese');
    expect(prompt).toContain('must use Vietnamese language');
  });

  it('preserves structure markers after substitution', () => {
    const prompt = buildSelectionDictionarySystemPrompt({
      from: 'English',
      to: 'Chinese',
      text: 'test',
      contextText: 'ctx',
    });

    expect(prompt).toContain('# Role Definition');
    expect(prompt).toContain('# Strict Prohibitions');
    expect(prompt).toContain('【Word Example】');
    expect(prompt).toContain('【Sentence Example】');
  });
});

describe('buildSelectionDictionaryUserPrompt', () => {
  it('substitutes the selection text', () => {
    const prompt = buildSelectionDictionaryUserPrompt({ text: 'serendipity' });
    expect(prompt).toBe(`【Content to Translate】:\n"serendipity"`);
    expect(prompt).not.toContain('{{text}}');
  });

  it('handles empty text', () => {
    const prompt = buildSelectionDictionaryUserPrompt({ text: '' });
    expect(prompt).toBe(`【Content to Translate】:\n""`);
  });

  it('preserves quotes and special characters in text', () => {
    const prompt = buildSelectionDictionaryUserPrompt({
      text: 'say "hello" & goodbye',
    });
    expect(prompt).toContain('"say "hello" & goodbye"');
  });
});

describe('isolation from page prompts', () => {
  it('builds prompts without importing services/base page system prompt module', async () => {
    // Dynamic import of this module only — no services/base dependency.
    const mod = await import('@/lib/selectionDictionaryPrompt');
    expect(typeof mod.buildSelectionDictionarySystemPrompt).toBe('function');
    expect(typeof mod.buildSelectionDictionaryUserPrompt).toBe('function');
    expect(typeof mod.SELECTION_DICTIONARY_SYSTEM_TEMPLATE).toBe('string');
    expect(typeof mod.SELECTION_DICTIONARY_USER_TEMPLATE).toBe('string');

    const system = mod.buildSelectionDictionarySystemPrompt({
      from: 'English',
      to: 'Chinese',
      text: 'hello',
    });
    const user = mod.buildSelectionDictionaryUserPrompt({ text: 'hello' });

    // Page/subtitle default markers must not appear
    expect(system).not.toContain('{{targetLanguage}}');
    expect(system).not.toContain('{{glossary}}');
    expect(user).not.toContain('{{targetLanguage}}');
  });
});
