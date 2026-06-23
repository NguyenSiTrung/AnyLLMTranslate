/**
 * Supported subtitle platform metadata and per-site disable utility.
 * Used by the Subtitles settings UI and the runtime coordinator.
 */

/** Metadata for a supported subtitle platform */
export interface SubtitleSiteInfo {
  /** Platform identifier — must match SubtitleHandler.platform */
  platform: string;
  /** Human-readable display name */
  name: string;
  /** Brief description of the interception method */
  methodHint: string;
}

/** All platforms with subtitle handler implementations */
export const SUPPORTED_SUBTITLE_SITES: readonly SubtitleSiteInfo[] = [
  { platform: 'youtube', name: 'YouTube', methodHint: 'XHR interception' },
  { platform: 'udemy', name: 'Udemy', methodHint: 'XHR interception' },
  { platform: 'coursera', name: 'Coursera', methodHint: 'XHR interception' },
  { platform: 'linkedin', name: 'LinkedIn Learning', methodHint: 'Fetch interception' },
  { platform: 'hbomax', name: 'HBO Max', methodHint: 'DOM cue scraping' },
  { platform: 'youku', name: 'Youku', methodHint: 'DOM cue scraping' },
] as const;

/**
 * Check whether a platform is disabled in the user's settings.
 * Returns true when the platform identifier appears in the disabled list.
 */
export function isSiteDisabled(platform: string, disabledSites: string[]): boolean {
  return disabledSites.includes(platform);
}
