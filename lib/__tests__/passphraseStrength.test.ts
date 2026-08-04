import { describe, expect, it } from 'vitest';
import { passphraseStrength } from '../passphraseStrength';

describe('passphraseStrength', () => {
  it('returns null for empty input (meter hidden) and classifies weak, fair, and strong passphrases by length and character classes', () => {
    expect(passphraseStrength('')).toBeNull();

    // weak: under 8 chars, or 8+ with a single class below 12 chars
    expect(passphraseStrength('abc')).toBe('weak');
    expect(passphraseStrength('abcdefgh')).toBe('weak');

    // fair: 8+ with two classes, or 12+ with fewer than three classes
    expect(passphraseStrength('abcd1234')).toBe('fair');
    expect(passphraseStrength('Abcdefgh')).toBe('fair');
    expect(passphraseStrength('abcdefghijkl')).toBe('fair');
    expect(passphraseStrength('abcdefghij12')).toBe('fair');

    // strong: 12+ chars with three or more classes
    expect(passphraseStrength('Abcdefg12345')).toBe('strong');
    expect(passphraseStrength('abcd1234!@#$')).toBe('strong');
  });
});
