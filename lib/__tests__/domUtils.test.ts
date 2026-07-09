import { describe, it, expect, beforeEach } from 'vitest';
import { matchesCached, __resetMatchCacheForTest, classifyInArticle } from '../domUtils';

describe('domUtils — matchesCached', () => {
  beforeEach(() => {
    __resetMatchCacheForTest();
  });

  it('returns element.matches() results and caches per selector', () => {
    const el = document.createElement('div');
    el.className = 'foo bar';

    let callCount = 0;
    const originalMatches = el.matches.bind(el);
    el.matches = ((selector: string) => {
      callCount++;
      return originalMatches(selector);
    }) as Element['matches'];

    expect(matchesCached(el, '.foo')).toBe(true);
    expect(matchesCached(el, '.bar')).toBe(true);
    expect(matchesCached(el, '.missing')).toBe(false);
    expect(callCount).toBe(3);

    // Cache hits
    matchesCached(el, '.foo');
    matchesCached(el, '.bar');
    matchesCached(el, '.missing');
    expect(callCount).toBe(3);
  });

  it('handles invalid selectors and supports cache reset', () => {
    const el = document.createElement('div');
    el.className = 'foo';
    expect(matchesCached(el, ':[invalid')).toBe(false);

    let callCount = 0;
    const originalMatches = el.matches.bind(el);
    el.matches = ((selector: string) => {
      callCount++;
      return originalMatches(selector);
    }) as Element['matches'];

    matchesCached(el, '.foo');
    expect(callCount).toBe(1);
    __resetMatchCacheForTest();
    matchesCached(el, '.foo');
    expect(callCount).toBe(2);
  });
});

describe('domUtils — classifyInArticle', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    __resetMatchCacheForTest();
  });

  it('returns true for common main-content ancestors (article/main/#content)', () => {
    const cases: Array<() => HTMLElement> = [
      () => {
        const article = document.createElement('article');
        const p = document.createElement('p');
        article.appendChild(p);
        document.body.appendChild(article);
        return p;
      },
      () => {
        const main = document.createElement('main');
        const p = document.createElement('p');
        main.appendChild(p);
        document.body.appendChild(main);
        return p;
      },
      () => {
        const div = document.createElement('div');
        div.id = 'content';
        const p = document.createElement('p');
        div.appendChild(p);
        document.body.appendChild(div);
        return p;
      },
    ];
    for (const build of cases) {
      document.body.innerHTML = '';
      expect(classifyInArticle(build())).toBe(true);
    }
  });

  it('returns false for chrome (nav/aside) and bare body children', () => {
    const nav = document.createElement('nav');
    const a = document.createElement('a');
    nav.appendChild(a);
    document.body.appendChild(nav);
    expect(classifyInArticle(a)).toBe(false);

    document.body.innerHTML = '';
    const aside = document.createElement('aside');
    const p = document.createElement('p');
    aside.appendChild(p);
    document.body.appendChild(aside);
    expect(classifyInArticle(p)).toBe(false);

    document.body.innerHTML = '';
    const bare = document.createElement('p');
    document.body.appendChild(bare);
    expect(classifyInArticle(bare)).toBe(false);
  });

  it('finds the nearest article ancestor when nested deeply', () => {
    const article = document.createElement('article');
    const div1 = document.createElement('div');
    const div2 = document.createElement('div');
    const span = document.createElement('span');
    div2.appendChild(span);
    div1.appendChild(div2);
    article.appendChild(div1);
    document.body.appendChild(article);
    expect(classifyInArticle(span)).toBe(true);
  });
});
