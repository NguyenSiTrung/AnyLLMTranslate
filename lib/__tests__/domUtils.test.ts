import { describe, it, expect, beforeEach } from 'vitest';
import { matchesCached, __resetMatchCacheForTest, classifyInArticle } from '../domUtils';

describe('domUtils — matchesCached', () => {
  beforeEach(() => {
    __resetMatchCacheForTest();
  });

  it('returns the correct boolean result from element.matches()', () => {
    const el = document.createElement('div');
    el.className = 'foo';
    expect(matchesCached(el, '.foo')).toBe(true);
    expect(matchesCached(el, '.bar')).toBe(false);
  });

  it('caches a true result — second call does NOT re-invoke .matches()', () => {
    const el = document.createElement('div');
    el.className = 'foo';

    let callCount = 0;
    const originalMatches = el.matches.bind(el);
    el.matches = ((selector: string) => {
      callCount++;
      return originalMatches(selector);
    }) as Element['matches'];

    expect(matchesCached(el, '.foo')).toBe(true);
    expect(callCount).toBe(1);

    // Second call should return cached result without incrementing callCount
    expect(matchesCached(el, '.foo')).toBe(true);
    expect(callCount).toBe(1);
  });

  it('caches a false result — second call does NOT re-invoke .matches()', () => {
    const el = document.createElement('div');
    el.className = 'foo';

    let callCount = 0;
    const originalMatches = el.matches.bind(el);
    el.matches = ((selector: string) => {
      callCount++;
      return originalMatches(selector);
    }) as Element['matches'];

    expect(matchesCached(el, '.bar')).toBe(false);
    expect(callCount).toBe(1);

    expect(matchesCached(el, '.bar')).toBe(false);
    expect(callCount).toBe(1);
  });

  it('caches different selectors for the same element separately', () => {
    const el = document.createElement('div');
    el.className = 'foo bar';

    let callCount = 0;
    const originalMatches = el.matches.bind(el);
    el.matches = ((selector: string) => {
      callCount++;
      return originalMatches(selector);
    }) as Element['matches'];

    matchesCached(el, '.foo');
    matchesCached(el, '.bar');
    expect(callCount).toBe(2); // two distinct selectors = two calls

    // Repeated calls hit the cache
    matchesCached(el, '.foo');
    matchesCached(el, '.bar');
    expect(callCount).toBe(2);
  });

  it('handles invalid selectors gracefully (returns false, does not throw)', () => {
    const el = document.createElement('div');
    expect(matchesCached(el, ':[invalid')).toBe(false);
  });

  it('caches invalid-selector results too (no second throw)', () => {
    const el = document.createElement('div');

    let callCount = 0;
    const originalMatches = el.matches.bind(el);
    el.matches = ((selector: string) => {
      callCount++;
      return originalMatches(selector);
    }) as Element['matches'];

    expect(matchesCached(el, ':[invalid')).toBe(false);
    expect(matchesCached(el, ':[invalid')).toBe(false);
    // The underlying matcher threw on the first call; the cache stores false
    // so the second call never reaches the matcher.
    expect(callCount).toBe(1);
  });

  it('__resetMatchCacheForTest clears the cache so calls re-invoke the matcher', () => {
    const el = document.createElement('div');
    el.className = 'foo';

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
    expect(callCount).toBe(2); // cache was cleared → re-invoked
  });
});

describe('domUtils — classifyInArticle', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    __resetMatchCacheForTest();
  });

  it('returns true when element is inside <article>', () => {
    const article = document.createElement('article');
    const p = document.createElement('p');
    p.textContent = 'Hello';
    article.appendChild(p);
    document.body.appendChild(article);
    expect(classifyInArticle(p)).toBe(true);
  });

  it('returns true when element is inside <main>', () => {
    const main = document.createElement('main');
    const p = document.createElement('p');
    p.textContent = 'Hello';
    main.appendChild(p);
    document.body.appendChild(main);
    expect(classifyInArticle(p)).toBe(true);
  });

  it('returns true when element is inside [role="main"]', () => {
    const div = document.createElement('div');
    div.setAttribute('role', 'main');
    const p = document.createElement('p');
    p.textContent = 'Hello';
    div.appendChild(p);
    document.body.appendChild(div);
    expect(classifyInArticle(p)).toBe(true);
  });

  it('returns true when element is inside #main', () => {
    const div = document.createElement('div');
    div.id = 'main';
    const p = document.createElement('p');
    p.textContent = 'Hello';
    div.appendChild(p);
    document.body.appendChild(div);
    expect(classifyInArticle(p)).toBe(true);
  });

  it('returns true when element is inside #content', () => {
    const div = document.createElement('div');
    div.id = 'content';
    const p = document.createElement('p');
    p.textContent = 'Hello';
    div.appendChild(p);
    document.body.appendChild(div);
    expect(classifyInArticle(p)).toBe(true);
  });

  it('returns true when element is inside #primary', () => {
    const div = document.createElement('div');
    div.id = 'primary';
    const p = document.createElement('p');
    p.textContent = 'Hello';
    div.appendChild(p);
    document.body.appendChild(div);
    expect(classifyInArticle(p)).toBe(true);
  });

  it('returns false when element is inside <nav>', () => {
    const nav = document.createElement('nav');
    const a = document.createElement('a');
    a.textContent = 'Link';
    nav.appendChild(a);
    document.body.appendChild(nav);
    expect(classifyInArticle(a)).toBe(false);
  });

  it('returns false when element is inside <aside>', () => {
    const aside = document.createElement('aside');
    const p = document.createElement('p');
    p.textContent = 'Sidebar';
    aside.appendChild(p);
    document.body.appendChild(aside);
    expect(classifyInArticle(p)).toBe(false);
  });

  it('returns false for a bare element with no article ancestor', () => {
    const p = document.createElement('p');
    p.textContent = 'Hello';
    document.body.appendChild(p);
    expect(classifyInArticle(p)).toBe(false);
  });

  it('finds the nearest ancestor even when nested deeply', () => {
    const article = document.createElement('article');
    const div1 = document.createElement('div');
    const div2 = document.createElement('div');
    const span = document.createElement('span');
    span.textContent = 'Deep';
    div2.appendChild(span);
    div1.appendChild(div2);
    article.appendChild(div1);
    document.body.appendChild(article);
    expect(classifyInArticle(span)).toBe(true);
  });
});
