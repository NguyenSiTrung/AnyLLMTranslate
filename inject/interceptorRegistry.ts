/**
 * Interceptor Registry — Manages subtitle URL patterns and match detection.
 *
 * Platform handlers register their URL patterns here.
 * The interceptors (XHR/Fetch) use this to determine if a request should be intercepted.
 */

import type { SubtitleUrlPattern, SubtitleContentTypePattern } from '@/types/subtitle';

export interface UrlMatch {
  platform: string;
  language?: string;
  pattern: RegExp;
}

/** Match result for content-type based detection (secondary signal). */
export interface ContentTypeMatch {
  platform: string;
  /** The matched Content-Type value (lowercased, params trimmed). */
  contentType: string;
}

export class InterceptorRegistry {
  private patterns: SubtitleUrlPattern[] = [];
  private metadataPatterns: SubtitleUrlPattern[] = [];
  private manifestPatterns: SubtitleUrlPattern[] = [];
  /**
   * Content-Type → platform map for secondary subtitle detection. Populated
   * from handlers' getContentTypePatterns(). URL patterns take precedence.
   * Keys are lowercased Content-Type values with `;` params trimmed.
   */
  private contentTypeMap: Map<string, string> = new Map();

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

  /**
   * Register Content-Type patterns for secondary subtitle detection. The first
   * platform to claim a Content-Type wins (later duplicates are ignored) to
   * keep the match deterministic. Values are normalized to lowercase + trimmed
   * of `;` params at match time, so callers should declare them the same way.
   */
  registerContentTypePatterns(patterns: SubtitleContentTypePattern[]): void {
    for (const entry of patterns) {
      for (const ct of entry.contentTypes) {
        const key = normalizeContentType(ct);
        if (key && !this.contentTypeMap.has(key)) {
          this.contentTypeMap.set(key, entry.platform);
        }
      }
    }
  }

  /** Match a URL against all registered subtitle patterns */
  matchUrl(url: string): UrlMatch | null {
    return this.matchRegisteredUrl(this.patterns, url);
  }

  /** Match a URL against all registered metadata patterns (read-only) */
  matchMetadataUrl(url: string): UrlMatch | null {
    return this.matchRegisteredUrl(this.metadataPatterns, url);
  }

  /** Match a URL against all registered manifest patterns (read-only, non-blocking) */
  matchManifestUrl(url: string): UrlMatch | null {
    return this.matchRegisteredUrl(this.manifestPatterns, url);
  }

  private matchRegisteredUrl(patterns: SubtitleUrlPattern[], url: string): UrlMatch | null {
    const candidates = [url];
    const absoluteUrl = resolveUrlForMatching(url);
    if (absoluteUrl !== url) candidates.push(absoluteUrl);

    for (const candidate of candidates) {
      for (const entry of patterns) {
        if (!entry.pattern.test(candidate)) continue;
        // Resolve relative URLs against the actual page origin so platform
        // handlers' languageExtractor receives a usable URL object.
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

  /**
   * Match a response Content-Type against the registered content-type patterns.
   * Secondary signal — URL pattern matching (matchUrl) must be tried FIRST and
   * takes precedence. Returns the owning platform + the normalized content-type,
   * or null when no pattern matches.
   */
  matchContentType(contentType: string): ContentTypeMatch | null {
    const key = normalizeContentType(contentType);
    if (!key) return null;
    const platform = this.contentTypeMap.get(key);
    if (!platform) return null;
    return { platform, contentType: key };
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

  /** Get the registered Content-Type → platform map (for inspection/testing). */
  getContentTypePatterns(): SubtitleContentTypePattern[] {
    const grouped = new Map<string, string[]>();
    for (const [ct, platform] of this.contentTypeMap) {
      const arr = grouped.get(platform) ?? [];
      arr.push(ct);
      grouped.set(platform, arr);
    }
    return [...grouped.entries()].map(([platform, contentTypes]) => ({ platform, contentTypes }));
  }

  /** Clear all patterns */
  clearPatterns(): void {
    this.patterns = [];
    this.metadataPatterns = [];
    this.manifestPatterns = [];
    this.contentTypeMap.clear();
  }
}

/** Resolve relative requests for patterns that include the current host. */
function resolveUrlForMatching(url: string): string {
  try {
    return new URL(url, window.location.origin).href;
  } catch {
    return url;
  }
}

/**
 * Normalize a Content-Type header value for comparison: lowercase + trim the
 * `;` parameters (e.g. `text/vtt; charset=utf-8` → `text/vtt`). Returns the
 * empty string for falsy input so callers can treat it as "no match".
 */
function normalizeContentType(contentType: string): string {
  if (!contentType) return '';
  return contentType.toLowerCase().split(';')[0].trim();
}
