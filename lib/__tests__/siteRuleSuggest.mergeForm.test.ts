import { describe, it, expect } from 'vitest';
import { mergeSuggestDraftIntoRuleForm } from '@/lib/siteRuleSuggest/mergeForm';
import type { SuggestSiteRuleDraft } from '@/lib/siteRuleSuggest/types';

const draft: SuggestSiteRuleDraft = {
  hostname: 'example.com',
  includeSelectors: ['main', 'article'],
  excludeSelectors: ['nav'],
  source: 'tab',
  category: 'Tech',
  alwaysTranslate: true,
};

describe('mergeSuggestDraftIntoRuleForm', () => {
  it('applies draft fields for add/edit while preserving non-default mode settings', () => {
    const form = {
      hostname: '',
      includeSelectors: [] as string[],
      excludeSelectors: [] as string[],
      alwaysTranslate: false,
      neverTranslate: false,
      categoryValue: '__none__',
    };
    const next = mergeSuggestDraftIntoRuleForm(form, draft, true);
    expect(next.hostname).toBe('example.com');
    expect(next.includeSelectors).toEqual(['main', 'article']);
    expect(next.excludeSelectors).toEqual(['nav']);
    expect(next.alwaysTranslate).toBe(true);
    expect(next.categoryValue).toBe('Tech');

    const editForm = {
      hostname: 'keep.me',
      includeSelectors: ['.old'],
      excludeSelectors: [] as string[],
      alwaysTranslate: false,
      neverTranslate: false,
      categoryValue: '__none__',
    };
    const editNext = mergeSuggestDraftIntoRuleForm(editForm, draft, false);
    expect(editNext.hostname).toBe('keep.me');
    expect(editNext.includeSelectors).toEqual(['main', 'article']);
    const modeForm = {
      hostname: 'x.com',
      includeSelectors: [] as string[],
      excludeSelectors: [] as string[],
      alwaysTranslate: false,
      neverTranslate: true,
      categoryValue: 'News',
    };
    const modeNext = mergeSuggestDraftIntoRuleForm(modeForm, draft, false);
    expect(modeNext.neverTranslate).toBe(true);
    expect(modeNext.alwaysTranslate).toBe(false);
    expect(modeNext.categoryValue).toBe('News');
  });
});
