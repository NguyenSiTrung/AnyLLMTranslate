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
