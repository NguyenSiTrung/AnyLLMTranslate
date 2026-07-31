import { describe, it, expect } from 'vitest';
import { heuristicDraftFromOutline } from '@/lib/siteRuleSuggest/heuristics';
import type { DomOutline } from '@/lib/siteRuleSuggest/types';

const outline: DomOutline = {
  url: 'https://docs.example.com/page',
  hostname: 'docs.example.com',
  title: 'Docs',
  nodes: [
    { tag: 'nav', classes: ['nav'], textLength: 20, depth: 1, textSample: 'Home' },
    {
      tag: 'article',
      id: 'post',
      classes: ['post'],
      textLength: 2000,
      depth: 2,
      textSample: 'Hello',
    },
    { tag: 'aside', classes: ['sidebar'], textLength: 100, depth: 2, textSample: 'Ads' },
    { tag: 'pre', classes: ['highlight'], textLength: 500, depth: 3, textSample: 'code' },
  ],
};

describe('heuristicDraftFromOutline', () => {
  it('builds include/exclude selectors and hostname pattern', () => {
    const d = heuristicDraftFromOutline(outline, 'tab');
    expect(d.source).toBe('tab');
    expect(d.hostname).toBe('*.example.com');
    expect(
      d.includeSelectors.some((s) => s.includes('article') || s.includes('#post')),
    ).toBe(true);
    expect(
      d.excludeSelectors.some(
        (s) => s.includes('nav') || s.includes('sidebar') || s.includes('pre'),
      ),
    ).toBe(true);
    expect(d.warnings).toEqual(expect.arrayContaining(['heuristic_only']));
  });
});
