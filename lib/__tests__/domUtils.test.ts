import { describe, it, expect, beforeEach } from 'vitest';
import { matchesCached, __resetMatchCacheForTest } from '../domUtils';

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
