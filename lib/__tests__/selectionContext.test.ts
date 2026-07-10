// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  SELECTION_CONTEXT_MAX_CHARS,
  extractSelectionContext,
  getSurroundingTextFromRange,
} from '../selectionContext';

describe('selectionContext', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('extractSelectionContext', () => {
    it('uses parentText with whitespace collapse, maxChars, and centered window', () => {
      expect(SELECTION_CONTEXT_MAX_CHARS).toBe(300);

      expect(
        extractSelectionContext({
          selectedText: 'word',
          parentText: 'This is a parent sentence with word inside.',
        }),
      ).toBe('This is a parent sentence with word inside.');

      expect(
        extractSelectionContext({
          selectedText: 'hello',
          parentText: '  Hello   world\n\tfoo  ',
        }),
      ).toBe('Hello world foo');

      const long = 'a'.repeat(500);
      expect(
        extractSelectionContext({
          selectedText: 'x',
          parentText: long,
          maxChars: 100,
        }).length,
      ).toBe(100);

      const prefix = 'PREFIX_'.repeat(40);
      const selected = 'TARGET';
      const suffix = '_SUFFIX'.repeat(40);
      const parentText = `${prefix}${selected}${suffix}`;
      const windowed = extractSelectionContext({
        selectedText: selected,
        parentText,
        maxChars: 60,
      });
      expect(windowed.length).toBeLessThanOrEqual(60);
      expect(windowed).toContain(selected);
      expect(windowed).not.toBe(parentText.slice(0, 60));

      const missing = 'abcdefghij'.repeat(40);
      expect(
        extractSelectionContext({
          selectedText: 'NOTFOUND',
          parentText: missing,
          maxChars: 50,
        }),
      ).toBe(missing.slice(0, 50));
    });

    it('returns empty for missing/blank inputs and never throws on bad range', () => {
      expect(extractSelectionContext({ selectedText: 'word' })).toBe('');
      expect(extractSelectionContext({ selectedText: 'word', parentText: '   ' })).toBe('');
      expect(extractSelectionContext({ selectedText: '', parentText: '' })).toBe('');
      expect(
        extractSelectionContext({
          selectedText: 'x',
          range: {
            get commonAncestorContainer(): Node {
              throw new Error('boom');
            },
          } as unknown as Range,
        }),
      ).toBe('');
    });

    it('prefers parentText over range, else uses range ancestor text', () => {
      const p = document.createElement('p');
      p.textContent = 'Range paragraph text with hello here.';
      document.body.appendChild(p);
      const textNode = p.firstChild as Text;
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 5);

      expect(
        extractSelectionContext({
          selectedText: 'hello',
          parentText: 'Explicit parent text with hello.',
          range,
        }),
      ).toBe('Explicit parent text with hello.');

      const start = (p.textContent ?? '').indexOf('hello');
      range.setStart(textNode, start);
      range.setEnd(textNode, start + 'hello'.length);
      expect(
        extractSelectionContext({
          selectedText: 'hello',
          range,
        }),
      ).toBe('Range paragraph text with hello here.');
    });
  });

  describe('getSurroundingTextFromRange', () => {
    it('reads nearest block ancestor and fails open', () => {
      const p = document.createElement('p');
      p.textContent = 'Hello from paragraph.';
      document.body.appendChild(p);
      const pRange = document.createRange();
      pRange.setStart(p.firstChild as Text, 0);
      pRange.setEnd(p.firstChild as Text, 5);
      expect(getSurroundingTextFromRange(pRange)).toBe('Hello from paragraph.');

      const article = document.createElement('article');
      const span = document.createElement('span');
      span.textContent = 'Nested word content';
      article.appendChild(span);
      document.body.appendChild(article);
      const nested = document.createRange();
      nested.setStart(span.firstChild as Text, 0);
      nested.setEnd(span.firstChild as Text, 6);
      expect(getSurroundingTextFromRange(nested)).toBe('Nested word content');

      const div = document.createElement('div');
      div.textContent = 'Div block text';
      document.body.appendChild(div);
      const divRange = document.createRange();
      divRange.setStart(div.firstChild as Text, 0);
      divRange.setEnd(div.firstChild as Text, 3);
      expect(getSurroundingTextFromRange(divRange)).toBe('Div block text');

      expect(
        getSurroundingTextFromRange({
          get commonAncestorContainer(): Node {
            throw new Error('fail');
          },
        } as unknown as Range),
      ).toBe('');
    });
  });
});
