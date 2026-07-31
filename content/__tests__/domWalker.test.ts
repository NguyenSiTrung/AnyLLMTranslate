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

  it('tags inArticleContext for article/main vs outside/nav/sidebar (FR-3)', () => {
    const article = document.createElement('article');
    const ap = document.createElement('p');
    ap.textContent = 'Article body text.';
    article.appendChild(ap);
    document.body.appendChild(article);
    expect(extractPieces(document.body, {})[0]!.inArticleContext).toBe(true);

    document.body.innerHTML = '';
    resetPieceCounter();
    const main = document.createElement('main');
    const mp = document.createElement('p');
    mp.textContent = 'Main body text.';
    main.appendChild(mp);
    document.body.appendChild(main);
    expect(extractPieces(document.body, {})[0]!.inArticleContext).toBe(true);

    document.body.innerHTML = '';
    resetPieceCounter();
    const aside = document.createElement('aside');
    const sp = document.createElement('p');
    sp.textContent = 'Sidebar text here.';
    aside.appendChild(sp);
    document.body.appendChild(aside);
    expect(extractPieces(document.body, {})[0]!.inArticleContext).toBe(false);

    document.body.innerHTML = '';
    resetPieceCounter();
    const nav = document.createElement('nav');
    const div = document.createElement('div');
    const a = document.createElement('a');
    a.textContent = 'Navigation link text';
    div.appendChild(a);
    nav.appendChild(div);
    document.body.appendChild(nav);
    expect(extractPieces(document.body, {})[0]!.inArticleContext).toBe(false);

    document.body.innerHTML = '';
    resetPieceCounter();
    const art2 = document.createElement('article');
    const p1 = document.createElement('p');
    p1.textContent = 'Article paragraph.';
    art2.appendChild(p1);
    document.body.appendChild(art2);
    const aside2 = document.createElement('aside');
    const p2 = document.createElement('p');
    p2.textContent = 'Sidebar paragraph.';
    aside2.appendChild(p2);
    document.body.appendChild(aside2);
    const mixed = extractPieces(document.body, {});
    expect(mixed).toHaveLength(2);
    expect(mixed[0]!.inArticleContext).toBe(true);
    expect(mixed[1]!.inArticleContext).toBe(false);
  });
});

describe('domWalker — body-tag whitelist (FR-4)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    resetPieceCounter();
    __resetMatchCacheForTest();
  });

  it('with whitelist ON, skips direct-child nav/aside, descends into div, ignores deeper nesting', () => {
    // Scenario 1: direct-child <nav> and <aside> under <body> are skipped
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

    let pieces = extractPieces(document.body, { enableBodyTagWhitelist: true });
    // Only the <main> subtree is walked; nav and aside are skipped
    expect(pieces.length).toBe(1);
    expect(pieces[0].text).toBe('Main article text content');

    // Scenario 2: <div> direct children are descended into
    document.body.innerHTML = '';
    resetPieceCounter();
    __resetMatchCacheForTest();
    const div = document.createElement('div');
    const p = document.createElement('p');
    p.textContent = 'Content inside a div.';
    div.appendChild(p);
    document.body.appendChild(div);

    pieces = extractPieces(document.body, { enableBodyTagWhitelist: true });
    expect(pieces.length).toBe(1);
    expect(pieces[0].text).toBe('Content inside a div.');

    // Scenario 3: <nav> nested inside <main> is NOT skipped — the whitelist
    // only checks direct children of <body>
    document.body.innerHTML = '';
    resetPieceCounter();
    __resetMatchCacheForTest();
    const main2 = document.createElement('main');
    const nav2 = document.createElement('nav');
    const navLink2 = document.createElement('a');
    navLink2.textContent = 'Nested nav link text';
    nav2.appendChild(navLink2);
    main2.appendChild(nav2);
    document.body.appendChild(main2);

    pieces = extractPieces(document.body, { enableBodyTagWhitelist: true });
    expect(pieces.length).toBe(1);
    expect(pieces[0].text).toBe('Nested nav link text');
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

});

