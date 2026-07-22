import { describe, it, expect } from 'vitest';
import {
  PREDEFINED_CATEGORIES,
  CATEGORY_GROUPS,
  resolveCategorySource,
  filterCategoryGroups,
  matchesAutoOption,
  matchesCustomOption,
  matchesCategoryQuery,
} from '../categories';
import {
  getCategoryPromptSnippet,
  formatCategorySnippetBlock,
  normalizeCategoryKey,
} from '@/lib/categoryPromptSnippets';
import { DEFAULT_SETTINGS } from '@/types/config';

describe('Categories, prompt snippets & glossary settings', () => {
  it('covers predefined categories, resolves category source, and searches groups', () => {
    const flat = CATEGORY_GROUPS.flatMap((g) => [...g.items]);
    expect(new Set(flat).size).toBe(flat.length);
    expect(new Set(flat)).toEqual(new Set(PREDEFINED_CATEGORIES));

    expect(resolveCategorySource({ override: 'News', siteRule: 'Gaming' })).toBe('tab');
    expect(resolveCategorySource({ siteRule: 'News' })).toBe('rule');
    expect(resolveCategorySource(null)).toBe('auto');

    expect(matchesCategoryQuery('Software Development', 'soft')).toBe(true);
    expect(matchesAutoOption('auto')).toBe(true);
    expect(matchesCustomOption('cus')).toBe(true);

    const filtered = filterCategoryGroups(CATEGORY_GROUPS, 'news');
    expect(filtered.some((g) => g.items.includes('News'))).toBe(true);
  });

  it('resolves category prompt snippets and ships default named list settings', () => {
    expect(getCategoryPromptSnippet('Documentation')).toMatch(/technical/i);
    expect(getCategoryPromptSnippet('news')).toMatch(/journalistic/i);
    expect(getCategoryPromptSnippet('totally-unknown-xyz')).toBeNull();

    const block = formatCategorySnippetBlock('documentation');
    expect(block).toContain('<page_category>documentation</page_category>');
    expect(block).toContain('<category_rules>');

    expect(normalizeCategoryKey('  News  ')).toBe('news');
    expect(DEFAULT_SETTINGS.namedGlossaryLists).toEqual([]);
    expect(DEFAULT_SETTINGS.subtitleListBySite).toEqual({});
  });
});
