import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extractPieces, resetPieceCounter, splitAtSentenceBoundary } from '../domWalker';
import { joinGroupText } from '../pieceText';
import { __resetMatchCacheForTest } from '@/lib/domUtils';
import { decodeInlineHtml } from '@/lib/richTranslate';
import { DEFAULT_SETTINGS, SMART_EXCLUDE_SELECTORS } from '@/types/config';

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

describe('domWalker — code blocks skipped by default smart excludes (FR-4)', () => {
  it('drops <pre> and editor code blocks but keeps inline code in its sentence', () => {
    expect(DEFAULT_SETTINGS.enableSmartExcludes).toBe(true);
    setBody(
      '<article><p>Run <code>npm test</code> before pushing.</p>' +
        '<pre><code>const answer = 42;\nconsole.log(answer);</code></pre>' +
        '<div class="cm-editor"><div class="cm-line">let editorCode = 1;</div></div></article>',
    );
    const pieces = extractPieces(document.body, { excludeSelectors: [...SMART_EXCLUDE_SELECTORS] });
    expect(pieces.map((p) => p.text)).toEqual(['Run npm test before pushing.']);
  });
});

/** Open/close balance of `<z>` tokens; every prefix must stay >= 0. */
function zBalance(text: string): number {
  let depth = 0;
  for (const m of text.matchAll(/<z id="\d+">|<\/z>/g)) {
    depth += m[0] === '</z>' ? -1 : 1;
    if (depth < 0) return -1;
  }
  return depth;
}

describe('domWalker — CJK-aware, tag-safe sentence splitting (FR-5)', () => {
  it('splits a long Chinese paragraph only at CJK sentence punctuation', () => {
    const sentences = Array.from({ length: 90 }, (_, i) =>
      `这是第${i}个用于测试的中文句子包含足够的文字${'！？；。'[i % 4]}`,
    );
    const paragraph = sentences.join('');
    expect(paragraph.length).toBeGreaterThan(2000);

    const parts = splitAtSentenceBoundary(paragraph, 1000);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join('')).toBe(paragraph);
    for (const part of parts.slice(0, -1)) {
      expect(part.length).toBeLessThanOrEqual(1000);
      expect('。！？；').toContain(part.at(-1));
    }
  });

  it('never cuts inside a <z> token and keeps every part balanced', () => {
    // Long link with words but no sentence punctuation: the cut lands inside the element.
    const words = Array.from({ length: 300 }, (_, i) => `word${i}`).join(' ');
    let parts = splitAtSentenceBoundary(`Lead <z id="0">${words}</z> tail`, 1000);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(zBalance(part)).toBe(0);
      expect(part).not.toMatch(/<z(?! id="\d+">)|<\/(?!z>)|<z id="\d*$/);
    }
    expect(parts[1].startsWith('<z id="0">')).toBe(true);

    // No whitespace at all: a forced cut would land inside the open token.
    parts = splitAtSentenceBoundary(`${'x'.repeat(995)}<z id="7">${'y'.repeat(50)}</z>`, 1000);
    expect(parts[0]).toBe('x'.repeat(995));
    expect(parts[1]).toBe(`<z id="7">${'y'.repeat(50)}</z>`);
  });

  it('splits a long rich piece into balanced, decodable parts', () => {
    const body = Array.from({ length: 40 }, (_, i) =>
      `Sentence ${i} mentions <a href="#${i}">link number ${i}</a> and <b>bold ${i} words</b> here.`,
    ).join(' ');
    setBody(`<p>${body}</p>`);
    const pieces = extractPieces(document.body, { enableRichTranslate: true });
    expect(pieces.length).toBeGreaterThan(1);
    for (const piece of pieces) {
      expect(zBalance(piece.text)).toBe(0);
      const frag = decodeInlineHtml(piece.text, piece.variables ?? []);
      expect(frag.textContent).not.toMatch(/<\/?z/);
    }
  });
});

describe('domWalker — visually-block custom elements split pieces (FR-6)', () => {
  it('splits structural custom elements and display:block spans into separate pieces', () => {
    setBody('<div><x-card>First card text</x-card><x-card>Second card text</x-card></div>');
    let pieces = extractPieces(document.body);
    expect(pieces.map((p) => p.text)).toEqual(['First card text', 'Second card text']);
    expect(pieces.map((p) => p.parentElement.tagName)).toEqual(['X-CARD', 'X-CARD']);

    setBody('<div><span style="display:block">First line</span><span style="display:flex">Second line</span></div>');
    pieces = extractPieces(document.body);
    expect(pieces.map((p) => p.text)).toEqual(['First line', 'Second line']);
    expect(pieces.map((p) => p.parentElement.tagName)).toEqual(['SPAN', 'SPAN']);
  });

  it('keeps inline custom elements and inline-block spans inside the sentence', () => {
    setBody('<p>Updated <relative-time>3 days ago</relative-time> by <span style="display:inline-block">bot</span>.</p>');
    const pieces = extractPieces(document.body);
    expect(pieces.map((p) => p.text)).toEqual(['Updated 3 days ago by bot.']);
  });

  it('never reads computed style for standard tags and reads it once per ambiguous element', () => {
    const spy = vi.spyOn(window, 'getComputedStyle');
    try {
      setBody('<p>A <a href="#">b</a> <strong>c</strong> <em>d</em> <code>e</code> <b>f</b></p><div><p>g h</p></div>');
      extractPieces(document.body);
      expect(spy).not.toHaveBeenCalled();

      setBody('<p>One <span>two <b>three</b> four</span> five <span>six</span></p>');
      extractPieces(document.body);
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
    }
  });
});
