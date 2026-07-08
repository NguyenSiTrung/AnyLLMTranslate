import { describe, it, expect, beforeEach } from 'vitest';
import { extractPieces, resetPieceCounter } from '../domWalker';
import { __resetMatchCacheForTest } from '@/lib/domUtils';

describe('domWalker — selector-match cache integration', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    resetPieceCounter();
    __resetMatchCacheForTest();
  });

  it('reduces .matches() calls vs node count when many elements share selectors', () => {
    // Build a tree with 10 <p> elements, all sharing class "sidebar".
    // Exclude selector ".sidebar" should cache after the first match.
    const container = document.createElement('div');
    for (let i = 0; i < 10; i++) {
      const p = document.createElement('p');
      p.className = 'sidebar';
      p.textContent = `Sidebar text ${i}`;
      container.appendChild(p);
    }
    // Add 5 non-sidebar paragraphs
    for (let i = 0; i < 5; i++) {
      const p = document.createElement('p');
      p.textContent = `Main text ${i}`;
      container.appendChild(p);
    }
    document.body.appendChild(container);

    // Spy on Element.prototype.matches to count calls
    const originalMatches = Element.prototype.matches;
    let matchCallCount = 0;
    Element.prototype.matches = function (selector: string): boolean {
      matchCallCount++;
      return originalMatches.call(this, selector);
    };

    try {
      const pieces = extractPieces(document.body, {
        excludeSelectors: ['.sidebar'],
      });

      // All sidebar paragraphs excluded; only main text pieces remain
      expect(pieces.length).toBe(5);

      // Without caching, .matches() would be called once per element per selector.
      // With caching, repeated ".sidebar" checks on same elements hit the cache.
      // The exact count depends on walker traversal, but it should be
      // significantly less than the total number of elements × selectors.
      // Total elements walked ≈ 17 (div + 10 p + 5 p + body).
      // Without cache: ~17 calls to .matches('.sidebar').
      // With cache: each unique element is checked once, but the cache means
      // the same element isn't re-checked. However the walker visits each
      // element once, so we verify the cache is working by checking that
      // re-extracting the same tree does NOT increment the count further.

      // Re-extract — cache should prevent any new .matches() calls
      matchCallCount = 0;
      extractPieces(document.body, {
        excludeSelectors: ['.sidebar'],
      });
      expect(matchCallCount).toBe(0); // all cached
    } finally {
      Element.prototype.matches = originalMatches;
    }
  });

  it('produces identical results with and without cache (regression)', () => {
    const container = document.createElement('div');
    const article = document.createElement('article');
    const p1 = document.createElement('p');
    p1.textContent = 'Article paragraph one.';
    const p2 = document.createElement('p');
    p2.className = 'ad';
    p2.textContent = 'Advertisement text.';
    article.appendChild(p1);
    article.appendChild(p2);
    container.appendChild(article);

    const nav = document.createElement('nav');
    const navLink = document.createElement('a');
    navLink.textContent = 'Home';
    nav.appendChild(navLink);
    container.appendChild(nav);

    document.body.appendChild(container);

    __resetMatchCacheForTest();
    const pieces = extractPieces(document.body, {
      excludeSelectors: ['.ad', 'nav'],
    });

    // nav excluded, .ad excluded; only the article paragraph remains
    expect(pieces.length).toBe(1);
    expect(pieces[0].text).toBe('Article paragraph one.');
  });

  it('handles empty exclude selectors without errors', () => {
    const p = document.createElement('p');
    p.textContent = 'Hello world.';
    document.body.appendChild(p);

    const pieces = extractPieces(document.body, {});
    expect(pieces.length).toBe(1);
    expect(pieces[0].text).toBe('Hello world.');
  });

  it('tags pieces inside <article> with inArticleContext=true (FR-3)', () => {
    const article = document.createElement('article');
    const p = document.createElement('p');
    p.textContent = 'Article body text.';
    article.appendChild(p);
    document.body.appendChild(article);

    const pieces = extractPieces(document.body, {});
    expect(pieces.length).toBe(1);
    expect(pieces[0].inArticleContext).toBe(true);
  });

  it('tags pieces inside <main> with inArticleContext=true (FR-3)', () => {
    const main = document.createElement('main');
    const p = document.createElement('p');
    p.textContent = 'Main body text.';
    main.appendChild(p);
    document.body.appendChild(main);

    const pieces = extractPieces(document.body, {});
    expect(pieces.length).toBe(1);
    expect(pieces[0].inArticleContext).toBe(true);
  });

  it('tags pieces outside article/main with inArticleContext=false (FR-3)', () => {
    const aside = document.createElement('aside');
    const p = document.createElement('p');
    p.textContent = 'Sidebar text here.';
    aside.appendChild(p);
    document.body.appendChild(aside);

    const pieces = extractPieces(document.body, {});
    expect(pieces.length).toBe(1);
    expect(pieces[0].inArticleContext).toBe(false);
  });

  it('tags nav links with inArticleContext=false (FR-3)', () => {
    const nav = document.createElement('nav');
    const div = document.createElement('div');
    const a = document.createElement('a');
    a.textContent = 'Navigation link text';
    div.appendChild(a);
    nav.appendChild(div);
    document.body.appendChild(nav);

    const pieces = extractPieces(document.body, {});
    expect(pieces.length).toBe(1);
    expect(pieces[0].inArticleContext).toBe(false);
  });

  it('mixed page: article pieces true, sidebar pieces false (FR-3)', () => {
    const article = document.createElement('article');
    const p1 = document.createElement('p');
    p1.textContent = 'Article paragraph.';
    article.appendChild(p1);
    document.body.appendChild(article);

    const aside = document.createElement('aside');
    const p2 = document.createElement('p');
    p2.textContent = 'Sidebar paragraph.';
    aside.appendChild(p2);
    document.body.appendChild(aside);

    const pieces = extractPieces(document.body, {});
    expect(pieces.length).toBe(2);
    expect(pieces[0].text).toBe('Article paragraph.');
    expect(pieces[0].inArticleContext).toBe(true);
    expect(pieces[1].text).toBe('Sidebar paragraph.');
    expect(pieces[1].inArticleContext).toBe(false);
  });
});

