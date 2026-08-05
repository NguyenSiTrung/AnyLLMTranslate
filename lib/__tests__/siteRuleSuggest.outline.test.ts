/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { buildDomOutline, OUTLINE_MAX_NODES } from '@/lib/siteRuleSuggest/outline';

function dom(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('buildDomOutline', () => {
  it('captures relevant nodes with caps while skipping script/style and empty noise', () => {
    const doc = dom(`<!doctype html><html><head><title>Hello</title></head>
      <body>
        <nav class="top-nav">Home</nav>
        <main id="main"><article class="post content"><p>${'word '.repeat(50)}</p></article></main>
        <aside class="sidebar">Ads</aside>
        <footer>F</footer>
        <pre class="code">x=1</pre>
      </body></html>`);
    const outline = buildDomOutline(doc, {
      url: 'https://example.com/a',
      hostname: 'example.com',
    });
    expect(outline.title).toBe('Hello');
    expect(outline.hostname).toBe('example.com');
    expect(outline.nodes.length).toBeGreaterThan(0);
    expect(outline.nodes.length).toBeLessThanOrEqual(OUTLINE_MAX_NODES);
    const tags = outline.nodes.map((n) => n.tag);
    expect(tags).toEqual(
      expect.arrayContaining(['nav', 'main', 'article', 'aside', 'footer', 'pre']),
    );
    const article = outline.nodes.find((n) => n.tag === 'article');
    expect(article?.id).toBeUndefined();
    expect(article?.classes?.length).toBeGreaterThan(0);
    expect((article?.textSample ?? '').length).toBeLessThanOrEqual(80);
    const noiseDoc = dom(
      `<html><body><script>alert(1)</script><style>x{}</style><div></div><p>Hi there friend</p></body></html>`,
    );
    const noiseOutline = buildDomOutline(noiseDoc, { url: 'https://x.test', hostname: 'x.test' });
    expect(noiseOutline.nodes.every((n) => n.tag !== 'script' && n.tag !== 'style')).toBe(
      true,
    );
  });
});
