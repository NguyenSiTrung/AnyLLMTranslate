import { beforeEach, describe, expect, it } from 'vitest';
import { extractPieces, resetPieceCounter } from '../domWalker';
import { joinGroupText } from '../pieceText';
import { __resetMatchCacheForTest } from '@/lib/domUtils';
import { decodeInlineHtml } from '@/lib/richTranslate';

function setBody(html: string): void {
  document.body.innerHTML = html;
}

beforeEach(() => {
  document.body.innerHTML = '';
  resetPieceCounter();
  __resetMatchCacheForTest();
});

describe('domWalker — <br> line breaks in plain piece text (FR-3)', () => {
  it('turns <br> between text nodes into a newline and caps runs at a blank line', () => {
    setBody('<p>Plain<br>break</p>');
    let pieces = extractPieces(document.body);
    expect(pieces).toHaveLength(1);
    expect(pieces[0].text).toBe('Plain\nbreak');
    expect(pieces[0].sourceText).toBe('Plain\nbreak');

    setBody('<p>One<br><br><br><br>Two</p>');
    pieces = extractPieces(document.body);
    expect(pieces[0].text).toBe('One\n\nTwo');

    // A <br> inside an inline wrapper still separates the words.
    setBody('<p>Alpha <b>beta<br>gamma</b> delta</p>');
    pieces = extractPieces(document.body);
    expect(pieces[0].text).toBe('Alpha beta\ngamma delta');
  });

  it('joinGroupText recomputes the same baseline the walker recorded', () => {
    setBody('<p>Plain<br>break <a href="#">link</a></p>');
    const [piece] = extractPieces(document.body);
    expect(joinGroupText(piece.textNodes).trim()).toBe(piece.sourceText);
  });
});

describe('domWalker — group-scoped rich encoding (FR-1)', () => {
  const rich = { enableRichTranslate: true } as const;

  it('encodes only the piece group, never nested blocks or rejected subtrees', () => {
    // Nested list: the parent LI piece must not carry the child UL as raw HTML.
    setBody('<ul><li>Item <a href="#">here</a><ul><li>Sub item text</li></ul></li></ul>');
    let pieces = extractPieces(document.body, rich);
    expect(pieces.map((p) => p.text)).toEqual(['Item <z id="0">here</z>', 'Sub item text']);

    // Hard-skipped subtrees inside the anchor never leak into the rich text.
    setBody(
      '<div><b>Lead</b> text <div class="notranslate">SECRET_A</div>' +
        '<div translate="no">SECRET_B</div><pre>SECRET_C</pre>' +
        '<script>SECRET_D</script><!-- SECRET_E --> tail</div>',
    );
    pieces = extractPieces(document.body, { ...rich, excludeSelectors: ['pre'] });
    const all = pieces.map((p) => p.text).join(' | ');
    for (const secret of ['SECRET_A', 'SECRET_B', 'SECRET_C', 'SECRET_D', 'SECRET_E']) {
      expect(all).not.toContain(secret);
    }
    expect(all).toContain('<z id="0">Lead</z> text');
  });

  it('encodes each source group of a multi-group parent separately', () => {
    setBody('<div>Text <em>A</em> lead <p>Inner <b>para</b></p> Text <i>B</i> tail</div>');
    const pieces = extractPieces(document.body, rich);
    expect(pieces.map((p) => p.text)).toEqual([
      'Text <z id="0">A</z> lead',
      'Inner <z id="0">para</z>',
      'Text <z id="0">B</z> tail',
    ]);
    expect(pieces[0].variables?.map((v) => v.tag)).toEqual(['EM']);
    expect(pieces[2].variables?.map((v) => v.tag)).toEqual(['I']);
  });
});

describe('domWalker — decoded entities and void tags in rich text (FR-2)', () => {
  it('sends decoded characters and newlines, and decodes without literal tags or entities', () => {
    setBody('<p>Tom &amp; Jerry<br>x <a href="#">link</a></p>');
    const [piece] = extractPieces(document.body, { enableRichTranslate: true });
    expect(piece.text).toBe('Tom & Jerry\nx <z id="0">link</z>');

    const frag = decodeInlineHtml(piece.text, piece.variables ?? []);
    expect(frag.textContent).toBe('Tom & Jerry\nx link');
    expect(frag.textContent).not.toMatch(/&amp;|<br>|<z/);
    expect([...frag.querySelectorAll('*')].map((el) => el.tagName)).toEqual(['A']);
  });

  it('drops img/wbr from the LLM text', () => {
    setBody('<p>See <b>the<wbr>logo</b> <img src="x.png" alt="logo"> here</p>');
    const [piece] = extractPieces(document.body, { enableRichTranslate: true });
    expect(piece.text).not.toMatch(/<img|<wbr/);
    expect(piece.text).toBe('See <z id="0">thelogo</z>  here');
  });

  it('round-trips attribute values that need escaping', () => {
    setBody('<p>Go <a href="/q?a=1&amp;b=2" title=\'say "hi" &amp; wave\'>there</a> now</p>');
    const [piece] = extractPieces(document.body, { enableRichTranslate: true });
    const a = decodeInlineHtml(piece.text, piece.variables ?? []).querySelector('a');
    expect(a?.getAttribute('href')).toBe('/q?a=1&b=2');
    expect(a?.getAttribute('title')).toBe('say "hi" & wave');
  });
});
