import { beforeEach, describe, expect, it } from 'vitest';
import { extractPieces, resetPieceCounter } from '../domWalker';
import { joinGroupText } from '../pieceText';
import { __resetMatchCacheForTest } from '@/lib/domUtils';

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
