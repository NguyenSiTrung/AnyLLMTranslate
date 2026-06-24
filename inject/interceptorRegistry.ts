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
  private metadataPatterns: SubtitleUrlPattern[] = [];
  private manifestPatterns: SubtitleUrlPattern[] = [];

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

  /** Register a new metadata URL pattern (read-only interception) */
  registerMetadataPattern(pattern: SubtitleUrlPattern): void {
    this.metadataPatterns.push(pattern);
  }

  /** Register multiple metadata patterns at once */
  registerMetadataPatterns(patterns: SubtitleUrlPattern[]): void {
    this.metadataPatterns.push(...patterns);
  }

  /** Register a manifest URL pattern (read-only, non-blocking) */
  registerManifestPattern(pattern: SubtitleUrlPattern): void {
    this.manifestPatterns.push(pattern);
  }

  /** Register multiple manifest patterns at once */
  registerManifestPatterns(patterns: SubtitleUrlPattern[]): void {
    this.manifestPatterns.push(...patterns);
  }

  /** Match a URL against all registered subtitle patterns */
  matchUrl(url: string): UrlMatch | null {
    for (const entry of this.patterns) {
      if (entry.pattern.test(url)) {
        // Resolve relative URLs against the actual page origin so platform
        // handlers' languageExtractor receives a usable URL object. Using a
        // dummy base ('http://example.com') would yield wrong host/path info
        // for relative subtitle URLs.
        const parsedUrl = new URL(url, window.location.origin);
        return {
          platform: entry.platform,
          language: entry.languageExtractor?.(parsedUrl),
          pattern: entry.pattern,
        };
      }
    }
    return null;
  }

  /** Match a URL against all registered metadata patterns (read-only) */
  matchMetadataUrl(url: string): UrlMatch | null {
    for (const entry of this.metadataPatterns) {
      if (entry.pattern.test(url)) {
        const parsedUrl = new URL(url, window.location.origin);
        return {
          platform: entry.platform,
          language: entry.languageExtractor?.(parsedUrl),
          pattern: entry.pattern,
        };
      }
    }
    return null;
  }

  /** Match a URL against all registered manifest patterns (read-only, non-blocking) */
  matchManifestUrl(url: string): UrlMatch | null {
    for (const entry of this.manifestPatterns) {
      if (entry.pattern.test(url)) {
        const parsedUrl = new URL(url, window.location.origin);
        return {
          platform: entry.platform,
          language: entry.languageExtractor?.(parsedUrl),
          pattern: entry.pattern,
        };
      }
    }
    return null;
  }

  /** Check if a URL looks like a manifest based on content-type or URL extension */
  isManifestUrl(url: string, contentType?: string): boolean {
    // Check by content-type
    if (contentType) {
      const ct = contentType.toLowerCase().split(';')[0].trim();
      if (
        ct === 'application/vnd.apple.mpegurl' ||
        ct === 'application/x-mpegurl' ||
        ct === 'application/dash+xml'
      ) {
        return true;
      }
    }
    // Check by URL extension
    const lowerUrl = url.toLowerCase().split('?')[0];
    if (lowerUrl.endsWith('.m3u8') || lowerUrl.endsWith('.mpd')) {
      return true;
    }
    return false;
  }

  /** Get all registered patterns */
  getPatterns(): SubtitleUrlPattern[] {
    return [...this.patterns];
  }

  /** Get all registered metadata patterns */
  getMetadataPatterns(): SubtitleUrlPattern[] {
    return [...this.metadataPatterns];
  }

  /** Get all registered manifest patterns */
  getManifestPatterns(): SubtitleUrlPattern[] {
    return [...this.manifestPatterns];
  }

  /** Clear all patterns */
  clearPatterns(): void {
    this.patterns = [];
    this.metadataPatterns = [];
    this.manifestPatterns = [];
  }
}
