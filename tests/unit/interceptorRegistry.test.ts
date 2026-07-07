import { describe, it, expect, beforeEach } from 'vitest';
import { InterceptorRegistry } from '@/inject/interceptorRegistry';
import type { SubtitleUrlPattern } from '@/types/subtitle';

describe('InterceptorRegistry', () => {
  let registry: InterceptorRegistry;

  beforeEach(() => {
    registry = new InterceptorRegistry();
  });

  it('returns null for unmatched URLs', () => {
    const result = registry.matchUrl('https://example.com/api/data');
    expect(result).toBeNull();
  });

  it('matches registered patterns', () => {
    const pattern: SubtitleUrlPattern = {
      platform: 'youtube',
      pattern: /\/api\/timedtext/,
    };
    registry.registerPattern(pattern);

    const result = registry.matchUrl('https://www.youtube.com/api/timedtext?v=abc123');
    expect(result).not.toBeNull();
    expect(result?.platform).toBe('youtube');
  });

  it('extracts language from URL when extractor is provided', () => {
    const pattern: SubtitleUrlPattern = {
      platform: 'youtube',
      pattern: /\/api\/timedtext/,
      languageExtractor: (url) => url.searchParams.get('lang') || '',
    };
    registry.registerPattern(pattern);

    const result = registry.matchUrl('https://www.youtube.com/api/timedtext?lang=en&v=abc');
    expect(result?.language).toBe('en');
  });

  it('registers multiple patterns', () => {
    const patterns: SubtitleUrlPattern[] = [
      { platform: 'youtube', pattern: /\/api\/timedtext/ },
      { platform: 'udemy', pattern: /\.udemycdn\.com\/.*\.vtt/ },
    ];
    registry.registerPatterns(patterns);

    expect(registry.matchUrl('https://www.youtube.com/api/timedtext')?.platform).toBe('youtube');
    expect(registry.matchUrl('https://cdna.udemycdn.com/subs/course.vtt')?.platform).toBe('udemy');
    expect(registry.matchUrl('https://example.com/other')).toBeNull();
  });

  it('clears all patterns', () => {
    registry.registerPattern({ platform: 'test', pattern: /test/ });
    expect(registry.matchUrl('https://example.com/test')).not.toBeNull();

    registry.clearPatterns();
    expect(registry.matchUrl('https://example.com/test')).toBeNull();
  });

  it('returns a copy of patterns', () => {
    registry.registerPattern({ platform: 'test', pattern: /test/ });
    const patterns = registry.getPatterns();
    expect(patterns).toHaveLength(1);

    // Modifying the returned array doesn't affect the registry
    patterns.length = 0;
    expect(registry.getPatterns()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Content-Type based secondary subtitle detection (Phase 2).
// URL pattern matching takes precedence; content-type is consulted only on
// URL miss.
// ---------------------------------------------------------------------------

describe('InterceptorRegistry — Content-Type matching', () => {
  let registry: InterceptorRegistry;

  beforeEach(() => {
    registry = new InterceptorRegistry();
  });

  it('returns null for unmatched Content-Types', () => {
    registry.registerContentTypePatterns([{ platform: 'generic', contentTypes: ['text/vtt'] }]);
    expect(registry.matchContentType('application/json')).toBeNull();
    expect(registry.matchContentType('')).toBeNull();
  });

  it.each([
    ['text/VTT'], // case-insensitive
    ['text/vtt; charset=utf-8'], // params trimmed
  ])('matches registered Content-Type %s', (ct) => {
    registry.registerContentTypePatterns([{ platform: 'generic', contentTypes: ['text/vtt'] }]);
    const result = registry.matchContentType(ct);
    expect(result).not.toBeNull();
    expect(result?.platform).toBe('generic');
    expect(result?.contentType).toBe('text/vtt');
  });

  it('matches application/x-subtitle and application/ttml+xml', () => {
    registry.registerContentTypePatterns([
      { platform: 'generic', contentTypes: ['application/x-subtitle', 'application/ttml+xml'] },
    ]);
    expect(registry.matchContentType('application/x-subtitle')?.platform).toBe('generic');
    expect(registry.matchContentType('application/ttml+xml')?.platform).toBe('generic');
  });

  it('first platform to claim a Content-Type wins (deterministic on conflict)', () => {
    registry.registerContentTypePatterns([
      { platform: 'generic', contentTypes: ['text/vtt'] },
      { platform: 'other', contentTypes: ['text/vtt'] }, // duplicate — ignored
    ]);
    expect(registry.matchContentType('text/vtt')?.platform).toBe('generic');
  });

  it('URL pattern matching takes precedence over Content-Type', () => {
    // A URL-pattern match resolves regardless of content-type registration.
    registry.registerPattern({ platform: 'youtube', pattern: /\/api\/timedtext/ });
    registry.registerContentTypePatterns([{ platform: 'generic', contentTypes: ['text/vtt'] }]);

    expect(registry.matchUrl('https://youtube.com/api/timedtext')?.platform).toBe('youtube');
    // matchContentType is independent — callers try URL first, then content-type.
    expect(registry.matchContentType('text/vtt')?.platform).toBe('generic');
  });

  it('getContentTypePatterns returns grouped platform → content-types', () => {
    registry.registerContentTypePatterns([
      { platform: 'generic', contentTypes: ['text/vtt', 'application/x-subtitle'] },
    ]);
    const result = registry.getContentTypePatterns();
    expect(result).toHaveLength(1);
    expect(result[0].platform).toBe('generic');
    expect(result[0].contentTypes).toContain('text/vtt');
    expect(result[0].contentTypes).toContain('application/x-subtitle');
  });

  it('clearPatterns clears content-type patterns too', () => {
    registry.registerContentTypePatterns([{ platform: 'generic', contentTypes: ['text/vtt'] }]);
    expect(registry.matchContentType('text/vtt')).not.toBeNull();
    registry.clearPatterns();
    expect(registry.matchContentType('text/vtt')).toBeNull();
  });
});
