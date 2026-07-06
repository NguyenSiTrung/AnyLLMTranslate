/**
 * Tests for lib/subtitlePreviewCues.ts — FR-9 target-language cues + style chip.
 */

import { describe, it, expect } from 'vitest';
import { getPreviewCuesForLanguage, resolveStyleChipLabel } from '@/lib/subtitlePreviewCues';

describe('getPreviewCuesForLanguage', () => {
  it('returns Vietnamese cues for the vi code', () => {
    const cues = getPreviewCuesForLanguage('vi');
    expect(cues[0]).toEqual({ original: 'Hello world', translated: 'Xin chào thế giới' });
  });

  it('returns Japanese cues for the ja code', () => {
    const cues = getPreviewCuesForLanguage('ja');
    expect(cues[0].translated).toBe('こんにちは世界');
  });

  it('returns the fallback set for an uncatalogued language', () => {
    const cues = getPreviewCuesForLanguage('xx');
    expect(cues[0].translated).toContain('(translated)');
  });

  it('returns the fallback set for an undefined target', () => {
    const cues = getPreviewCuesForLanguage(undefined);
    expect(cues.length).toBeGreaterThan(0);
  });

  it('always returns at least one cue', () => {
    for (const code of ['vi', 'fr', 'zh', 'unknown', '']) {
      expect(getPreviewCuesForLanguage(code).length).toBeGreaterThan(0);
    }
  });
});

describe('resolveStyleChipLabel', () => {
  it('prefers the register override (capitalized)', () => {
    expect(resolveStyleChipLabel({ register: 'formal' })).toBe('Formal');
  });

  it('falls through to faithfulness when register is auto', () => {
    expect(resolveStyleChipLabel({ register: 'auto', faithfulness: 'literal' })).toBe('Literal');
  });

  it('falls through to brevity', () => {
    expect(resolveStyleChipLabel({ brevity: 'terse' })).toBe('Terse');
  });

  it('falls through to profanity', () => {
    expect(resolveStyleChipLabel({ profanity: 'soften' })).toBe('Soften');
  });

  it('returns undefined when nothing is overridden', () => {
    expect(resolveStyleChipLabel({})).toBeUndefined();
    expect(resolveStyleChipLabel(undefined)).toBeUndefined();
  });
});
