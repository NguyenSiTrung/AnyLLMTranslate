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

  describe('SELECTION_CONTEXT_MAX_CHARS', () => {
    it('defaults to 300', () => {
      expect(SELECTION_CONTEXT_MAX_CHARS).toBe(300);
    });
  });

  describe('extractSelectionContext', () => {
    it('uses parentText when provided', () => {
      const result = extractSelectionContext({
        selectedText: 'word',
        parentText: 'This is a parent sentence with word inside.',
      });
      expect(result).toBe('This is a parent sentence with word inside.');
    });

    it('collapses whitespace runs in parentText', () => {
      const result = extractSelectionContext({
        selectedText: 'hello',
        parentText: '  Hello   world\n\tfoo  ',
      });
      expect(result).toBe('Hello world foo');
    });

    it('caps long parentText to maxChars', () => {
      const long = 'a'.repeat(500);
      const result = extractSelectionContext({
        selectedText: 'x',
        parentText: long,
        maxChars: 100,
      });
      expect(result.length).toBe(100);
    });

    it('windows context centered around selected word when possible', () => {
      const prefix = 'PREFIX_'.repeat(40); // 280 chars
      const selected = 'TARGET';
      const suffix = '_SUFFIX'.repeat(40); // 280 chars
      const parentText = `${prefix}${selected}${suffix}`;

      const result = extractSelectionContext({
        selectedText: selected,
        parentText,
        maxChars: 60,
      });

      expect(result.length).toBeLessThanOrEqual(60);
      expect(result).toContain(selected);
      // Not just a prefix of the parent (which would miss TARGET at index 280)
      expect(result).not.toBe(parentText.slice(0, 60));
    });

    it('falls back to prefix slice when selected text is not in parent', () => {
      const parentText = 'abcdefghij'.repeat(40); // 400 chars
      const result = extractSelectionContext({
        selectedText: 'NOTFOUND',
        parentText,
        maxChars: 50,
      });
      expect(result).toBe(parentText.slice(0, 50));
    });

    it('returns empty string when parent and range are missing', () => {
      expect(extractSelectionContext({ selectedText: 'word' })).toBe('');
    });

    it('returns empty string when parentText is empty/whitespace', () => {
      expect(
        extractSelectionContext({ selectedText: 'word', parentText: '   ' })
      ).toBe('');
      expect(
        extractSelectionContext({ selectedText: 'word', parentText: '' })
      ).toBe('');
    });

    it('returns empty string when both selected and parent are empty', () => {
      expect(extractSelectionContext({ selectedText: '', parentText: '' })).toBe(
        ''
      );
    });

    it('prefers parentText over range when both are provided', () => {
      const p = document.createElement('p');
      p.textContent = 'Range paragraph text with hello here.';
      document.body.appendChild(p);
      const textNode = p.firstChild as Text;
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 5);

      const result = extractSelectionContext({
        selectedText: 'hello',
        parentText: 'Explicit parent text with hello.',
        range,
      });
      expect(result).toBe('Explicit parent text with hello.');
    });

    it('uses range when parentText is absent', () => {
      const p = document.createElement('p');
      p.textContent = 'Paragraph contains selected term here.';
      document.body.appendChild(p);
      const textNode = p.firstChild as Text;
      const range = document.createRange();
      // select "selected"
      const start = (p.textContent ?? '').indexOf('selected');
      range.setStart(textNode, start);
      range.setEnd(textNode, start + 'selected'.length);

      const result = extractSelectionContext({
        selectedText: 'selected',
        range,
      });
      expect(result).toBe('Paragraph contains selected term here.');
    });

    it('respects maxChars override', () => {
      const parentText = 'abcdefghijklmnopqrstuvwxyz';
      const result = extractSelectionContext({
        selectedText: 'a',
        parentText,
        maxChars: 10,
      });
      expect(result).toBe('abcdefghij');
      expect(result.length).toBe(10);
    });

    it('never throws on bad input', () => {
      expect(
        extractSelectionContext({
          selectedText: 'x',
          // force getSurroundingTextFromRange path with a broken range-like object
          range: {
            get commonAncestorContainer(): Node {
              throw new Error('boom');
            },
          } as unknown as Range,
        })
      ).toBe('');
    });
  });

  describe('getSurroundingTextFromRange', () => {
    it('returns text from nearest paragraph ancestor', () => {
      const p = document.createElement('p');
      p.textContent = 'Hello from paragraph.';
      document.body.appendChild(p);
      const textNode = p.firstChild as Text;
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 5);

      expect(getSurroundingTextFromRange(range)).toBe('Hello from paragraph.');
    });

    it('walks up from nested span to block ancestor', () => {
      const article = document.createElement('article');
      const span = document.createElement('span');
      span.textContent = 'Nested word content';
      article.appendChild(span);
      document.body.appendChild(article);

      const textNode = span.firstChild as Text;
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 6);

      expect(getSurroundingTextFromRange(range)).toBe('Nested word content');
    });

    it('stops at DIV block ancestor', () => {
      const div = document.createElement('div');
      div.textContent = 'Div block text';
      document.body.appendChild(div);
      const textNode = div.firstChild as Text;
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 3);

      expect(getSurroundingTextFromRange(range)).toBe('Div block text');
    });

    it('returns empty string on failure', () => {
      expect(
        getSurroundingTextFromRange({
          get commonAncestorContainer(): Node {
            throw new Error('fail');
          },
        } as unknown as Range)
      ).toBe('');
    });
  });
});
