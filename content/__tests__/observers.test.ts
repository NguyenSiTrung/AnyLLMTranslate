import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startSpaNavigationWatcher } from '@/content/spaNavigationWatcher';
import { ViewportObserver } from '../viewportObserver';
import type { TranslationPiece } from '@/types/translation';
import { getDomOutlineFromDocument } from '@/content/utils/getDomOutline';
import { extractPieces, resetPieceCounter } from '../domWalker';
import { __resetMatchCacheForTest } from '@/lib/domUtils';
import { getRegisteredShadowRoots, clearShadowDomRoots } from '../shadowDomRoots';

// @vitest-environment jsdom

describe('startSpaNavigationWatcher', () => {
  afterEach(() => {
    vi.useRealTimers();
    window.history.replaceState({}, '', '/');
  });

  it('detects a history URL change that bypasses the watcher wrapper', () => {
    vi.useFakeTimers();
    const onNavigation = vi.fn();
    const nativePushState = window.history.pushState;
    const cleanup = startSpaNavigationWatcher(onNavigation, { pollIntervalMs: 100 });

    nativePushState.call(window.history, {}, '', '/courses/example/lesson/next');
    expect(onNavigation).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);

    expect(onNavigation).toHaveBeenCalledWith(window.location.href);
    cleanup();
  });
});

function makePiece(id: string, parent: Element, text = 'hello'): TranslationPiece {
  return {
    id,
    parentElement: parent,
    textNodes: [],
    text,
    isTranslated: false,
  };
}

/**
 * jsdom does not implement IntersectionObserver. Provide a minimal mock that
 * records observes and lets tests fire intersections manually.
 */
