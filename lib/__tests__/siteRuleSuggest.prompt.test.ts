import { describe, it, expect } from 'vitest';
import {
  buildSiteRuleSuggestSystemPrompt,
  buildSiteRuleSuggestUserPrompt,
  parseSiteRuleSuggestLlmJson,
} from '@/lib/siteRuleSuggest/prompt';
import type { DomOutline } from '@/lib/siteRuleSuggest/types';

const outline: DomOutline = {
  url: 'https://example.com',
  hostname: 'example.com',
  title: 'T',
  nodes: [{ tag: 'main', textLength: 100, depth: 1, textSample: 'Hi' }],
};

describe('site rule suggest prompts', () => {
  it('builds JSON-only instructions and embeds the compact outline', () => {
    const s = buildSiteRuleSuggestSystemPrompt();
    expect(s.toLowerCase()).toContain('json');
    expect(s).toContain('includeSelectors');
    expect(s).toContain('excludeSelectors');
    expect(s).toContain('hostname');
    const u = buildSiteRuleSuggestUserPrompt(outline);
    expect(u).toContain('example.com');
    expect(u).toContain('main');

    const p = parseSiteRuleSuggestLlmJson(
      '{"hostname":"example.com","includeSelectors":["main"],"excludeSelectors":["nav"],"rationale":"main content"}',
    );
    expect(p?.hostname).toBe('example.com');
    expect(p?.includeSelectors).toEqual(['main']);

    expect(
      parseSiteRuleSuggestLlmJson(
        '```json\n{"hostname":"a.com","includeSelectors":["main"],"excludeSelectors":[]}\n```',
      )?.hostname,
    ).toBe('a.com');
    expect(parseSiteRuleSuggestLlmJson('sorry')).toBeNull();
  });
});
