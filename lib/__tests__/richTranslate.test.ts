/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import {
  encodeInlineHtml,
  decodeInlineHtml,
  INLINE_ELEMENTS,
  isInlineTagName,
} from '../richTranslate';

describe('richTranslate', () => {
  describe('INLINE_ELEMENTS / isInlineTagName', () => {
    it('contains the core inline tags', () => {
      expect(INLINE_ELEMENTS).toContain('A');
      expect(INLINE_ELEMENTS).toContain('B');
      expect(INLINE_ELEMENTS).toContain('STRONG');
      expect(INLINE_ELEMENTS).toContain('EM');
      expect(INLINE_ELEMENTS).toContain('CODE');
      expect(INLINE_ELEMENTS).toContain('SPAN');
      expect(INLINE_ELEMENTS).toContain('MARK');
    });

    it('isInlineTagName is case-insensitive against the whitelist', () => {
      expect(isInlineTagName('a')).toBe(true);
      expect(isInlineTagName('A')).toBe(true);
      expect(isInlineTagName('div')).toBe(false);
      expect(isInlineTagName('p')).toBe(false);
      expect(isInlineTagName('script')).toBe(false);
    });
  });

  describe('encodeInlineHtml', () => {
    it('returns plain text unchanged when no inline markup is present', () => {
      const out = encodeInlineHtml('Hello world');
      expect(out.flatText).toBe('Hello world');
      expect(out.variables).toEqual([]);
    });

    it('returns empty flat text + no variables for empty input', () => {
      const out = encodeInlineHtml('');
      expect(out.flatText).toBe('');
      expect(out.variables).toEqual([]);
    });

    it('encodes a single inline element as a <z id="0">…</z> placeholder', () => {
      const html = 'Hello <strong>world</strong>!';
      const out = encodeInlineHtml(html);
      expect(out.flatText).toBe('Hello <z id="0">world</z>!');
      expect(out.variables).toHaveLength(1);
      expect(out.variables[0]).toMatchObject({ id: 0, tag: 'STRONG' });
      expect(out.variables[0].openHtml).toBe('<strong>');
      expect(out.variables[0].closeHtml).toBe('</strong>');
    });

    it('preserves attributes on the encoded element in the variable (not in flat text)', () => {
      const html = 'Click <a href="https://example.com">here</a> now';
      const out = encodeInlineHtml(html);
      expect(out.flatText).toBe('Click <z id="0">here</z> now');
      expect(out.variables[0]).toMatchObject({ id: 0, tag: 'A' });
      expect(out.variables[0].openHtml).toBe('<a href="https://example.com">');
      expect(out.variables[0].closeHtml).toBe('</a>');
    });

    it('encodes multiple sibling inline elements with incrementing ids', () => {
      const html = '<b>one</b> and <i>two</i>';
      const out = encodeInlineHtml(html);
      expect(out.flatText).toBe('<z id="0">one</z> and <z id="1">two</z>');
      expect(out.variables).toHaveLength(2);
      expect(out.variables[0].id).toBe(0);
      expect(out.variables[1].id).toBe(1);
    });

    it('encodes nested inline elements with outer-first ids', () => {
      // Outer <a> gets id 0, inner <strong> gets id 1.
      const html = '<a href="/x">bold <strong>link</strong></a>';
      const out = encodeInlineHtml(html);
      expect(out.flatText).toBe('<z id="0">bold <z id="1">link</z></z>');
      expect(out.variables).toHaveLength(2);
      expect(out.variables[0].tag).toBe('A');
      expect(out.variables[1].tag).toBe('STRONG');
    });

    it('does not encode non-inline elements (div, p, blockquote)', () => {
      const html = '<p>Hello <em>there</em></p>';
      const out = encodeInlineHtml(html);
      // <p> stays verbatim; only <em> is encoded.
      expect(out.flatText).toBe('<p>Hello <z id="0">there</z></p>');
      expect(out.variables).toHaveLength(1);
      expect(out.variables[0].tag).toBe('EM');
    });

    it('encodes inline code', () => {
      const html = 'Use <code>npm install</code> to install.';
      const out = encodeInlineHtml(html);
      expect(out.flatText).toBe('Use <z id="0">npm install</z> to install.');
      expect(out.variables[0].tag).toBe('CODE');
    });

    it('skips self-closing void inline elements (no closing tag) gracefully', () => {
      // <br> is void; encodeInlineHtml should leave unknown/void content alone.
      const html = 'line one<br>line two';
      const out = encodeInlineHtml(html);
      // <br> is not in the encode set and has no closing pair; left verbatim.
      expect(out.flatText).toBe('line one<br>line two');
      expect(out.variables).toEqual([]);
    });
  });

  describe('decodeInlineHtml', () => {
    it('returns a DocumentFragment with plain text for no placeholders', () => {
      const frag = decodeInlineHtml('Just text', []);
      expect(frag).toBeInstanceOf(DocumentFragment);
      expect(frag.textContent).toBe('Just text');
      expect(frag.childNodes).toHaveLength(1);
      expect(frag.firstChild?.nodeType).toBe(Node.TEXT_NODE);
    });

    it('round-trips a single inline element', () => {
      const encoded = encodeInlineHtml('Hello <strong>world</strong>!');
      const frag = decodeInlineHtml(encoded.flatText, encoded.variables);
      expect(frag).toBeInstanceOf(DocumentFragment);
      expect(frag.textContent).toBe('Hello world!');
      // The second child should be the <strong> element.
      const strong = frag.querySelector('strong');
      expect(strong).not.toBeNull();
      expect(strong?.textContent).toBe('world');
      expect(strong?.tagName).toBe('STRONG');
    });

    it('round-trips an anchor preserving href', () => {
      const encoded = encodeInlineHtml('Click <a href="https://example.com">here</a>');
      const frag = decodeInlineHtml(encoded.flatText, encoded.variables);
      const a = frag.querySelector('a');
      expect(a).not.toBeNull();
      expect(a?.getAttribute('href')).toBe('https://example.com');
      expect(a?.textContent).toBe('here');
    });

    it('round-trips nested inline elements', () => {
      const encoded = encodeInlineHtml('<a href="/x">bold <strong>link</strong></a>');
      const frag = decodeInlineHtml(encoded.flatText, encoded.variables);
      const a = frag.querySelector('a');
      expect(a).not.toBeNull();
      expect(a?.getAttribute('href')).toBe('/x');
      const strong = a?.querySelector('strong');
      expect(strong?.textContent).toBe('link');
      expect(a?.textContent).toBe('bold link');
    });

    it('translates text inside an inline element while keeping the tag (simulated)', () => {
      // Encode "Hello <strong>world</strong>", LLM returns "Xin chào <z id="0">thế giới</z>"
      const encoded = encodeInlineHtml('Hello <strong>world</strong>');
      // Simulate LLM translating surrounding + inner text but keeping the placeholder.
      const translatedFlat = 'Xin chào <z id="0">thế giới</z>';
      const frag = decodeInlineHtml(translatedFlat, encoded.variables);
      const strong = frag.querySelector('strong');
      expect(strong?.textContent).toBe('thế giới');
      // Text before the placeholder is translated.
      const textNode = frag.firstChild;
      expect(textNode?.nodeType).toBe(Node.TEXT_NODE);
      expect(textNode?.textContent).toBe('Xin chào ');
    });

    it('handles multiple placeholders in sequence', () => {
      const encoded = encodeInlineHtml('<b>one</b> and <i>two</i>');
      // LLM keeps placeholders, translates " and ".
      const translatedFlat = '<z id="0">uno</z> y <z id="1">dos</z>';
      const frag = decodeInlineHtml(translatedFlat, encoded.variables);
      expect(frag.querySelector('b')?.textContent).toBe('uno');
      expect(frag.querySelector('i')?.textContent).toBe('dos');
      expect(frag.textContent).toBe('uno y dos');
    });

    it('renders a missing/unknown placeholder id as literal text (defensive)', () => {
      // LLM hallucinates a placeholder id that was never encoded.
      const frag = decodeInlineHtml('text <z id="99">x</z>', []);
      // Unknown variable → leave the marker as literal text, do not throw.
      expect(frag.textContent).toContain('x');
      expect(frag.querySelectorAll('*')).toHaveLength(0);
    });

    it('escapes plain text so it cannot inject HTML', () => {
      const frag = decodeInlineHtml('a < b && c > d', []);
      // No element should be created from the raw text.
      expect(frag.querySelectorAll('*')).toHaveLength(0);
      expect(frag.textContent).toBe('a < b && c > d');
    });

    it('rejects <script> tags even if a variable tried to carry one (XSS guard)', () => {
      // A malicious variable claims to be a script. decode must not honor it.
      const frag = decodeInlineHtml('<z id="0">payload</z>', [
        { id: 0, tag: 'SCRIPT', openHtml: '<script>', closeHtml: '</script>' },
      ]);
      expect(frag.querySelector('script')).toBeNull();
      // Falls back to plain text (payload rendered as text, no script execution).
      expect(frag.textContent).toBe('payload');
    });

    it('strips dangerous attributes (on*, javascript: href) on decode', () => {
      const frag = decodeInlineHtml('<z id="0">click</z>', [
        {
          id: 0,
          tag: 'A',
          openHtml: '<a href="javascript:alert(1)" onclick="evil()">',
          closeHtml: '</a>',
        },
      ]);
      const a = frag.querySelector('a');
      expect(a).not.toBeNull();
      expect(a?.getAttribute('onclick')).toBeNull();
      // href with javascript: protocol is dropped.
      expect(a?.getAttribute('href')).toBeNull();
      expect(a?.textContent).toBe('click');
    });

    it('preserves safe attributes like title, class, lang', () => {
      const frag = decodeInlineHtml('<z id="0">word</z>', [
        {
          id: 0,
          tag: 'SPAN',
          openHtml: '<span class="term" title="greeting" lang="en">',
          closeHtml: '</span>',
        },
      ]);
      const span = frag.querySelector('span');
      expect(span?.getAttribute('class')).toBe('term');
      expect(span?.getAttribute('title')).toBe('greeting');
      expect(span?.getAttribute('lang')).toBe('en');
    });
  });

  describe('round-trip property tests', () => {
    it('round-trips a complex paragraph with mixed inline markup', () => {
      const html =
        'This has <a href="https://x.test">a link</a>, <strong>bold</strong>, <em>italic</em>, and <code>code()</code>.';
      const encoded = encodeInlineHtml(html);
      // flatText must contain exactly 4 placeholders.
      const placeholderCount = (encoded.flatText.match(/<z id="\d+">/g) || []).length;
      expect(placeholderCount).toBe(4);
      const frag = decodeInlineHtml(encoded.flatText, encoded.variables);
      expect(frag.querySelector('a')?.getAttribute('href')).toBe('https://x.test');
      expect(frag.querySelector('strong')?.textContent).toBe('bold');
      expect(frag.querySelector('em')?.textContent).toBe('italic');
      expect(frag.querySelector('code')?.textContent).toBe('code()');
    });
  });
});
