import { describe, it, expect } from 'vitest';
import {
  parseSuggestUrl,
  hostnameFromUrl,
  preferHostnamePattern,
  tabUrlMatchesHostname,
} from '@/lib/siteRuleSuggest/url';

describe('parseSuggestUrl', () => {
  it('accepts https URLs and normalizes', () => {
    const r = parseSuggestUrl('https://www.Example.com/path?q=1');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.url.protocol).toBe('https:');
      expect(r.url.hostname).toBe('www.example.com');
    }
  });

  it('rejects non-http(s)', () => {
    expect(parseSuggestUrl('javascript:alert(1)').ok).toBe(false);
    expect(parseSuggestUrl('file:///tmp/x').ok).toBe(false);
    expect(parseSuggestUrl('not a url').ok).toBe(false);
  });

  it('adds https when scheme missing but host-like', () => {
    const r = parseSuggestUrl('example.com/foo');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url.protocol).toBe('https:');
  });
});

describe('hostname helpers', () => {
  it('strips leading www. for pattern preference on simple hosts', () => {
    const url = new URL('https://www.example.com/a');
    expect(hostnameFromUrl(url)).toBe('www.example.com');
    expect(preferHostnamePattern('www.example.com')).toBe('example.com');
  });

  it('uses wildcard for multi-part subdomains when depth > 2 labels beyond public-ish host', () => {
    expect(preferHostnamePattern('docs.example.com')).toBe('*.example.com');
    expect(preferHostnamePattern('example.com')).toBe('example.com');
  });

  it('matches tab URLs by hostname ignoring www', () => {
    expect(tabUrlMatchesHostname('https://www.example.com/x', 'example.com')).toBe(true);
    expect(tabUrlMatchesHostname('https://other.com', 'example.com')).toBe(false);
    expect(tabUrlMatchesHostname(undefined, 'example.com')).toBe(false);
  });
});