class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  observed = new Set<Element>();

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }

  observe(el: Element): void {
    this.observed.add(el);
  }

  unobserve(el: Element): void {
    this.observed.delete(el);
  }

  disconnect(): void {
    this.observed.clear();
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  fire(el: Element, isIntersecting: boolean): void {
    this.callback(
      [
        {
          target: el,
          isIntersecting,
          // unused fields
          boundingClientRect: el.getBoundingClientRect(),
          intersectionRatio: isIntersecting ? 1 : 0,
          intersectionRect: el.getBoundingClientRect(),
          rootBounds: null,
          time: Date.now(),
        } as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver,
    );
  }
}

describe('ViewportObserver', () => {
  let originalIO: typeof IntersectionObserver;

  beforeEach(() => {
    document.body.innerHTML = '';
    MockIntersectionObserver.instances = [];
    originalIO = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver =
      MockIntersectionObserver as unknown as typeof IntersectionObserver;
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.IntersectionObserver = originalIO;
    vi.useRealTimers();
  });

  it('dispatches untranslated pieces once when they enter the viewport, and does not re-dispatch the same piece id until released', () => {
    const onVisible = vi.fn();
    const observer = new ViewportObserver(onVisible, 50);
    const p = document.createElement('p');
    document.body.appendChild(p);
    const piece = makePiece('a', p);
    observer.observe(piece);

    const mock = MockIntersectionObserver.instances[0];
    mock.fire(p, true);
    vi.advanceTimersByTime(50);

    expect(onVisible).toHaveBeenCalledTimes(1);
    expect(onVisible.mock.calls[0][0]).toEqual([piece]);
    // Unobserved after dispatch
    expect(mock.observed.has(p)).toBe(false);

    // Re-observe without release — should be a no-op (already dispatched)
    observer.observe(piece);
    expect(mock.observed.has(p)).toBe(false);

    // After release, can observe and dispatch again
    observer.release('a');
    observer.observe(piece);
    mock.fire(p, true);
    vi.advanceTimersByTime(50);
    expect(onVisible).toHaveBeenCalledTimes(2);
    observer.disconnect();
  });

  it('dedupes pending piece ids within the same batch window', () => {
    const onVisible = vi.fn();
    const observer = new ViewportObserver(onVisible, 50);
    const p1 = document.createElement('p');
    const p2 = document.createElement('p');
    document.body.appendChild(p1);
    document.body.appendChild(p2);
    // Same piece object observed under two parents is unrealistic; simulate
    // pending accumulation of the same id by observing one piece and pushing
    // via two intersection targets that share the piece list... Instead:
    // observe two pieces with the same id (shouldn't happen) — filter by id.
    const a = makePiece('x', p1);
    const aDup = makePiece('x', p2);
    observer.observe(a);
    // Force both into pending by direct map manipulation is hard; fire both
    // after observing separately with release between... simpler: two fires
    // of same target shouldn't happen after unobserve.

    const mock = MockIntersectionObserver.instances[0];
    // Manually put dups into pending by observing a and firing, then
    // releasing and re-observing aDup with same id before flush.
    observer.observe(a);
    mock.fire(p1, true);
    // Before flush, release and re-queue same id via aDup
    observer.release('x');
    observer.observe(aDup);
    mock.fire(p2, true);
    vi.advanceTimersByTime(50);

    expect(onVisible).toHaveBeenCalledTimes(1);
    const batch = onVisible.mock.calls[0][0] as TranslationPiece[];
    expect(batch).toHaveLength(1);
    expect(batch[0].id).toBe('x');
    observer.disconnect();
  });

  it('caps per-flush dispatch and drains the remainder in later windows', () => {
    const onVisible = vi.fn();
    const observer = new ViewportObserver(onVisible, 50, 3);
    const mock = MockIntersectionObserver.instances[0];

    const pieces: TranslationPiece[] = [];
    for (let i = 0; i < 10; i++) {
      const p = document.createElement('p');
      document.body.appendChild(p);
      const piece = makePiece(`p${i}`, p);
      pieces.push(piece);
      observer.observe(piece);
      mock.fire(p, true);
    }
    vi.advanceTimersByTime(50);
    // First flush respects the cap.
    expect(onVisible).toHaveBeenCalledTimes(1);
    expect((onVisible.mock.calls[0][0] as TranslationPiece[]).map((x) => x.id)).toEqual([
      'p0',
      'p1',
      'p2',
    ]);

    // Each subsequent window drains the next slice until empty.
    vi.advanceTimersByTime(50);
    expect(onVisible).toHaveBeenCalledTimes(2);
    expect((onVisible.mock.calls[1][0] as TranslationPiece[]).map((x) => x.id)).toEqual([
      'p3',
      'p4',
      'p5',
    ]);

    vi.advanceTimersByTime(50);
    vi.advanceTimersByTime(50);
    const allDispatched = onVisible.mock.calls.flatMap((c) => c[0] as TranslationPiece[]);
    expect(allDispatched).toHaveLength(10);
    observer.disconnect();
  });

  it('when paused does not dispatch; on unpause redispatch currently visible tracked pieces', () => {
    const onVisible = vi.fn();
    const observer = new ViewportObserver(onVisible, 50);
    const p = document.createElement('p');
    // jsdom getBoundingClientRect defaults to all zeros — treat as visible
    // with our margin check (bottom >= -200 && top <= height+200).
    document.body.appendChild(p);
    const piece = makePiece('a', p);
    observer.observe(piece);
    observer.setPaused(true);

    const mock = MockIntersectionObserver.instances[0];
    mock.fire(p, true);
    vi.advanceTimersByTime(50);

    expect(onVisible).not.toHaveBeenCalled();
    // Still tracked
    expect(mock.observed.has(p)).toBe(true);

    observer.setPaused(false);
    vi.advanceTimersByTime(50);

    expect(onVisible).toHaveBeenCalledTimes(1);
    expect(onVisible.mock.calls[0][0][0].id).toBe('a');
    observer.disconnect();
  });
});

/** @vitest-environment jsdom */

describe('getDomOutlineFromDocument', () => {
  it('returns outline for current-like document', () => {
    const html = `<!doctype html><html><head><title>T</title></head><body><main><p>${'hi '.repeat(30)}</p></main></body></html>`;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const r = getDomOutlineFromDocument(doc, 'https://example.com/page');
    expect(r.success).toBe(true);
    expect(r.outline?.title).toBe('T');
    expect(r.outline?.hostname).toBe('example.com');
  });
});

describe('domWalker — selector-match cache integration', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    resetPieceCounter();
    __resetMatchCacheForTest();
  });

  it('preserves cached selector matching and extraction results', () => {
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

    // Article-context tagging covers article/main and outside/nav/sidebar regions.
    document.body.innerHTML = '';
    resetPieceCounter();
    __resetMatchCacheForTest();
    const regressionContainer = document.createElement('div');
    const article = document.createElement('article');
    const p1 = document.createElement('p');
    p1.textContent = 'Article paragraph one.';
    const p2 = document.createElement('p');
    p2.className = 'ad';
    p2.textContent = 'Advertisement text.';
    article.appendChild(p1);
    article.appendChild(p2);
    regressionContainer.appendChild(article);

    const nav = document.createElement('nav');
    const navLink = document.createElement('a');
    navLink.textContent = 'Home';
    nav.appendChild(navLink);
    regressionContainer.appendChild(nav);

    document.body.appendChild(regressionContainer);

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

  it('with whitelist ON, skips direct-child nav/aside, descends into div, ignores deeper nesting; OFF descends into all direct children', () => {
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

    // Scenario 4 (regression): whitelist OFF descends into all direct children.
    document.body.innerHTML = '';
    resetPieceCounter();
    __resetMatchCacheForTest();
    const nav3 = document.createElement('nav');
    const navLink3 = document.createElement('a');
    navLink3.textContent = 'Navigation link text';
    nav3.appendChild(navLink3);
    const main3 = document.createElement('main');
    const mainP3 = document.createElement('p');
    mainP3.textContent = 'Main article text content';
    main3.appendChild(mainP3);
    document.body.appendChild(nav3);
    document.body.appendChild(main3);

    const offPieces = extractPieces(document.body, {});
    // Both nav and main are walked when whitelist is off
    expect(offPieces.length).toBe(2);
  });

});

