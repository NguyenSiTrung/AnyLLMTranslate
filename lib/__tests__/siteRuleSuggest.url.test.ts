import { describe, it, expect } from 'vitest';
import {
  parseSuggestUrl,
  hostnameFromUrl,
  preferHostnamePattern,
  tabUrlMatchesHostname,
} from '@/lib/siteRuleSuggest/url';

describe('parseSuggestUrl', () => {
  it('accepts and rejects normalized suggestion URLs', () => {
    const r = parseSuggestUrl('https://www.Example.com/path?q=1');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.url.protocol).toBe('https:');
      expect(r.url.hostname).toBe('www.example.com');
    }

    expect(parseSuggestUrl('javascript:alert(1)').ok).toBe(false);
    expect(parseSuggestUrl('file:///tmp/x').ok).toBe(false);
    expect(parseSuggestUrl('not a url').ok).toBe(false);

    const schemeless = parseSuggestUrl('example.com/foo');
    expect(schemeless.ok).toBe(true);
    if (schemeless.ok) expect(schemeless.url.protocol).toBe('https:');
  });
});

describe('hostname helpers', () => {
  it('normalizes hostname patterns and matches tab hostnames', () => {
    const url = new URL('https://www.example.com/a');
    expect(hostnameFromUrl(url)).toBe('www.example.com');
    expect(preferHostnamePattern('www.example.com')).toBe('example.com');

    expect(preferHostnamePattern('docs.example.com')).toBe('*.example.com');
    expect(preferHostnamePattern('example.com')).toBe('example.com');

    expect(tabUrlMatchesHostname('https://www.example.com/x', 'example.com')).toBe(true);
    expect(tabUrlMatchesHostname('https://other.com', 'example.com')).toBe(false);
    expect(tabUrlMatchesHostname(undefined, 'example.com')).toBe(false);
  });
});