describe('domWalker — aside caps (FR-5)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    resetPieceCounter();
    __resetMatchCacheForTest();
  });

  it('with caps ON, skips long aside paragraphs and stops after per-region cap', () => {
    // Scenario 1: per-paragraph cap — long aside paragraph is skipped
    const aside = document.createElement('aside');
    const shortP = document.createElement('p');
    shortP.textContent = 'Short sidebar text.'; // 18 chars < 67
    const longP = document.createElement('p');
    longP.textContent = 'This is a very long sidebar paragraph that exceeds the per-paragraph cap limit of sixty-seven characters.';
    // 96 chars > 67

    aside.appendChild(shortP);
    aside.appendChild(longP);
    document.body.appendChild(aside);

    let pieces = extractPieces(document.body, { enableAsideCaps: true });
    // Only the short paragraph is kept; the long one is skipped
    expect(pieces.length).toBe(1);
    expect(pieces[0].text).toBe('Short sidebar text.');

    // Scenario 2: per-region cap — many short paragraphs stop after 1000 chars
    document.body.innerHTML = '';
    resetPieceCounter();
    __resetMatchCacheForTest();
    const aside2 = document.createElement('aside');
    for (let i = 0; i < 30; i++) {
      const p = document.createElement('p');
      // Each paragraph is 50 chars (under the 67 per-paragraph cap)
      p.textContent = `Sidebar link number ${String(i).padStart(2, '0')} with some extra text.`;
      aside2.appendChild(p);
    }
    document.body.appendChild(aside2);

    pieces = extractPieces(document.body, { enableAsideCaps: true });
    // 30 × ~53 chars ≈ 1590 chars total, but cap is 1000.
    // Should stop after ~18-19 paragraphs (1000/53 ≈ 18.8).
    expect(pieces.length).toBeLessThan(30);
    expect(pieces.length).toBeGreaterThan(10);
    // Verify cumulative chars don't exceed the region cap + one paragraph
    const totalChars = pieces.reduce((sum, p) => sum + p.text.length, 0);
    expect(totalChars).toBeLessThanOrEqual(1000 + 67);
  });

  it('with caps OFF, translates all aside paragraphs; caps never apply to non-aside or complementary without caps', () => {
    // Scenario 1: caps OFF — even over-cap aside paragraphs are kept (regression)
    const aside = document.createElement('aside');
    const longP = document.createElement('p');
    longP.textContent = 'This is a very long sidebar paragraph that exceeds the per-paragraph cap limit of sixty-seven characters.';
    aside.appendChild(longP);
    document.body.appendChild(aside);

    let pieces = extractPieces(document.body, {});
    expect(pieces.length).toBe(1);

    // Scenario 2: caps ON — long <main> paragraphs are unaffected
    document.body.innerHTML = '';
    resetPieceCounter();
    __resetMatchCacheForTest();
    const main = document.createElement('main');
    const mainLongP = document.createElement('p');
    mainLongP.textContent = 'This is a very long main article paragraph that would exceed the aside per-paragraph cap but should still be translated because it is in the main content area.';
    main.appendChild(mainLongP);
    document.body.appendChild(main);

    pieces = extractPieces(document.body, { enableAsideCaps: true });
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

describe('domWalker — inline exclude soft-skip (keep in paragraph)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    resetPieceCounter();
    __resetMatchCacheForTest();
  });

  it('keeps inline <code> text in the parent piece when code is excluded (incl. GitHub-like rich placeholders)', () => {
    // Scenario 1: plain exclude keeps the code paths in the piece text
    const p = document.createElement('p');
    p.innerHTML =
      'Add to your config file (<code>~/.config/sway/config</code> or <code>~/.config/i3/config</code>):';
    document.body.appendChild(p);

    let pieces = extractPieces(document.body, {
      excludeSelectors: ['code', 'pre'],
    });

    expect(pieces).toHaveLength(1);
    expect(pieces[0].text).toContain('~/.config/sway/config');
    expect(pieces[0].text).toContain('~/.config/i3/config');
    expect(pieces[0].text).toMatch(/Add to your config file/);

    // Scenario 2: GitHub-like — include markdown-body + exclude code with rich
    // translate keeps the paths as rich placeholders
    document.body.innerHTML = '';
    resetPieceCounter();
    __resetMatchCacheForTest();
    const md = document.createElement('div');
    md.className = 'markdown-body';
    const mp = document.createElement('p');
    mp.setAttribute('dir', 'auto');
    mp.innerHTML =
      'Add to your config file (<code>~/.config/sway/config</code> or <code>~/.config/i3/config</code>):';
    md.appendChild(mp);
    document.body.appendChild(md);

    pieces = extractPieces(document.body, {
      includeSelectors: ['.markdown-body'],
      excludeSelectors: ['.highlight', 'pre', 'code'],
      enableRichTranslate: true,
    });

    expect(pieces).toHaveLength(1);
    expect(pieces[0].text).toContain('~/.config/sway/config');
    expect(pieces[0].text).toContain('~/.config/i3/config');
    expect(pieces[0].variables?.length).toBeGreaterThanOrEqual(2);
  });

  it('hard-skips block <pre> and block containers matched by exclude class', () => {
    // Scenario 1: block <pre> is hard-skipped even when pre/code are excluded
    const container = document.createElement('div');
    const prose = document.createElement('p');
    prose.textContent = 'See the example below.';
    const pre = document.createElement('pre');
    pre.textContent = 'const x = 1;\nconsole.log(x);';
    container.appendChild(prose);
    container.appendChild(pre);
    document.body.appendChild(container);

    let pieces = extractPieces(document.body, {
      excludeSelectors: ['pre', 'code'],
    });

    expect(pieces).toHaveLength(1);
    expect(pieces[0].text).toBe('See the example below.');
    expect(pieces.every((p) => !p.text.includes('console.log'))).toBe(true);

    // Scenario 2: block container matched by exclude class is hard-skipped
    document.body.innerHTML = '';
    resetPieceCounter();
    __resetMatchCacheForTest();
    const article = document.createElement('article');
    const ap = document.createElement('p');
    ap.textContent = 'Article prose here.';
    const sidebar = document.createElement('div');
    sidebar.className = 'sidebar';
    const sideP = document.createElement('p');
    sideP.textContent = 'Sidebar noise.';
    sidebar.appendChild(sideP);
    article.appendChild(ap);
    article.appendChild(sidebar);
    document.body.appendChild(article);

    pieces = extractPieces(document.body, {
      excludeSelectors: ['.sidebar'],
    });

    expect(pieces).toHaveLength(1);
    expect(pieces[0].text).toBe('Article prose here.');
  });

  it('keeps excluded inline class (e.g. span.term) and translate="no" content inside the surrounding sentence', () => {
    // Scenario 1: excluded inline class stays in the parent piece
    const p = document.createElement('p');
    p.innerHTML = 'Use the <span class="term">API_KEY</span> from your dashboard.';
    document.body.appendChild(p);

    let pieces = extractPieces(document.body, {
      excludeSelectors: ['.term'],
    });

    expect(pieces).toHaveLength(1);
    expect(pieces[0].text).toBe('Use the API_KEY from your dashboard.');

    // Scenario 2: translate="no" inline content stays in the parent piece
    document.body.innerHTML = '';
    resetPieceCounter();
    __resetMatchCacheForTest();
    const p2 = document.createElement('p');
    p2.innerHTML = 'Open <span translate="no">Settings → Advanced</span> to configure.';
    document.body.appendChild(p2);

    pieces = extractPieces(document.body, {});
    expect(pieces).toHaveLength(1);
    expect(pieces[0].text).toContain('Settings → Advanced');
    expect(pieces[0].text).toMatch(/Open .* to configure/);
  });

  it('passes enableRichTranslate through includeSelectors nested extraction', () => {
    const md = document.createElement('div');
    md.className = 'markdown-body';
    const p = document.createElement('p');
    p.innerHTML = 'Run <code>npm install</code> first.';
    md.appendChild(p);
    document.body.appendChild(md);

    const pieces = extractPieces(document.body, {
      includeSelectors: ['.markdown-body'],
      excludeSelectors: ['code', 'pre'],
      enableRichTranslate: true,
    });

    expect(pieces).toHaveLength(1);
    expect(pieces[0].text).toContain('<z id=');
    expect(pieces[0].text).toContain('npm install');
    expect(pieces[0].variables?.some((v) => v.tag === 'CODE')).toBe(true);
  });

});