describe('domWalker — aside caps (FR-5)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    resetPieceCounter();
    __resetMatchCacheForTest();
  });

  it('aside caps: ON enforces per-paragraph and per-region caps; OFF keeps all aside text; caps never apply to main, but do apply to role=complementary', () => {
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

    // Scenario 3: caps OFF — even over-cap aside paragraphs are kept (regression)
    document.body.innerHTML = '';
    resetPieceCounter();
    __resetMatchCacheForTest();
    const aside3 = document.createElement('aside');
    aside3.appendChild(longP.cloneNode(true));
    document.body.appendChild(aside3);
    pieces = extractPieces(document.body, {});
    expect(pieces.length).toBe(1);

    // Scenario 4: caps ON — long <main> paragraphs are unaffected
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

    // Scenario 5: caps ON — long [role="complementary"] paragraphs ARE capped
    document.body.innerHTML = '';
    resetPieceCounter();
    __resetMatchCacheForTest();
    const div = document.createElement('div');
    div.setAttribute('role', 'complementary');
    const longC = document.createElement('p');
    longC.textContent = 'This is a very long complementary paragraph that exceeds the per-paragraph cap of sixty-seven characters limit.';
    div.appendChild(longC);
    document.body.appendChild(div);

    pieces = extractPieces(document.body, { enableAsideCaps: true });
    expect(pieces.length).toBe(0); // skipped due to per-paragraph cap
  });
});

