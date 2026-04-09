/**
 * Interceptor Registry — Manages subtitle URL patterns and match detection.
 *
 * Platform handlers register their URL patterns here.
 * The interceptors (XHR/Fetch) use this to determine if a request should be intercepted.
 */

import type { SubtitleUrlPattern } from '@/types/subtitle';

export interface UrlMatch {
  platform: string;
  language?: string;
  pattern: RegExp;
}

export class InterceptorRegistry {
  private patterns: SubtitleUrlPattern[] = [];

  constructor(
    private messageSender?: { send: (type: string, payload: unknown) => string },
  ) {}

  /** Register a new subtitle URL pattern */
  registerPattern(pattern: SubtitleUrlPattern): void {
    this.patterns.push(pattern);
  }

  /** Register multiple patterns at once */
  registerPatterns(patterns: SubtitleUrlPattern[]): void {
    this.patterns.push(...patterns);
  }

  /** Match a URL against all registered patterns */
  matchUrl(url: string): UrlMatch | null {
    for (const entry of this.patterns) {
      if (entry.pattern.test(url)) {
        const parsedUrl = new URL(url, 'http://example.com');
        return {
          platform: entry.platform,
          language: entry.languageExtractor?.(parsedUrl),
          pattern: entry.pattern,
        };
      }
    }
    return null;
  }

  /** Get all registered patterns */
  getPatterns(): SubtitleUrlPattern[] {
    return [...this.patterns];
  }

  /** Clear all patterns */
  clearPatterns(): void {
    this.patterns = [];
  }
}
