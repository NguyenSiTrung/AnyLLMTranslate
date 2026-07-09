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
  /** Brief description of the interception method (technical; shown in a tooltip for power users). */
  methodHint: string;
  /** FR-6 — short monogram shown in the leading icon/monogram dot (1–2 chars). */
  monogram?: string;
  /** FR-6 — accent color token for the monogram dot. */
  accent?: 'red' | 'blue' | 'cyan' | 'emerald' | 'amber' | 'purple' | 'pink' | 'zinc';
  /** FR-6 — friendly one-line description shown as the primary subtitle text. */
  summary?: string;
}

/** All platforms with subtitle handler implementations */
export const SUPPORTED_SUBTITLE_SITES: readonly SubtitleSiteInfo[] = [
  {
    platform: 'youtube',
    name: 'YouTube',
    methodHint: 'XHR interception',
    monogram: 'YT',
    accent: 'red',
    summary: 'Full bilingual subtitle translation on all YouTube videos.',
  },
  {
    platform: 'udemy',
    name: 'Udemy',
    methodHint: 'XHR interception',
    monogram: 'UD',
    accent: 'purple',
    summary: 'Course captions translated in real time.',
  },
  {
    platform: 'coursera',
    name: 'Coursera',
    methodHint: 'XHR interception',
    monogram: 'CO',
    accent: 'blue',
    summary: 'Lecture subtitles and transcripts translated on demand.',
  },
  {
    platform: 'linkedin',
    name: 'LinkedIn Learning',
    methodHint: 'Fetch interception',
    monogram: 'in',
    accent: 'blue',
    summary: 'Course transcripts and captions translated inline.',
  },
  {
    platform: 'hbomax',
    name: 'HBO Max',
    methodHint: 'VTT intercept + MPD/DOM fallback',
    monogram: 'Max',
    accent: 'purple',
    summary: 'Movie and show subtitles translated via DRM-safe scraping.',
  },
  {
    platform: 'youku',
    name: 'Youku',
    methodHint: 'ASS intercept + manifest/DOM fallback',
    monogram: '优',
    accent: 'red',
    summary: 'Bilingual subtitles for Youku video content.',
  },
  {
    platform: 'netflix',
    name: 'Netflix',
    methodHint: 'JSON.parse + nflxvideo CDN',
    monogram: 'N',
    accent: 'red',
    summary: 'Streaming subtitle tracks translated on playback.',
  },
  {
    platform: 'disneyplus',
    name: 'Disney+',
    methodHint: 'JSON.parse + VTT fetch',
    monogram: 'D+',
    accent: 'blue',
    summary: 'Movie and series subtitles translated inline.',
  },
  {
    platform: 'wetv',
    name: 'WeTV',
    methodHint: 'XHR interception (.vtt)',
    monogram: 'W',
    accent: 'cyan',
    summary: 'Drama and variety show subtitles translated.',
  },
  // Generic fallback handler — listed LAST. It is the lowest-priority handler
  // (activates only when no specific handler detects the host) and is gated by
  // its own enableGenericSubtitleHandler toggle, NOT the per-site disable array.
  {
    platform: 'generic',
    name: 'Generic (Auto-detect)',
    methodHint: 'Auto-detect (any site with video)',
    monogram: '✦',
    accent: 'zinc',
    summary: 'Auto-detect and translate subtitles on any other site with a video element.',
  },
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

/**
 * FR-6 — Tailwind class tokens for the per-platform monogram dot.
 * Returns bg/border/text triplet in the established NFR-4 opacity pattern.
 * Falls back to zinc when the accent is missing.
 */
export function monogramAccentClasses(accent: SubtitleSiteInfo['accent']): string {
  switch (accent) {
    case 'red':
      return 'bg-red-500/15 border-red-500/20 text-red-400';
    case 'blue':
      return 'bg-blue-500/15 border-blue-500/20 text-blue-400';
    case 'cyan':
      return 'bg-cyan-500/15 border-cyan-500/20 text-cyan-400';
    case 'emerald':
      return 'bg-emerald-500/15 border-emerald-500/20 text-emerald-400';
    case 'amber':
      return 'bg-amber-500/15 border-amber-500/20 text-amber-400';
    case 'purple':
      return 'bg-purple-500/15 border-purple-500/20 text-purple-400';
    case 'pink':
      return 'bg-pink-500/15 border-pink-500/20 text-pink-400';
    case 'zinc':
    default:
      return 'bg-zinc-500/15 border-zinc-500/20 text-zinc-400';
  }
}