describe('domWalker — inline exclude soft-skip (keep in paragraph)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    resetPieceCounter();
    __resetMatchCacheForTest();
  });

  it('keeps excluded inline content (code, span.term, translate="no") in the sentence and hard-skips block containers', () => {
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

    // Scenario 2: block <pre> is hard-skipped even when pre/code are excluded
    document.body.innerHTML = '';
    resetPieceCounter();
    __resetMatchCacheForTest();
    const container = document.createElement('div');
    const prose = document.createElement('p');
    prose.textContent = 'See the example below.';
    const pre = document.createElement('pre');
    pre.textContent = 'const x = 1;\nconsole.log(x);';
    container.appendChild(prose);
    container.appendChild(pre);
    document.body.appendChild(container);

    pieces = extractPieces(document.body, {
      excludeSelectors: ['pre', 'code'],
    });

    expect(pieces).toHaveLength(1);
    expect(pieces[0].text).toBe('See the example below.');
    expect(pieces.every((piece) => !piece.text.includes('console.log'))).toBe(true);

    // Scenario 3: block container matched by exclude class is hard-skipped
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

    // Scenario 4: excluded inline class stays in the parent piece
    document.body.innerHTML = '';
    resetPieceCounter();
    __resetMatchCacheForTest();
    const p2 = document.createElement('p');
    p2.innerHTML = 'Use the <span class="term">API_KEY</span> from your dashboard.';
    document.body.appendChild(p2);

    pieces = extractPieces(document.body, {
      excludeSelectors: ['.term'],
    });

    expect(pieces).toHaveLength(1);
    expect(pieces[0].text).toBe('Use the API_KEY from your dashboard.');

    // Scenario 5: translate="no" inline content stays in the parent piece
    document.body.innerHTML = '';
    resetPieceCounter();
    __resetMatchCacheForTest();
    const p3 = document.createElement('p');
    p3.innerHTML = 'Open <span translate="no">Settings → Advanced</span> to configure.';
    document.body.appendChild(p3);

    pieces = extractPieces(document.body, {});
    expect(pieces).toHaveLength(1);
    expect(pieces[0].text).toContain('Settings → Advanced');
    expect(pieces[0].text).toMatch(/Open .* to configure/);
  });

  it('keeps GitHub-like rich placeholders and nested rich extraction for excluded code', () => {
    // Scenario 1: GitHub-like — include markdown-body + exclude code with rich
    // translate keeps the paths as rich placeholders
    const md = document.createElement('div');
    md.className = 'markdown-body';
    const mp = document.createElement('p');
    mp.setAttribute('dir', 'auto');
    mp.innerHTML =
      'Add to your config file (<code>~/.config/sway/config</code> or <code>~/.config/i3/config</code>):';
    md.appendChild(mp);
    document.body.appendChild(md);

    let pieces = extractPieces(document.body, {
      includeSelectors: ['.markdown-body'],
      excludeSelectors: ['.highlight', 'pre', 'code'],
      enableRichTranslate: true,
    });

    expect(pieces).toHaveLength(1);
    expect(pieces[0].text).toContain('~/.config/sway/config');
    expect(pieces[0].text).toContain('~/.config/i3/config');
    expect(pieces[0].variables?.length).toBeGreaterThanOrEqual(2);

    // Scenario 2: nested rich extraction emits placeholder tags + CODE variables
    document.body.innerHTML = '';
    resetPieceCounter();
    __resetMatchCacheForTest();
    const md2 = document.createElement('div');
    md2.className = 'markdown-body';
    const p2 = document.createElement('p');
    p2.innerHTML = 'Run <code>npm install</code> first.';
    md2.appendChild(p2);
    document.body.appendChild(md2);

    pieces = extractPieces(document.body, {
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

describe('domWalker — shadow DOM walk (FR-23)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    resetPieceCounter();
    __resetMatchCacheForTest();
    clearShadowDomRoots();
  });

  it('include-scoped subtree containing an open shadow host extracts the shadow piece when enabled', () => {
    const scoped = document.createElement('div');
    scoped.className = 'scoped';
    const lightP = document.createElement('p');
    lightP.textContent = 'Light DOM paragraph text.';
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    const shadowP = document.createElement('p');
    shadowP.textContent = 'Shadow DOM paragraph text.';
    shadow.appendChild(shadowP);
    scoped.appendChild(lightP);
    scoped.appendChild(host);
    document.body.appendChild(scoped);

    const pieces = extractPieces(document.body, {
      includeSelectors: ['.scoped'],
      enableShadowDomWalk: true,
    });

    const texts = pieces.map((piece) => piece.text);
    expect(texts).toContain('Light DOM paragraph text.');
    expect(texts).toContain('Shadow DOM paragraph text.');
    const shadowPiece = pieces.find((piece) => piece.text === 'Shadow DOM paragraph text.');
    expect(shadowPiece?.parentElement).toBe(shadowP);

    // Flag off → the shadow subtree is never entered.
    document.body.innerHTML = '';
    resetPieceCounter();
    __resetMatchCacheForTest();
    const scoped2 = document.createElement('div');
    scoped2.className = 'scoped';
    const host2 = document.createElement('div');
    const shadow2 = host2.attachShadow({ mode: 'open' });
    const shadowP2 = document.createElement('p');
    shadowP2.textContent = 'Hidden shadow paragraph.';
    shadow2.appendChild(shadowP2);
    scoped2.appendChild(host2);
    document.body.appendChild(scoped2);

    const offPieces = extractPieces(document.body, {
      includeSelectors: ['.scoped'],
    });
    expect(offPieces.map((piece) => piece.text)).not.toContain('Hidden shadow paragraph.');
  });

  it('records the plain source text on every piece for later change comparison (sm7n)', () => {
    const p = document.createElement('p');
    p.textContent = 'Plain source paragraph text.';
    document.body.appendChild(p);

    const pieces = extractPieces(document.body, {});

    expect(pieces).toHaveLength(1);
    expect(pieces[0].sourceText).toBe('Plain source paragraph text.');
  });

  it('registers walked open shadow roots so display cleanup and watching can reach them', () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    const shadowP = document.createElement('p');
    shadowP.textContent = 'Shadow text needing registration.';
    shadow.appendChild(shadowP);
    document.body.appendChild(host);

    const pieces = extractPieces(document.body, { enableShadowDomWalk: true });

    expect(pieces.map((piece) => piece.text)).toContain('Shadow text needing registration.');
    // Registered → displayScopes()/removeAllTranslations() and the post-flush
    // observer sweep can reach the root, even when it attached after the
    // MutationWatcher's delivery-time scan.
    expect(getRegisteredShadowRoots()).toContain(shadow);
  });
});

