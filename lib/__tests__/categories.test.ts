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

describe('CATEGORY_GROUPS', () => {
  it('covers every predefined category exactly once', () => {
    const flat = CATEGORY_GROUPS.flatMap((g) => [...g.items]);
    expect(new Set(flat).size).toBe(flat.length);
    expect(new Set(flat)).toEqual(new Set(PREDEFINED_CATEGORIES));
  });
});

describe('resolveCategorySource', () => {
  it('prefers tab override over site rule', () => {
    expect(resolveCategorySource({ override: 'News', siteRule: 'Gaming' })).toBe('tab');
  });

  it('returns rule when only site rule is set', () => {
    expect(resolveCategorySource({ siteRule: 'News' })).toBe('rule');
  });

  it('returns auto by default', () => {
    expect(resolveCategorySource(null)).toBe('auto');
    expect(resolveCategorySource({})).toBe('auto');
  });
});

describe('search helpers', () => {
  it('matches category labels with substring', () => {
    expect(matchesCategoryQuery('Software Development', 'soft')).toBe(true);
    expect(matchesCategoryQuery('News', 'xyz')).toBe(false);
  });

  it('matches Auto with normal query direction', () => {
    expect(matchesAutoOption('auto')).toBe(true);
    // inverted `'auto'.includes('detect')` was false — label.includes is true
    expect(matchesAutoOption('detect')).toBe(true);
    expect(matchesAutoOption('xyznope')).toBe(false);
  });

  it('matches Custom with normal query direction', () => {
    expect(matchesCustomOption('cus')).toBe(true);
    expect(matchesCustomOption('xyz')).toBe(false);
  });

  it('filters groups by query', () => {
    const filtered = filterCategoryGroups(CATEGORY_GROUPS, 'news');
    expect(filtered.some((g) => g.items.includes('News'))).toBe(true);
    expect(filtered.every((g) => g.items.every((i) => i.toLowerCase().includes('news')))).toBe(
      true,
    );
  });
});
