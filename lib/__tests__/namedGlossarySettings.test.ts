import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from '@/types/config';

describe('named glossary settings defaults', () => {
  it('ships empty named lists and empty per-site map', () => {
    expect(DEFAULT_SETTINGS.namedGlossaryLists).toEqual([]);
    expect(DEFAULT_SETTINGS.subtitleListBySite).toEqual({});
  });
});
