import { describe, expect, it } from 'vitest';
import { DEFAULT_INLINE_TRANSLATE_SETTINGS, type SiteRule } from '@/types/config';
import { BUILT_IN_INLINE_SITE_OVERRIDES, resolveInlineSiteConfig } from '@/lib/siteRules';

function rule(hostname: string, inlineTranslate?: SiteRule['inlineTranslate']): SiteRule {
  return {
    id: `r-${hostname}`,
    hostname,
    includeSelectors: [],
    excludeSelectors: [],
    alwaysTranslate: false,
    neverTranslate: false,
    builtIn: false,
    inlineTranslate,
  };
}

describe('resolveInlineSiteConfig', () => {
  it('returns the global settings with no selectors when nothing matches', () => {
    const resolved = resolveInlineSiteConfig(DEFAULT_INLINE_TRANSLATE_SETTINGS, 'example.org', []);

    expect(resolved).toMatchObject({
      idleMs: DEFAULT_INLINE_TRANSLATE_SETTINGS.idleMs,
      cancelWindowMs: DEFAULT_INLINE_TRANSLATE_SETTINGS.cancelWindowMs,
      autoLanguageSelectors: [],
    });
  });

  it('applies the most specific matching rule; absent keys fall through to globals', () => {
    const rules = [
      rule('*.example.org', { idleMs: 400, cancelWindowMs: 1000 }),
      rule('chat.example.org', { idleMs: 600 }),
    ];

    const resolved = resolveInlineSiteConfig(DEFAULT_INLINE_TRANSLATE_SETTINGS, 'chat.example.org', rules);

    expect(resolved.idleMs).toBe(600);
    // Only the most-specific rule applies; its absent keys use the globals.
    expect(resolved.cancelWindowMs).toBe(DEFAULT_INLINE_TRANSLATE_SETTINGS.cancelWindowMs);
    expect(resolved.triggerGapMs).toBe(DEFAULT_INLINE_TRANSLATE_SETTINGS.triggerGapMs);
  });

  it('ignores more-specific rules that carry no inline override and invalid numbers', () => {
    const rules = [
      rule('*.example.org', { minDurationMs: 0, triggerGapMs: Number.NaN, autoLanguageEnable: false }),
      rule('chat.example.org'),
    ];

    const resolved = resolveInlineSiteConfig(DEFAULT_INLINE_TRANSLATE_SETTINGS, 'chat.example.org', rules);

    expect(resolved.minDurationMs).toBe(0);
    expect(resolved.triggerGapMs).toBe(DEFAULT_INLINE_TRANSLATE_SETTINGS.triggerGapMs);
    expect(resolved.autoLanguageEnable).toBe(false);
  });

  it('seeds chat-site selectors for the refer built-in hosts', () => {
    const hosts = [
      'x.com',
      'twitter.com',
      'www.reddit.com',
      'www.youtube.com',
      'discord.com',
      'web.telegram.org',
      'web.whatsapp.com',
    ];
    for (const host of hosts) {
      const resolved = resolveInlineSiteConfig(DEFAULT_INLINE_TRANSLATE_SETTINGS, host, []);
      expect(resolved.autoLanguageSelectors.length, host).toBeGreaterThan(0);
    }
    expect(BUILT_IN_INLINE_SITE_OVERRIDES.length).toBeGreaterThanOrEqual(7);
  });

  it('lets a user rule replace built-in seed selectors and keeps seeds otherwise', () => {
    const seeded = resolveInlineSiteConfig(DEFAULT_INLINE_TRANSLATE_SETTINGS, 'discord.com', [
      rule('discord.com', { idleMs: 300 }),
    ]);
    expect(seeded.idleMs).toBe(300);
    expect(seeded.autoLanguageSelectors.length).toBeGreaterThan(0);

    const replaced = resolveInlineSiteConfig(DEFAULT_INLINE_TRANSLATE_SETTINGS, 'discord.com', [
      rule('discord.com', { autoLanguageSelectors: ['.mine'] }),
    ]);
    expect(replaced.autoLanguageSelectors).toEqual(['.mine']);
  });
});
