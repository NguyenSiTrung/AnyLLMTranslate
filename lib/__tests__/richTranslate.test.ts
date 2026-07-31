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
  it('encodes inline markup, round-trips decode with LLM text swap, and defends against XSS/injection', () => {
    for (const tag of ['A', 'B', 'STRONG', 'EM', 'CODE', 'SPAN', 'MARK']) {
      expect(INLINE_ELEMENTS).toContain(tag);
    }
    expect(isInlineTagName('a')).toBe(true);
    expect(isInlineTagName('A')).toBe(true);
    expect(isInlineTagName('div')).toBe(false);
    expect(isInlineTagName('script')).toBe(false);

    expect(encodeInlineHtml('Hello world')).toEqual({ flatText: 'Hello world', variables: [] });
    expect(encodeInlineHtml('')).toEqual({ flatText: '', variables: [] });
    expect(encodeInlineHtml('line one<br>line two')).toEqual({
      flatText: 'line one<br>line two',
      variables: [],
    });

    const strong = encodeInlineHtml('Hello <strong>world</strong>!');
    expect(strong.flatText).toBe('Hello <z id="0">world</z>!');
    expect(strong.variables[0]).toMatchObject({ id: 0, tag: 'STRONG' });

    const link = encodeInlineHtml('Click <a href="https://example.com">here</a> now');
    expect(link.flatText).toBe('Click <z id="0">here</z> now');
    expect(link.variables[0].openHtml).toBe('<a href="https://example.com">');

    const multi = encodeInlineHtml('<b>one</b> and <i>two</i>');
    expect(multi.flatText).toBe('<z id="0">one</z> and <z id="1">two</z>');
    expect(multi.variables).toHaveLength(2);

    const nested = encodeInlineHtml('<a href="/x">bold <strong>link</strong></a>');
    expect(nested.flatText).toBe('<z id="0">bold <z id="1">link</z></z>');
    expect(nested.variables.map((v) => v.tag)).toEqual(['A', 'STRONG']);

    const block = encodeInlineHtml('<p>Hello <em>there</em></p>');
    expect(block.flatText).toBe('<p>Hello <z id="0">there</z></p>');
    expect(block.variables[0].tag).toBe('EM');

    const code = encodeInlineHtml('Use <code>npm install</code> to install.');
    expect(code.flatText).toBe('Use <z id="0">npm install</z> to install.');
    expect(code.variables[0].tag).toBe('CODE');

    const plain = decodeInlineHtml('Just text', []);
    expect(plain).toBeInstanceOf(DocumentFragment);
    expect(plain.textContent).toBe('Just text');
    expect(plain.firstChild?.nodeType).toBe(Node.TEXT_NODE);

    expect(decodeInlineHtml(strong.flatText, strong.variables).querySelector('strong')?.textContent).toBe(
      'world',
    );
    expect(
      decodeInlineHtml(link.flatText, link.variables).querySelector('a')?.getAttribute('href'),
    ).toBe('https://example.com');
    expect(decodeInlineHtml(nested.flatText, nested.variables).querySelector('a strong')?.textContent).toBe(
      'link',
    );

    const sim = encodeInlineHtml('Hello <strong>world</strong>');
    const translated = decodeInlineHtml('Xin chào <z id="0">thế giới</z>', sim.variables);
    expect(translated.querySelector('strong')?.textContent).toBe('thế giới');
    expect(translated.firstChild?.textContent).toBe('Xin chào ');

    const multiFrag = decodeInlineHtml('<z id="0">uno</z> y <z id="1">dos</z>', multi.variables);
    expect(multiFrag.querySelector('b')?.textContent).toBe('uno');
    expect(multiFrag.querySelector('i')?.textContent).toBe('dos');

    const complex =
      'This has <a href="https://x.test">a link</a>, <strong>bold</strong>, <em>italic</em>, and <code>code()</code>.';
    const encoded = encodeInlineHtml(complex);
    expect((encoded.flatText.match(/<z id="\d+">/g) || []).length).toBe(4);
    const frag = decodeInlineHtml(encoded.flatText, encoded.variables);
    expect(frag.querySelector('a')?.getAttribute('href')).toBe('https://x.test');
    expect(frag.querySelector('strong')?.textContent).toBe('bold');
    expect(frag.querySelector('em')?.textContent).toBe('italic');
        expect(frag.querySelector('code')?.textContent).toBe('code()');

    // defends against unknown placeholders, HTML injection, and XSS attrs/tags
    const unknown = decodeInlineHtml('text <z id="99">x</z>', []);
    expect(unknown.textContent).toContain('x');
    expect(unknown.querySelectorAll('*')).toHaveLength(0);

    const escaped = decodeInlineHtml('a < b && c > d', []);
    expect(escaped.querySelectorAll('*')).toHaveLength(0);
    expect(escaped.textContent).toBe('a < b && c > d');

    const script = decodeInlineHtml('<z id="0">payload</z>', [
      { id: 0, tag: 'SCRIPT', openHtml: '<script>', closeHtml: '</script>' },
    ]);
    expect(script.querySelector('script')).toBeNull();
    expect(script.textContent).toBe('payload');

    const danger = decodeInlineHtml('<z id="0">click</z>', [
      {
        id: 0,
        tag: 'A',
        openHtml: '<a href="javascript:alert(1)" onclick="evil()">',
        closeHtml: '</a>',
      },
    ]);
    const a = danger.querySelector('a');
    expect(a?.getAttribute('onclick')).toBeNull();
    expect(a?.getAttribute('href')).toBeNull();

    const safe = decodeInlineHtml('<z id="0">word</z>', [
      {
        id: 0,
        tag: 'SPAN',
        openHtml: '<span class="term" title="greeting" lang="en">',
        closeHtml: '</span>',
      },
    ]);
    const span = safe.querySelector('span');
    expect(span?.getAttribute('class')).toBe('term');
    expect(span?.getAttribute('title')).toBe('greeting');
    expect(span?.getAttribute('lang')).toBe('en');
  });
});
