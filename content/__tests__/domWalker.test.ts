import { describe, it, expect, beforeEach } from 'vitest';
import { extractPieces, resetPieceCounter } from '../domWalker';

describe('content/domWalker', () => {
  beforeEach(() => {
    resetPieceCounter();
    document.body.innerHTML = '';
  });

  describe('extractPieces', () => {
    it('extracts text from a simple paragraph', () => {
      document.body.innerHTML = '<p>Hello world</p>';
      const pieces = extractPieces(document.body);

      expect(pieces.length).toBe(1);
      expect(pieces[0].text).toBe('Hello world');
      expect(pieces[0].id).toBe('lp-1');
    });

    it('extracts text from multiple paragraphs', () => {
      document.body.innerHTML = '<p>First paragraph</p><p>Second paragraph</p>';
      const pieces = extractPieces(document.body);

      expect(pieces.length).toBe(2);
      expect(pieces[0].text).toBe('First paragraph');
      expect(pieces[1].text).toBe('Second paragraph');
    });

    it('keeps inline elements within a single piece', () => {
      document.body.innerHTML = '<p>Hello <strong>bold</strong> and <em>italic</em> text</p>';
      const pieces = extractPieces(document.body);

      expect(pieces.length).toBe(1);
      expect(pieces[0].text).toContain('Hello');
      expect(pieces[0].text).toContain('bold');
      expect(pieces[0].text).toContain('italic');
    });

    it('splits at block element boundaries', () => {
      document.body.innerHTML = '<div>Block one</div><div>Block two</div>';
      const pieces = extractPieces(document.body);

      expect(pieces.length).toBe(2);
      expect(pieces[0].text).toBe('Block one');
      expect(pieces[1].text).toBe('Block two');
    });

    it('skips script and style elements', () => {
      document.body.innerHTML = `
        <p>Visible text</p>
        <script>console.log("hidden")</script>
        <style>.hidden { display: none; }</style>
        <p>More visible text</p>
      `;
      const pieces = extractPieces(document.body);

      expect(pieces.length).toBe(2);
      expect(pieces.every((p) => !p.text.includes('hidden'))).toBe(true);
    });

    it('skips elements with translate="no"', () => {
      document.body.innerHTML = '<p>Translate this</p><p translate="no">Skip this</p>';
      const pieces = extractPieces(document.body);

      expect(pieces.length).toBe(1);
      expect(pieces[0].text).toBe('Translate this');
    });

    it('skips elements with .notranslate class', () => {
      document.body.innerHTML = '<p>Translate this</p><p class="notranslate">Skip this</p>';
      const pieces = extractPieces(document.body);

      expect(pieces.length).toBe(1);
      expect(pieces[0].text).toBe('Translate this');
    });

    it('skips contentEditable elements', () => {
      document.body.innerHTML = '<p>Normal</p><div contenteditable="true">Editable</div>';
      const pieces = extractPieces(document.body);

      expect(pieces.length).toBe(1);
      expect(pieces[0].text).toBe('Normal');
    });

    it('skips elements with data-anyllm-translated', () => {
      document.body.innerHTML = '<p>Normal</p><div data-anyllm-translated>Injected</div>';
      const pieces = extractPieces(document.body);

      expect(pieces.length).toBe(1);
      expect(pieces[0].text).toBe('Normal');
    });

    it('skips very short text (less than 2 chars)', () => {
      document.body.innerHTML = '<p>A</p><p>Real paragraph here</p>';
      const pieces = extractPieces(document.body);

      expect(pieces.length).toBe(1);
      expect(pieces[0].text).toBe('Real paragraph here');
    });

    it('handles nested block elements', () => {
      document.body.innerHTML = `
        <article>
          <h1>Title</h1>
          <p>Content here</p>
        </article>
      `;
      const pieces = extractPieces(document.body);

      expect(pieces.length).toBe(2);
      expect(pieces[0].text).toBe('Title');
      expect(pieces[1].text).toBe('Content here');
    });

    it('sets isTranslated to false for all pieces', () => {
      document.body.innerHTML = '<p>Test</p><p>More test</p>';
      const pieces = extractPieces(document.body);

      expect(pieces.every((p) => p.isTranslated === false)).toBe(true);
    });

    it('skips body-anchored pieces (text inside inline elements directly under body)', () => {
      // Simulates Wikipedia's "Jump to content" link — inline <a> directly in <body>
      document.body.innerHTML = '<a href="#content">Jump to content</a>';
      const pieces = extractPieces(document.body);

      expect(pieces.length).toBe(0);
    });

    it('still extracts normal content when inline elements are nested in blocks', () => {
      document.body.innerHTML = '<p><a href="#">Link text</a> and more text</p>';
      const pieces = extractPieces(document.body);

      expect(pieces.length).toBe(1);
      expect(pieces[0].text).toBe('Link text and more text');
      expect(pieces[0].parentElement.tagName).toBe('P');
    });
  });
});
