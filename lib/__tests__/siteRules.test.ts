import { describe, it, expect } from 'vitest';
import {
  matchHostname,
  findMatchingRule,
  findEffectiveRule,
  mergeExcludeSelectors,
  BUILT_IN_RULES,
} from '@/lib/siteRules';
import type { SiteRule } from '@/types/config';

function makeSiteRule(overrides: Partial<SiteRule> & { hostname: string }): SiteRule {
  return {
    id: 'test',
    includeSelectors: [],
    excludeSelectors: [],
    alwaysTranslate: false,
    neverTranslate: false,
    builtIn: false,
    ...overrides,
  };
}

describe('matchHostname', () => {
  it('matches exact (case-insensitive), wildcards, and rejects empty/partial', () => {
    expect(matchHostname('Example.COM', 'example.com')).toBe(true);
    expect(matchHostname('sub.example.com', '*.example.com')).toBe(true);
    expect(matchHostname('example.com', '*.example.com')).toBe(false);
    expect(matchHostname('notexample.com', '*.example.com')).toBe(false);
    expect(matchHostname('', 'example.com')).toBe(false);
  });
});

describe('findMatchingRule', () => {
  const rules: SiteRule[] = [
    makeSiteRule({ id: 'r1', hostname: '*.google.com', alwaysTranslate: true }),
    makeSiteRule({ id: 'r2', hostname: 'example.com', neverTranslate: true }),
    makeSiteRule({ id: 'r3', hostname: '*.example.com', alwaysTranslate: true }),
  ];

  it('returns first match and handles misses / empty input', () => {
    expect(findMatchingRule('docs.google.com', rules)?.id).toBe('r1');
    expect(findMatchingRule('example.com', rules)?.id).toBe('r2');
    expect(findMatchingRule('unknown.org', rules)).toBeUndefined();
    expect(findMatchingRule('example.com', [])).toBeUndefined();
    const overlapping: SiteRule[] = [
      makeSiteRule({ id: 'first', hostname: '*.example.com' }),
      makeSiteRule({ id: 'second', hostname: '*.example.com' }),
    ];
    expect(findMatchingRule('sub.example.com', overlapping)?.id).toBe('first');
  });
});

describe('findEffectiveRule', () => {
  it('prefers user rules and falls back to built-ins', () => {
    const userRule = makeSiteRule({
      id: 'user-github',
      hostname: 'github.com',
      alwaysTranslate: true,
    });
    expect(findEffectiveRule('github.com', [userRule])?.id).toBe('user-github');
    const builtin = findEffectiveRule('github.com', []);
    expect(builtin?.builtIn).toBe(true);
    expect(findEffectiveRule('gist.github.com', [])?.hostname).toBe('*.github.com');
    expect(findEffectiveRule('unknown.example.com', [])).toBeUndefined();
  });
});

describe('BUILT_IN_RULES', () => {
  it('marks rules built-in and never hard-excludes bare inline code', () => {
    expect(BUILT_IN_RULES.every((r) => r.builtIn)).toBe(true);
    for (const rule of BUILT_IN_RULES) {
      expect(rule.excludeSelectors).not.toContain('code');
    }
    const github = BUILT_IN_RULES.find((r) => r.hostname === 'github.com');
    expect(github?.includeSelectors).toContain('.markdown-body');
    expect(github?.excludeSelectors).toContain('pre');
  });
});

describe('mergeExcludeSelectors', () => {
  it('merges without duplicates and preserves case', () => {
    expect(mergeExcludeSelectors(['pre', 'code'], ['pre', '.sidebar'])).toEqual([
      'pre',
      'code',
      '.sidebar',
    ]);
    expect(mergeExcludeSelectors([], undefined)).toEqual([]);
    expect(mergeExcludeSelectors(['PRE'], ['pre'])).toEqual(['PRE', 'pre']);
  });
});
