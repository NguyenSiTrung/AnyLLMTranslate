import { describe, expect, it } from 'vitest';
import { passesTailGate, protectUrls, removeTail } from '@/content/inlineTranslate/tail';

describe('passesTailGate', () => {
  it('requires the last non-empty line to end with ≥ min(tapCount, 2) consecutive trigger chars', () => {
    expect(passesTailGate('hello   ', ' ', 3)).toBe(true);
    // macOS "double-space → period" leaves only two spaces after the taps.
    expect(passesTailGate('hello.  ', ' ', 3)).toBe(true);
    expect(passesTailGate('hello ', ' ', 3)).toBe(false);
    expect(passesTailGate('hello ', ' ', 1)).toBe(true);
    // Trailing newlines are ignored; earlier lines do not count.
    expect(passesTailGate('first   \nsecond   \n', ' ', 3)).toBe(true);
    expect(passesTailGate('first   \nsecond', ' ', 3)).toBe(false);
    expect(passesTailGate('', ' ', 3)).toBe(false);
  });

  it('aborts when a letter follows the taps and accepts alias characters', () => {
    expect(passesTailGate('hello   x', ' ', 3)).toBe(false);
    expect(passesTailGate('hello\u00a0\u00a0 ', ' ', 3)).toBe(true);
    expect(passesTailGate('你好\u3000\u3000\u3000', ' ', 3)).toBe(true);
    expect(passesTailGate('hello///', '/', 3)).toBe(true);
    expect(passesTailGate('你好、、、', '/', 3)).toBe(true);
    expect(passesTailGate('hello//x', '/', 3)).toBe(false);
  });
});

describe('removeTail', () => {
  it('deletes the whole consecutive run when the tail matched (whitespace-class for space)', () => {
    expect(removeTail('hello     ', ' ', 3, { tailMatched: true })).toEqual({ text: 'hello', removed: 5 });
    expect(removeTail('hello \u00a0\u3000', ' ', 3, { tailMatched: true }).text).toBe('hello');
    expect(removeTail('hello   \n', ' ', 3, { tailMatched: true }).text).toBe('hello');
    expect(removeTail('hello////', '/', 3, { tailMatched: true }).text).toBe('hello');
    expect(removeTail('你好、、、', '/', 3, { tailMatched: true }).text).toBe('你好');
  });

  it('caps deletion at tapCount when the tail did not match', () => {
    expect(removeTail('hello/////', '/', 3, { tailMatched: false })).toEqual({ text: 'hello//', removed: 3 });
    expect(removeTail('hello', '/', 3, { tailMatched: false })).toEqual({ text: 'hello', removed: 0 });
  });

  it('drops a preceding period / 。 when fewer than 3 trigger chars were removed', () => {
    expect(removeTail('hello.  ', ' ', 3, { tailMatched: true }).text).toBe('hello');
    expect(removeTail('你好。  ', ' ', 3, { tailMatched: true }).text).toBe('你好');
    // A real sentence end followed by the full burst keeps its period.
    expect(removeTail('I agree.   ', ' ', 3, { tailMatched: true }).text).toBe('I agree.');
  });
});

describe('protectUrls', () => {
  it('replaces URLs with placeholders that survive prefix parsing and restores them', () => {
    const source = '//en see https://example.com/en//ja?q=1 and http://a.b/c';
    const { text, restore } = protectUrls(source);

    expect(text).not.toContain('http');
    expect(text).not.toMatch(/\/\/ja/);
    expect(text.startsWith('//en see ')).toBe(true);
    expect(restore(text)).toBe(source);
    expect(restore('voir \uE000' + '0\uE001')).toBe('voir https://example.com/en//ja?q=1');
    expect(protectUrls('no links').text).toBe('no links');
  });
});
