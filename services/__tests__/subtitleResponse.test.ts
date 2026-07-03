/**
 * Tests for subtitle response proper-noun extraction.
 */

import { describe, it, expect } from 'vitest';
import { extractProperNouns } from '@/services/subtitleResponse';

describe('extractProperNouns', () => {
  it('returns the properNouns map when present and well-formed', () => {
    const response = JSON.stringify({
      translations: { s1: 'Hola' },
      properNouns: { John: 'Juan', MIT: 'MIT' },
    });
    const result = extractProperNouns(response);
    expect(result).toEqual({ John: 'Juan', MIT: 'MIT' });
  });

  it.each([
    ['absent', JSON.stringify({ translations: { s1: 'Hola' } })],
    ['not an object', JSON.stringify({ translations: { s1: 'Hola' }, properNouns: 'not an object' })],
    ['empty object', JSON.stringify({ translations: { s1: 'Hola' }, properNouns: {} })],
    ['not valid JSON', 'not json at all'],
  ])('returns undefined when properNouns is %s', (_label, response) => {
    expect(extractProperNouns(response)).toBeUndefined();
  });

  it('extracts properNouns from a response wrapped in markdown code fences', () => {
    const response = '```json\n' + JSON.stringify({
      translations: { s1: 'Hola' },
      properNouns: { John: 'Juan' },
    }) + '\n```';
    expect(extractProperNouns(response)).toEqual({ John: 'Juan' });
  });

  it('strips <think> blocks before parsing', () => {
    const response = '<think>let me think</think>' + JSON.stringify({
      translations: { s1: 'Hola' },
      properNouns: { John: 'Juan' },
    });
    expect(extractProperNouns(response)).toEqual({ John: 'Juan' });
  });
});
