/**
 * Tests: deepMerge utility (Phase D)
 */
import { describe, it, expect } from 'vitest';
import { deepMerge } from '@/lib/utils';

describe('deepMerge', () => {
  it('shallow-merges top-level keys', () => {
    const target = { a: 1, b: 2 };
    const source = { b: 3, c: 4 };
    expect(deepMerge(target, source)).toEqual({ a: 1, b: 3, c: 4 });
  });

  it('deep-merges nested objects without losing sibling keys', () => {
    const target = {
      provider: { preset: 'custom', model: 'gemma3:4b', apiKey: '' },
      theme: 'blockquote',
    };
    const source = {
      provider: { model: 'llama3' },
    };
    const result = deepMerge(target, source);
    expect(result.provider).toEqual({ preset: 'custom', model: 'llama3', apiKey: '' });
    expect(result.theme).toBe('blockquote');
  });

  it('deep-merges subtitleSettings', () => {
    const defaults = {
      subtitleSettings: {
        position: 'bottom',
        fontSize: 16,
        backgroundOpacity: 0.7,
        enabled: true,
        fontFamily: 'system',
        displayMode: 'bilingual',
        translationTimeout: 30,
      },
    };
    const stored = {
      subtitleSettings: {
        fontFamily: 'serif',
        displayMode: 'translation-only',
      },
    };
    const result = deepMerge(defaults, stored);
    expect(result.subtitleSettings).toEqual({
      position: 'bottom',
      fontSize: 16,
      backgroundOpacity: 0.7,
      enabled: true,
      fontFamily: 'serif',
      displayMode: 'translation-only',
      translationTimeout: 30,
    });
  });

  it('does not merge arrays — overwrites them', () => {
    const target = { items: [1, 2] };
    const source = { items: [3] };
    expect(deepMerge(target, source)).toEqual({ items: [3] });
  });

  it('ignores undefined values in source', () => {
    const target = { a: 1, b: 2 };
    const source = { a: undefined, c: 3 };
    expect(deepMerge(target, source)).toEqual({ a: 1, b: 2, c: 3 });
  });
});
