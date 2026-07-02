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
  { platform: 'hbomax', name: 'HBO Max', methodHint: 'VTT intercept + MPD/DOM fallback' },
  { platform: 'youku', name: 'Youku', methodHint: 'Fetch ASS + DOM fallback' },
  { platform: 'netflix', name: 'Netflix', methodHint: 'JSON.parse + nflxvideo CDN' },
  { platform: 'disneyplus', name: 'Disney+', methodHint: 'JSON.parse + VTT fetch' },
  { platform: 'wetv', name: 'WeTV', methodHint: 'XHR interception (.vtt)' },
  // Generic fallback handler — listed LAST. It is the lowest-priority handler
  // (activates only when no specific handler detects the host) and is gated by
  // its own enableGenericSubtitleHandler toggle, NOT the per-site disable array.
  { platform: 'generic', name: 'Generic (Auto-detect)', methodHint: 'Auto-detect (any site with video)' },
] as const;

/** Initial number of platform sites shown before "Load more" appears */
export const SUBTITLE_SITES_INITIAL_VISIBLE = 10;

/** Number of additional platform sites revealed per "Load more" click */
export const SUBTITLE_SITES_LOAD_MORE_BATCH = 10;

/** Platform-specific sites only (excludes the generic auto-detect fallback). */
export function getPlatformSubtitleSites(
  sites: readonly SubtitleSiteInfo[] = SUPPORTED_SUBTITLE_SITES,
): SubtitleSiteInfo[] {
  return sites.filter((site) => site.platform !== 'generic');
}

export interface SubtitleSitesLoadMoreState {
  visibleSites: SubtitleSiteInfo[];
  showLoadMore: boolean;
  remainingCount: number;
  nextVisibleCount: number;
}

/** Resolve which platform sites to render and whether to show "Load more". */
export function getSubtitleSitesLoadMoreState(
  sites: readonly SubtitleSiteInfo[],
  visibleCount: number,
): SubtitleSitesLoadMoreState {
  const platformSites = getPlatformSubtitleSites(sites);
  const needsPagination = platformSites.length > SUBTITLE_SITES_INITIAL_VISIBLE;
  const clampedVisible = needsPagination
    ? Math.min(visibleCount, platformSites.length)
    : platformSites.length;
  const remainingCount = platformSites.length - clampedVisible;

  return {
    visibleSites: platformSites.slice(0, clampedVisible),
    showLoadMore: needsPagination && remainingCount > 0,
    remainingCount,
    nextVisibleCount: Math.min(
      clampedVisible + SUBTITLE_SITES_LOAD_MORE_BATCH,
      platformSites.length,
    ),
  };
}

/**
 * Check whether a platform is disabled in the user's settings.
 * Returns true when the platform identifier appears in the disabled list.
 */
export function isSiteDisabled(platform: string, disabledSites: string[]): boolean {
  return disabledSites.includes(platform);
}