describe('domWalker — body-tag whitelist (FR-4)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    resetPieceCounter();
    __resetMatchCacheForTest();
  });

  it('with whitelist ON, skips direct-child <nav> and <aside> under <body>', () => {
    const nav = document.createElement('nav');
    const navLink = document.createElement('a');
    navLink.textContent = 'Navigation link text';
    nav.appendChild(navLink);

    const aside = document.createElement('aside');
    const asideP = document.createElement('p');
    asideP.textContent = 'Sidebar text content';
    aside.appendChild(asideP);

    const main = document.createElement('main');
    const mainP = document.createElement('p');
    mainP.textContent = 'Main article text content';
    main.appendChild(mainP);

    document.body.appendChild(nav);
    document.body.appendChild(aside);
    document.body.appendChild(main);

    const pieces = extractPieces(document.body, { enableBodyTagWhitelist: true });
    // Only the <main> subtree is walked; nav and aside are skipped
    expect(pieces.length).toBe(1);
    expect(pieces[0].text).toBe('Main article text content');
  });

  it('with whitelist ON, descends into <div> direct children', () => {
    const div = document.createElement('div');
    const p = document.createElement('p');
    p.textContent = 'Content inside a div.';
    div.appendChild(p);
    document.body.appendChild(div);

    const pieces = extractPieces(document.body, { enableBodyTagWhitelist: true });
    expect(pieces.length).toBe(1);
    expect(pieces[0].text).toBe('Content inside a div.');
  });

  it('with whitelist OFF, descends into all direct children (regression)', () => {
    const nav = document.createElement('nav');
    const navLink = document.createElement('a');
    navLink.textContent = 'Navigation link text';
    nav.appendChild(navLink);

    const main = document.createElement('main');
    const mainP = document.createElement('p');
    mainP.textContent = 'Main article text content';
    main.appendChild(mainP);

    document.body.appendChild(nav);
    document.body.appendChild(main);

    const pieces = extractPieces(document.body, {});
    // Both nav and main are walked when whitelist is off
    expect(pieces.length).toBe(2);
  });

  it('whitelist does not affect deeper nesting within allowed tags', () => {
    const main = document.createElement('main');
    const nav = document.createElement('nav');
    const navLink = document.createElement('a');
    navLink.textContent = 'Nested nav link text';
    nav.appendChild(navLink);
    main.appendChild(nav);
    document.body.appendChild(main);

    const pieces = extractPieces(document.body, { enableBodyTagWhitelist: true });
    // The <nav> is nested inside <main>, so the whitelist (which only checks
    // direct children of <body>) does not skip it.
    expect(pieces.length).toBe(1);
    expect(pieces[0].text).toBe('Nested nav link text');
  });
});