describe('domWalker — shared asideRegionChars across calls (t9dd)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    resetPieceCounter();
    __resetMatchCacheForTest();
    clearShadowDomRoots();
  });

  // 30 × ~53 chars ≈ 1590 chars — past the 1000-char per-region cap but each
  // paragraph stays under the 67-char per-paragraph cap.
  const buildAside = () => {
    const aside = document.createElement('aside');
    for (let i = 0; i < 30; i++) {
      const p = document.createElement('p');
      p.textContent = `Sidebar link number ${String(i).padStart(2, '0')} with some extra text.`;
      aside.appendChild(p);
    }
    return aside;
  };

  it('a caller-provided map keeps cumulative region caps across two extractPieces calls on the same aside', () => {
    document.body.appendChild(buildAside());
    const asideRegionChars = new Map<Element, number>();
    const options = { enableAsideCaps: true, asideRegionChars };

    const first = extractPieces(document.body, options);
    expect(first.length).toBeGreaterThan(10);
    expect(first.length).toBeLessThan(30);
    const firstTotal = first.reduce((sum, piece) => sum + piece.text.length, 0);
    expect(firstTotal).toBeGreaterThanOrEqual(1000);

    // Same shared map: the region cap is already consumed — a second pass
    // (e.g. a dynamic mutation re-extraction) must not restart accounting.
    const second = extractPieces(document.body, options);
    expect(second).toHaveLength(0);

    // A fresh call WITHOUT the map re-extracts the same pieces — the pre-fix
    // behavior where every pass restarted cumulative accounting.
    const fresh = extractPieces(document.body, { enableAsideCaps: true });
    expect(fresh.length).toBe(first.length);
  });

  it('include-selector recursion and open-shadow nested extraction forward the shared map', () => {
    document.body.appendChild(buildAside());

    const viaInclude = new Map<Element, number>();
    const includeOptions = {
      includeSelectors: ['aside'],
      enableAsideCaps: true,
      asideRegionChars: viaInclude,
    };
    const inc1 = extractPieces(document.body, includeOptions);
    const inc2 = extractPieces(document.body, includeOptions);
    expect(inc1.length).toBeGreaterThan(10);
    // The nested include-scoped call must draw from the same map.
    expect(inc2).toHaveLength(0);

    // Shadow recursion: an aside inside an open shadow root shares the map.
    document.body.innerHTML = '';
    resetPieceCounter();
    __resetMatchCacheForTest();
    clearShadowDomRoots();
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.appendChild(buildAside());
    document.body.appendChild(host);

    const viaShadow = new Map<Element, number>();
    const shadowOptions = {
      enableShadowDomWalk: true,
      enableAsideCaps: true,
      asideRegionChars: viaShadow,
    };
    const sh1 = extractPieces(document.body, shadowOptions);
    const sh2 = extractPieces(document.body, shadowOptions);
    expect(sh1.length).toBeGreaterThan(10);
    expect(sh2).toHaveLength(0);
  });
});
