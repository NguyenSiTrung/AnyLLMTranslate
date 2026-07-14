import { describe, it, expect } from 'vitest';
import {
  SELECTION_DICTIONARY_SYSTEM_TEMPLATE,
  SELECTION_DICTIONARY_USER_TEMPLATE,
  buildSelectionDictionarySystemPrompt,
  buildSelectionDictionaryUserPrompt,
} from '@/lib/selectionDictionaryPrompt';

describe('selection dictionary prompts', () => {
  it('templates and builders substitute from/to/context/text without page-prompt placeholders', () => {
    expect(SELECTION_DICTIONARY_SYSTEM_TEMPLATE).toContain('{{from}}');
    expect(SELECTION_DICTIONARY_SYSTEM_TEMPLATE).toContain('{{to}}');
    expect(SELECTION_DICTIONARY_SYSTEM_TEMPLATE).toContain('{{context_text}}');
    expect(SELECTION_DICTIONARY_SYSTEM_TEMPLATE).toContain('# Role Definition');
    expect(SELECTION_DICTIONARY_SYSTEM_TEMPLATE).toContain('"phonetic"');
    expect(SELECTION_DICTIONARY_SYSTEM_TEMPLATE).toContain('"definitions"');
    expect(SELECTION_DICTIONARY_SYSTEM_TEMPLATE).toContain('"translation"');
    expect(SELECTION_DICTIONARY_SYSTEM_TEMPLATE).not.toContain('{{targetLanguage}}');
    expect(SELECTION_DICTIONARY_SYSTEM_TEMPLATE).not.toContain('{{glossary}}');
    expect(SELECTION_DICTIONARY_USER_TEMPLATE).toContain('{{text}}');
    expect(SELECTION_DICTIONARY_USER_TEMPLATE).toContain('【Content to Translate】');

    const withCtx = buildSelectionDictionarySystemPrompt({
      from: 'English',
      to: 'Chinese',
      text: 'hello',
      contextText: 'She said hello to the guests.',
    });
    expect(withCtx).toContain('translating from English into Chinese');
    expect(withCtx).toContain('【Current Context】: "She said hello to the guests."');
    expect(withCtx).not.toContain('{{from}}');
    expect(withCtx).not.toContain('{{context_text}}');

    const missing = buildSelectionDictionarySystemPrompt({
      from: 'Japanese',
      to: 'English',
      text: 'こんにちは',
    });
    expect(missing).toContain('【Current Context】: ""');

    expect(buildSelectionDictionaryUserPrompt({ text: 'serendipity' })).toBe(
      `【Content to Translate】:\n"serendipity"`,
    );
    expect(buildSelectionDictionaryUserPrompt({ text: '' })).toBe(`【Content to Translate】:\n""`);
    expect(
      buildSelectionDictionaryUserPrompt({ text: 'say "hello" & goodbye' }),
    ).toContain('"say "hello" & goodbye"');
  });
});
