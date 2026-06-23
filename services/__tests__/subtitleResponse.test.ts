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

  it('returns undefined when properNouns is absent', () => {
    const response = JSON.stringify({ translations: { s1: 'Hola' } });
    expect(extractProperNouns(response)).toBeUndefined();
  });

  it('returns undefined when properNouns is not an object', () => {
    const response = JSON.stringify({
      translations: { s1: 'Hola' },
      properNouns: 'not an object',
    });
    expect(extractProperNouns(response)).toBeUndefined();
  });

  it('returns undefined when response is not valid JSON', () => {
    expect(extractProperNouns('not json at all')).toBeUndefined();
  });

  it('returns undefined when properNouns is an empty object', () => {
    const response = JSON.stringify({
      translations: { s1: 'Hola' },
      properNouns: {},
    });
    // Empty object is technically valid but carries no data — return undefined
    // so callers can skip the merge step.
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
