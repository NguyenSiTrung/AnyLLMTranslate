/**
 * Base subtitle handler interface and handler registry.
 * Platform handlers implement this interface and register via the registry.
 */

import type { SubtitleCue, SubtitleUrlPattern, AvailableSubtitleTrack, DomCueSource } from '@/types/subtitle';

/** Abstract interface that all platform handlers must implement */
export interface SubtitleHandler {
  /** Platform identifier (e.g., 'youtube', 'udemy', 'coursera') */
  readonly platform: string;

  /** Detect if this handler applies to the current page */
  detect(): boolean;

  /** Get URL patterns this handler should intercept */
  getPatterns(): SubtitleUrlPattern[];

  /** Transform a raw subtitle response body into SubtitleCue[] */
  transformResponse(body: string, contentType: string, url: string): SubtitleCue[];

  /** Get URL patterns for metadata API responses that list available tracks (optional) */
  getMetadataPatterns?(): SubtitleUrlPattern[];

  /** Extract available subtitle tracks from a metadata API response (optional) */
  extractAvailableTracks?(body: string, contentType: string, url: string): AvailableSubtitleTrack[];

  /** For DOM-sourced platforms (e.g. Max): return cue-scraping contract.
   *  Platforms that intercept URLs return undefined. */
  getDomCueSource?(): DomCueSource;

  /** Whether the current page is a video watch page (vs. listing/search).
   *  When absent, callers fall back to hostname-based detection. */
  isWatchPage?(): boolean;
}

/** Handler registry — auto-detects platform by hostname and routes to the right handler */
const handlers: SubtitleHandler[] = [];

/** Register one or more subtitle handlers */
export function registerSubtitleHandlers(newHandlers: SubtitleHandler[]): void {
  for (const handler of newHandlers) {
    handlers.push(handler);
  }
}

/** Get all registered handlers */
export function getSubtitleHandlers(): SubtitleHandler[] {
  return [...handlers];
}

/** Find the handler that applies to the current page */
export function detectCurrentHandler(): SubtitleHandler | null {
  for (const handler of handlers) {
    if (handler.detect()) return handler;
  }
  return null;
}

/** Get all URL patterns from handlers that detect the current hostname.
 *  This avoids cross-platform false positives from non-target domains. */
export function getPatternsForCurrentHost(): SubtitleUrlPattern[] {
  const patterns: SubtitleUrlPattern[] = [];
  for (const handler of handlers) {
    if (handler.detect()) {
      patterns.push(...handler.getPatterns());
    }
  }
  return patterns;
}

/** Get all URL patterns from all registered handlers */
export function getAllPatterns(): SubtitleUrlPattern[] {
  const patterns: SubtitleUrlPattern[] = [];
  for (const handler of handlers) {
    patterns.push(...handler.getPatterns());
  }
  return patterns;
}

/** Find a handler by its platform identifier string */
export function getHandlerByPlatform(platform: string): SubtitleHandler | null {
  return handlers.find((h) => h.platform === platform) ?? null;
}

/** Get all metadata URL patterns from handlers that match the current hostname */
export function getMetadataPatternsForCurrentHost(): SubtitleUrlPattern[] {
  const patterns: SubtitleUrlPattern[] = [];
  for (const handler of handlers) {
    if (handler.detect() && handler.getMetadataPatterns) {
      patterns.push(...handler.getMetadataPatterns());
    }
  }
  return patterns;
}
