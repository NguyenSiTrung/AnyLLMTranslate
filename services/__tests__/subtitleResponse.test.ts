/**
 * Tests for subtitle response proper-noun extraction.
 */

import { describe, it, expect } from 'vitest';
import { extractProperNouns } from '@/services/subtitleResponse';

describe('extractProperNouns', () => {
  it('extracts well-formed maps, ignores invalid/missing properNouns, and strips markdown fences and <think> blocks before parsing', () => {
    expect(
      extractProperNouns(
        JSON.stringify({
          translations: { s1: 'Hola' },
          properNouns: { John: 'Juan', MIT: 'MIT' },
        }),
      ),
    ).toEqual({ John: 'Juan', MIT: 'MIT' });

    const invalid = [
      JSON.stringify({ translations: { s1: 'Hola' } }),
      JSON.stringify({ translations: { s1: 'Hola' }, properNouns: 'not an object' }),
      JSON.stringify({ translations: { s1: 'Hola' }, properNouns: {} }),
      'not json at all',
    ];
    for (const response of invalid) {
      expect(extractProperNouns(response)).toBeUndefined();
    }

    const fenced =
      '```json\n' +
      JSON.stringify({
        translations: { s1: 'Hola' },
        properNouns: { John: 'Juan' },
      }) +
      '\n```';
    expect(extractProperNouns(fenced)).toEqual({ John: 'Juan' });

    const think =
      '<think>let me think</think>' +
      JSON.stringify({
        translations: { s1: 'Hola' },
        properNouns: { John: 'Juan' },
      });
    expect(extractProperNouns(think)).toEqual({ John: 'Juan' });
  });
});
