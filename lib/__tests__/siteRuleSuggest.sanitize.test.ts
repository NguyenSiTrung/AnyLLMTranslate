import { describe, it, expect } from 'vitest';
import {
  sanitizeSelector,
  sanitizeDraft,
} from '@/lib/siteRuleSuggest/sanitize';
import type { SuggestSiteRuleDraft } from '@/lib/siteRuleSuggest/types';

const base: SuggestSiteRuleDraft = {
  hostname: 'example.com',
  includeSelectors: ['main'],
  excludeSelectors: ['nav'],
  source: 'tab',
};

describe('sanitizeSelector', () => {
  it('keeps simple selectors and drops junk', () => {
    expect(sanitizeSelector(' article.post ')).toBe('article.post');
    expect(sanitizeSelector('')).toBeNull();
    expect(sanitizeSelector('a'.repeat(300))).toBeNull();
    expect(sanitizeSelector('div > script')).toBeNull();
    expect(sanitizeSelector('p:has(script)')).toBeNull();
  });
});

describe('sanitizeDraft', () => {
  it('falls back fields and merges warnings', () => {
    const d = sanitizeDraft(
      {
        hostname: '*.Evil.com.',
        includeSelectors: ['main', 'main', ''],
        excludeSelectors: ['nav', 'javascript:x'],
        source: 'fetch',
        alwaysTranslate: true,
        neverTranslate: true,
        warnings: ['spa'],
      },
      base,
    );
    expect(d.hostname).toBe('*.evil.com');
    expect(d.includeSelectors).toEqual(['main']);
    expect(d.excludeSelectors).toEqual(['nav']);
    expect(d.alwaysTranslate).toBeFalsy();
    expect(d.neverTranslate).toBeFalsy();
    expect(d.warnings).toEqual(expect.arrayContaining(['spa']));
  });
});
