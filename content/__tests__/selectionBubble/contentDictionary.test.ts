/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { buildDictionaryContent } from '@/content/selectionBubble/contentDictionary';

describe('buildDictionaryContent', () => {
  it('renders section labels, word, phonetic, pos, translation, context', () => {
    const el = buildDictionaryContent(
      'hello',
      {
        phonetic: '/həˈloʊ/',
        definitions: [
          {
            pos: 'excl.',
            meaning: 'xin chào',
            example: { source: 'Hello!', target: 'Xin chào!' },
          },
        ],
        translation: 'xin chào',
        contextualAnalysis: 'A greeting.',
      },
      'xin chào',
    );
    expect(el.className).toContain('anyllm-word-dictionary');
    expect(el.querySelector('.anyllm-word-dictionary-word')?.textContent).toBe('hello');
    expect(el.querySelector('.anyllm-word-dictionary-phonetic')?.textContent).toBe('/həˈloʊ/');
    expect(el.querySelector('.anyllm-word-dictionary-pos')?.textContent).toBe('excl.');
    expect(el.querySelector('.anyllm-word-dictionary-translation')?.textContent).toBe(
      'xin chào',
    );
    expect(el.querySelector('.anyllm-word-dictionary-context')?.textContent).toContain(
      'greeting',
    );
    expect(el.textContent).toMatch(/Definitions/i);
    expect(el.textContent).toMatch(/In this context/i);
    expect(el.querySelector('.anyllm-tooltip-actions')).toBeNull();
  });
});
