import { describe, it, expect, beforeEach } from 'vitest';
import { matchesCached, __resetMatchCacheForTest, classifyInArticle } from '../domUtils';

describe('domUtils', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    __resetMatchCacheForTest();
  });

  it('matchesCached caches results; classifyInArticle detects main content vs chrome', () => {
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
    matchesCached(el, '.foo');
    matchesCached(el, '.bar');
    matchesCached(el, '.missing');
    expect(callCount).toBe(3);

    expect(matchesCached(el, ':[invalid')).toBe(false);
    __resetMatchCacheForTest();
    callCount = 0;
    matchesCached(el, '.foo');
    expect(callCount).toBe(1);

    // classifyInArticle detects main content vs chrome and deep nesting
    const article = document.createElement('article');
    const p1 = document.createElement('p');
    article.appendChild(p1);
    document.body.appendChild(article);
    expect(classifyInArticle(p1)).toBe(true);

    document.body.innerHTML = '';
    const main = document.createElement('main');
    const p2 = document.createElement('p');
    main.appendChild(p2);
    document.body.appendChild(main);
    expect(classifyInArticle(p2)).toBe(true);

    document.body.innerHTML = '';
    const content = document.createElement('div');
    content.id = 'content';
    const p3 = document.createElement('p');
    content.appendChild(p3);
    document.body.appendChild(content);
    expect(classifyInArticle(p3)).toBe(true);

    document.body.innerHTML = '';
    const nav = document.createElement('nav');
    const a = document.createElement('a');
    nav.appendChild(a);
    document.body.appendChild(nav);
    expect(classifyInArticle(a)).toBe(false);

    document.body.innerHTML = '';
    const aside = document.createElement('aside');
    const pAside = document.createElement('p');
    aside.appendChild(pAside);
    document.body.appendChild(aside);
    expect(classifyInArticle(pAside)).toBe(false);

    document.body.innerHTML = '';
    const bare = document.createElement('p');
    document.body.appendChild(bare);
    expect(classifyInArticle(bare)).toBe(false);

    document.body.innerHTML = '';
    const deep = document.createElement('article');
    const div1 = document.createElement('div');
    const div2 = document.createElement('div');
    const span = document.createElement('span');
    div2.appendChild(span);
    div1.appendChild(div2);
    deep.appendChild(div1);
    document.body.appendChild(deep);
    expect(classifyInArticle(span)).toBe(true);
  });
});
