import { describe, expect, it } from 'vitest';
import {
  isSpaceTriggerKey,
  isTriggerKeyEvent,
  matchesTriggerChar,
  normalizeTriggerKey,
  startingKeyAliases,
  triggerCharClass,
} from '@/content/inlineTranslate/triggerKeys';

function keydown(key: string, code = ''): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, code });
}

describe('trigger key aliases', () => {
  it('treats space, NBSP and the ideographic space as the same trigger', () => {
    expect(triggerCharClass(' ')).toEqual([' ', ' ', '　']);
    expect(matchesTriggerChar(' ', ' ')).toBe(true);
    expect(matchesTriggerChar(' ', ' ')).toBe(true);
    expect(matchesTriggerChar('　', ' ')).toBe(true);
    expect(matchesTriggerChar('\t', ' ')).toBe(false);
    expect(isSpaceTriggerKey(' ')).toBe(true);
    expect(isSpaceTriggerKey('Space')).toBe(true);
    expect(isSpaceTriggerKey('/')).toBe(false);
  });

  it('matches punctuation keys against their full-width IME forms', () => {
    const pairs: Array<[string, string]> = [
      ['/', '、'],
      ['.', '。'],
      [',', '，'],
      [';', '；'],
      [':', '：'],
    ];
    for (const [key, wide] of pairs) {
      expect(matchesTriggerChar(key, key)).toBe(true);
      expect(matchesTriggerChar(wide, key)).toBe(true);
      expect(startingKeyAliases(key)).toContain(wide);
    }
    expect(matchesTriggerChar('=', '=')).toBe(true);
    expect(matchesTriggerChar('、', '.')).toBe(false);
    // Unknown keys only match themselves.
    expect(triggerCharClass('Enter')).toEqual(['Enter']);
  });

  it('normalizes the stored key and recognizes keydown events', () => {
    expect(normalizeTriggerKey('Space')).toBe(' ');
    expect(normalizeTriggerKey('/')).toBe('/');

    expect(isTriggerKeyEvent(keydown(' ', 'Space'), ' ')).toBe(true);
    // IME / OS layouts that report a non-space key but keep code === 'Space'.
    expect(isTriggerKeyEvent(keydown('Process', 'Space'), ' ')).toBe(true);
    expect(isTriggerKeyEvent(keydown('　'), ' ')).toBe(true);
    expect(isTriggerKeyEvent(keydown('a', 'KeyA'), ' ')).toBe(false);
    expect(isTriggerKeyEvent(keydown('/', 'Slash'), '/')).toBe(true);
    expect(isTriggerKeyEvent(keydown('、'), '/')).toBe(true);
    expect(isTriggerKeyEvent(keydown(' ', 'Space'), '/')).toBe(false);
    expect(isTriggerKeyEvent(keydown('Enter'), 'Enter')).toBe(true);
  });
});
