import { describe, it, expect, beforeEach } from 'vitest';
import { InterceptorRegistry } from '@/inject/interceptorRegistry';
import type { SubtitleUrlPattern } from '@/types/subtitle';

describe('InterceptorRegistry', () => {
  let registry: InterceptorRegistry;

  beforeEach(() => {
    registry = new InterceptorRegistry();
  });

  it('matches URL patterns, extracts language, clears, and returns copies', () => {
    expect(registry.matchUrl('https://example.com/api/data')).toBeNull();

    const pattern: SubtitleUrlPattern = {
      platform: 'youtube',
      pattern: /\/api\/timedtext/,
      languageExtractor: (url) => url.searchParams.get('lang') || '',
    };
    registry.registerPattern(pattern);
    expect(registry.matchUrl('https://www.youtube.com/api/timedtext?v=abc123')?.platform).toBe(
      'youtube',
    );
    expect(
      registry.matchUrl('https://www.youtube.com/api/timedtext?lang=en&v=abc')?.language,
    ).toBe('en');

    registry.clearPatterns();
    registry.registerPatterns([
      { platform: 'youtube', pattern: /\/api\/timedtext/ },
      { platform: 'udemy', pattern: /\.udemycdn\.com\/.*\.vtt/ },
    ]);
    expect(registry.matchUrl('https://www.youtube.com/api/timedtext')?.platform).toBe('youtube');
    expect(registry.matchUrl('https://cdna.udemycdn.com/subs/course.vtt')?.platform).toBe('udemy');
    expect(registry.matchUrl('https://example.com/other')).toBeNull();

    const patterns = registry.getPatterns();
    expect(patterns).toHaveLength(2);
    patterns.length = 0;
    expect(registry.getPatterns()).toHaveLength(2);

    registry.clearPatterns();
    expect(registry.matchUrl('https://www.youtube.com/api/timedtext')).toBeNull();
  });
});

describe('InterceptorRegistry — Content-Type matching', () => {
  let registry: InterceptorRegistry;

  beforeEach(() => {
    registry = new InterceptorRegistry();
  });

  it('matches content-types (case/params), first-writer wins, and clears with URL patterns', () => {
    registry.registerContentTypePatterns([
      { platform: 'generic', contentTypes: ['text/vtt', 'application/x-subtitle', 'application/ttml+xml'] },
    ]);
    expect(registry.matchContentType('application/json')).toBeNull();
    expect(registry.matchContentType('')).toBeNull();

    for (const ct of ['text/VTT', 'text/vtt; charset=utf-8']) {
      const result = registry.matchContentType(ct);
      expect(result?.platform).toBe('generic');
      expect(result?.contentType).toBe('text/vtt');
    }
    expect(registry.matchContentType('application/x-subtitle')?.platform).toBe('generic');
    expect(registry.matchContentType('application/ttml+xml')?.platform).toBe('generic');

    registry.clearPatterns();
    registry.registerContentTypePatterns([
      { platform: 'generic', contentTypes: ['text/vtt'] },
      { platform: 'other', contentTypes: ['text/vtt'] },
    ]);
    expect(registry.matchContentType('text/vtt')?.platform).toBe('generic');

    registry.registerPattern({ platform: 'youtube', pattern: /\/api\/timedtext/ });
    expect(registry.matchUrl('https://youtube.com/api/timedtext')?.platform).toBe('youtube');
    expect(registry.matchContentType('text/vtt')?.platform).toBe('generic');

    const grouped = registry.getContentTypePatterns();
    expect(grouped).toHaveLength(1);
    expect(grouped[0]!.platform).toBe('generic');
    expect(grouped[0]!.contentTypes).toContain('text/vtt');

    registry.clearPatterns();
    expect(registry.matchContentType('text/vtt')).toBeNull();
  });
});
