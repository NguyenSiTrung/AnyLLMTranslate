import { describe, it, expect } from 'vitest';
import {
  PREDEFINED_CATEGORIES,
  CATEGORY_GROUPS,
  resolveCategorySource,
  filterCategoryGroups,
  matchesAutoOption,
  matchesCustomOption,
  matchesCategoryQuery,
  normalizePredefinedCategory,
} from '../categories';
import {
  getCategoryPromptSnippet,
  formatCategorySnippetBlock,
  normalizeCategoryKey,
} from '@/lib/categoryPromptSnippets';
import { DEFAULT_SETTINGS } from '@/types/config';

describe('Categories, prompt snippets & glossary settings', () => {
  it('covers predefined categories, resolves sources, searches groups, and resolves prompt snippets', () => {
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

    // LLM category labels normalize onto the predefined allowlist
    expect(normalizePredefinedCategory('software development')).toBe('Software Development');
    expect(normalizePredefinedCategory('  News  ')).toBe('News');
    expect(normalizePredefinedCategory('Financial News')).toBe('Financial News');
    expect(normalizePredefinedCategory('Other')).toBeNull();
    expect(normalizePredefinedCategory('technology')).toBeNull();
    expect(normalizePredefinedCategory('')).toBeNull();
    expect(normalizePredefinedCategory(undefined)).toBeNull();

    // resolves category prompt snippets for every predefined category
    for (const cat of PREDEFINED_CATEGORIES) {
      expect(getCategoryPromptSnippet(cat), cat).toBeTruthy();
    }
    expect(getCategoryPromptSnippet('Documentation')).toMatch(/technical/i);
    expect(getCategoryPromptSnippet('news')).toMatch(/journalistic/i);
    expect(getCategoryPromptSnippet('Health & Medicine')).toMatch(/medical/i);
    expect(getCategoryPromptSnippet('Software Development')).toMatch(/technical|API|code/i);
    expect(getCategoryPromptSnippet('Financial News')).toMatch(/ticker|finance|currency/i);
    expect(getCategoryPromptSnippet('totally-unknown-xyz')).toBeNull();

    const block = formatCategorySnippetBlock('Software Development');
    expect(block).toContain('<page_category>Software Development</page_category>');
    expect(block).toContain('<category_rules>');

    expect(normalizeCategoryKey('  News  ')).toBe('news');
    expect(DEFAULT_SETTINGS.namedGlossaryLists).toEqual([]);
    expect(DEFAULT_SETTINGS.subtitleListBySite).toEqual({});
  });
});