describe('domWalker — aside caps (FR-5)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    resetPieceCounter();
    __resetMatchCacheForTest();
  });

  it('with caps ON, skips aside paragraphs longer than ASIDE_MAX_TEXT_PER_PARAGRAPH', () => {
    const aside = document.createElement('aside');
    const shortP = document.createElement('p');
    shortP.textContent = 'Short sidebar text.'; // 18 chars < 67
    const longP = document.createElement('p');
    longP.textContent = 'This is a very long sidebar paragraph that exceeds the per-paragraph cap limit of sixty-seven characters.';
    // 96 chars > 67

    aside.appendChild(shortP);
    aside.appendChild(longP);
    document.body.appendChild(aside);

    const pieces = extractPieces(document.body, { enableAsideCaps: true });
    // Only the short paragraph is kept; the long one is skipped
    expect(pieces.length).toBe(1);
    expect(pieces[0].text).toBe('Short sidebar text.');
  });

  it('with caps ON, stops translating an aside region after per-region cap', () => {
    const aside = document.createElement('aside');
    // Add many short paragraphs that cumulatively exceed 1000 chars
    for (let i = 0; i < 30; i++) {
      const p = document.createElement('p');
      // Each paragraph is 50 chars (under the 67 per-paragraph cap)
      p.textContent = `Sidebar link number ${String(i).padStart(2, '0')} with some extra text.`;
      aside.appendChild(p);
    }
    document.body.appendChild(aside);

    const pieces = extractPieces(document.body, { enableAsideCaps: true });
    // 30 × ~53 chars ≈ 1590 chars total, but cap is 1000.
    // Should stop after ~18-19 paragraphs (1000/53 ≈ 18.8).
    expect(pieces.length).toBeLessThan(30);
    expect(pieces.length).toBeGreaterThan(10);
    // Verify cumulative chars don't exceed the region cap + one paragraph
    const totalChars = pieces.reduce((sum, p) => sum + p.text.length, 0);
    expect(totalChars).toBeLessThanOrEqual(1000 + 67);
  });

  it('with caps OFF, translates all aside paragraphs (regression)', () => {
    const aside = document.createElement('aside');
    const longP = document.createElement('p');
    longP.textContent = 'This is a very long sidebar paragraph that exceeds the per-paragraph cap limit of sixty-seven characters.';
    aside.appendChild(longP);
    document.body.appendChild(aside);

    const pieces = extractPieces(document.body, {});
    expect(pieces.length).toBe(1);
  });

  it('caps do not apply to non-aside content', () => {
    const main = document.createElement('main');
    const longP = document.createElement('p');
    longP.textContent = 'This is a very long main article paragraph that would exceed the aside per-paragraph cap but should still be translated because it is in the main content area.';
    main.appendChild(longP);
    document.body.appendChild(main);

    const pieces = extractPieces(document.body, { enableAsideCaps: true });
    expect(pieces.length).toBe(1);
  });

  it('caps apply to [role="complementary"] regions', () => {
    const div = document.createElement('div');
    div.setAttribute('role', 'complementary');
    const longP = document.createElement('p');
    longP.textContent = 'This is a very long complementary paragraph that exceeds the per-paragraph cap of sixty-seven characters limit.';
    div.appendChild(longP);
    document.body.appendChild(div);

    const pieces = extractPieces(document.body, { enableAsideCaps: true });
    expect(pieces.length).toBe(0); // skipped due to per-paragraph cap
  });
});
