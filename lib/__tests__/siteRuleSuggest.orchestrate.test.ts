import { describe, it, expect } from 'vitest';
import { buildSuggestSiteRuleDraft } from '@/lib/siteRuleSuggest/orchestrate';
import type { DomOutline } from '@/lib/siteRuleSuggest/types';

const sampleOutline: DomOutline = {
  url: 'https://example.com',
  hostname: 'example.com',
  title: 'Ex',
  nodes: [
    { tag: 'main', textLength: 500, depth: 1, textSample: 'Hello world content here' },
    { tag: 'nav', textLength: 20, depth: 1, textSample: 'Home' },
  ],
};

describe('buildSuggestSiteRuleDraft', () => {
  it('prefers open tab and uses LLM JSON', async () => {
    const r = await buildSuggestSiteRuleDraft({
      urlInput: 'https://example.com',
      findOpenTabOutline: async () => sampleOutline,
      loadUrlOutline: async () => {
        throw new Error('should not load');
      },
      runLlm: async () =>
        JSON.stringify({
          hostname: 'example.com',
          includeSelectors: ['main'],
          excludeSelectors: ['nav'],
          rationale: 'Main column',
        }),
    });
    expect(r.success).toBe(true);
    expect(r.draft?.source).toBe('tab');
    expect(r.draft?.includeSelectors).toContain('main');
    expect(r.draft?.warnings ?? []).not.toContain('heuristic_only');
    expect(r.draft?.rationale).toMatch(/main/i);
  });

  it('falls back to loadUrl and heuristics when LLM null', async () => {
    const r = await buildSuggestSiteRuleDraft({
      urlInput: 'https://docs.example.com/x',
      findOpenTabOutline: async () => null,
      loadUrlOutline: async () => ({
        outline: {
          ...sampleOutline,
          hostname: 'docs.example.com',
          url: 'https://docs.example.com/x',
        },
        warnings: ['loaded_in_temp_tab'],
      }),
      runLlm: async () => null,
    });
    expect(r.success).toBe(true);
    expect(r.draft?.source).toBe('fetch');
    expect(r.draft?.warnings).toEqual(
      expect.arrayContaining(['heuristic_only', 'loaded_in_temp_tab']),
    );
  });

  it('errors on bad URLs and when capture fails', async () => {
    const r = await buildSuggestSiteRuleDraft({
      urlInput: 'javascript:alert(1)',
      findOpenTabOutline: async () => null,
      loadUrlOutline: async () => {
        throw new Error('nope');
      },
      runLlm: async () => null,
    });
    expect(r.success).toBe(false);
    expect(r.error).toBeTruthy();

    const r2 = await buildSuggestSiteRuleDraft({
      urlInput: 'https://example.com',
      findOpenTabOutline: async () => null,
      loadUrlOutline: async () => {
        throw new Error('net fail');
      },
      runLlm: async () => null,
    });
    expect(r2.success).toBe(false);
  });
});
