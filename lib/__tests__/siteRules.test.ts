import { describe, it, expect } from 'vitest';
import { matchHostname, findMatchingRule, findEffectiveRule, BUILT_IN_RULES } from '@/lib/siteRules';
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
  describe('exact match', () => {
    it('matches identical hostnames', () => {
      expect(matchHostname('example.com', 'example.com')).toBe(true);
    });

    it('matches case-insensitively', () => {
      expect(matchHostname('Example.COM', 'example.com')).toBe(true);
    });

    it('does not match different hostnames', () => {
      expect(matchHostname('other.com', 'example.com')).toBe(false);
    });

    it('matches localhost', () => {
      expect(matchHostname('localhost', 'localhost')).toBe(true);
    });
  });

  describe('wildcard match', () => {
    it('matches subdomain with *.example.com', () => {
      expect(matchHostname('sub.example.com', '*.example.com')).toBe(true);
    });

    it('matches deeply nested subdomain', () => {
      expect(matchHostname('a.b.example.com', '*.example.com')).toBe(true);
    });

    it('does NOT match bare domain with wildcard', () => {
      expect(matchHostname('example.com', '*.example.com')).toBe(false);
    });

    it('is case-insensitive for wildcards', () => {
      expect(matchHostname('Sub.Example.COM', '*.example.com')).toBe(true);
    });
  });

  describe('no-match cases', () => {
    it('returns false for partial hostname match', () => {
      expect(matchHostname('notexample.com', '*.example.com')).toBe(false);
    });

    it('returns false for unrelated domain', () => {
      expect(matchHostname('google.com', '*.example.com')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('returns false for empty hostname', () => {
      expect(matchHostname('', 'example.com')).toBe(false);
    });

    it('returns false for empty pattern', () => {
      expect(matchHostname('example.com', '')).toBe(false);
    });

    it('returns false for both empty', () => {
      expect(matchHostname('', '')).toBe(false);
    });
  });
});

describe('findMatchingRule', () => {
  const rules: SiteRule[] = [
    makeSiteRule({ id: 'r1', hostname: '*.google.com', alwaysTranslate: true }),
    makeSiteRule({ id: 'r2', hostname: 'example.com', neverTranslate: true }),
    makeSiteRule({ id: 'r3', hostname: '*.example.com', alwaysTranslate: true }),
  ];

  it('returns the first matching rule', () => {
    const result = findMatchingRule('docs.google.com', rules);
    expect(result?.id).toBe('r1');
  });

  it('matches exact hostname rules', () => {
    const result = findMatchingRule('example.com', rules);
    expect(result?.id).toBe('r2');
  });

  it('returns undefined when no rule matches', () => {
    expect(findMatchingRule('unknown.org', rules)).toBeUndefined();
  });

  it('returns undefined for empty rules array', () => {
    expect(findMatchingRule('example.com', [])).toBeUndefined();
  });

  it('first match wins when multiple rules could match', () => {
    const overlapping: SiteRule[] = [
      makeSiteRule({ id: 'first', hostname: '*.example.com' }),
      makeSiteRule({ id: 'second', hostname: '*.example.com' }),
    ];
    expect(findMatchingRule('sub.example.com', overlapping)?.id).toBe('first');
  });

  it('handles undefined rules by defaulting to empty array', () => {
    expect(findMatchingRule('example.com', undefined as unknown as SiteRule[])).toBeUndefined();
  });
});

describe('findEffectiveRule', () => {
  it('returns user rule over built-in rule for same hostname', () => {
    const userRule = makeSiteRule({ id: 'user-github', hostname: 'github.com', alwaysTranslate: true });
    const result = findEffectiveRule('github.com', [userRule]);
    expect(result?.id).toBe('user-github');
    expect(result?.alwaysTranslate).toBe(true);
  });

  it('falls back to built-in rule when no user rule matches', () => {
    const result = findEffectiveRule('github.com', []);
    expect(result).toBeDefined();
    expect(result?.builtIn).toBe(true);
    expect(result?.hostname).toBe('github.com');
  });

  it('falls back to built-in wildcard rule', () => {
    const result = findEffectiveRule('gist.github.com', []);
    expect(result).toBeDefined();
    expect(result?.builtIn).toBe(true);
    expect(result?.hostname).toBe('*.github.com');
  });

  it('returns undefined for unknown hostnames with no user rules', () => {
    expect(findEffectiveRule('unknown.example.com', [])).toBeUndefined();
  });

  it('handles undefined userRules gracefully', () => {
    const result = findEffectiveRule('github.com', undefined as unknown as SiteRule[]);
    expect(result).toBeDefined();
    expect(result?.builtIn).toBe(true);
  });
});

describe('BUILT_IN_RULES', () => {
  it('contains expected platforms', () => {
    const hostnames = BUILT_IN_RULES.map((r) => r.hostname);
    expect(hostnames).toContain('github.com');
    expect(hostnames).toContain('*.github.com');
    expect(hostnames).toContain('stackoverflow.com');
    expect(hostnames).toContain('*.reddit.com');
    expect(hostnames).toContain('twitter.com');
    expect(hostnames).toContain('x.com');
    expect(hostnames).toContain('*.wikipedia.org');
    expect(hostnames).toContain('medium.com');
    expect(hostnames).toContain('huggingface.co');
    expect(hostnames).toContain('pypi.org');
    expect(hostnames).toContain('www.npmjs.com');
    expect(hostnames).toContain('*.gitlab.com');
    expect(hostnames).toContain('gitlab.com');
    expect(hostnames).toContain('*.substack.com');
    expect(hostnames).toContain('*.youtube.com');
    expect(hostnames).toContain('youtube.com');
  });

  it('all rules are marked built-in', () => {
    for (const rule of BUILT_IN_RULES) {
      expect(rule.builtIn).toBe(true);
    }
  });

  it('github rules have include and exclude selectors', () => {
    const github = BUILT_IN_RULES.find((r) => r.hostname === 'github.com');
    expect(github?.includeSelectors).toContain('.markdown-body');
    expect(github?.excludeSelectors).toContain('pre');
  });
});
