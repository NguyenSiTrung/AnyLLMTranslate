/**
 * Tests for lib/subtitleSites.ts — SUPPORTED_SUBTITLE_SITES and isSiteDisabled utility.
 */

import { describe, it, expect } from 'vitest';
import {
  SUPPORTED_SUBTITLE_SITES,
  isSiteDisabled,
  getPlatformSubtitleSites,
  getSubtitleSitesLoadMoreState,
  monogramAccentClasses,
  SUBTITLE_SITES_INITIAL_VISIBLE,
  SUBTITLE_SITES_LOAD_MORE_BATCH,
  type SubtitleSiteInfo,
} from '@/lib/subtitleSites';
import { DEFAULT_SUBTITLE_SETTINGS } from '@/types/config';

describe('SUPPORTED_SUBTITLE_SITES', () => {
  it('contains exactly 10 platforms (9 specific + generic fallback)', () => {
    expect(SUPPORTED_SUBTITLE_SITES).toHaveLength(10);
  });

  it('lists specific platforms first, generic fallback last', () => {
    const platforms = SUPPORTED_SUBTITLE_SITES.map((s) => s.platform);
    expect(platforms).toEqual([
      'youtube',
      'udemy',
      'coursera',
      'linkedin',
      'hbomax',
      'youku',
      'netflix',
      'disneyplus',
      'wetv',
      'generic',
    ]);
  });

  it('generic entry is the auto-detect fallback', () => {
    const generic = SUPPORTED_SUBTITLE_SITES.find((s) => s.platform === 'generic');
    expect(generic).toBeDefined();
    expect(generic?.methodHint).toContain('Auto-detect');
  });

  it('each entry has platform, name, and methodHint', () => {
    for (const site of SUPPORTED_SUBTITLE_SITES) {
      expect(site.platform).toBeTruthy();
      expect(site.name).toBeTruthy();
      expect(site.methodHint).toBeTruthy();
    }
  });
});

describe('isSiteDisabled', () => {
  it('returns true when platform is in the disabled list, false otherwise', () => {
    expect(isSiteDisabled('youtube', ['youtube', 'udemy'])).toBe(true);
    expect(isSiteDisabled('coursera', ['youtube', 'udemy'])).toBe(false);
    expect(isSiteDisabled('netflix', ['netflix'])).toBe(true);
    expect(isSiteDisabled('youtube', [])).toBe(false);
  });
});

function makePlatformSites(count: number): SubtitleSiteInfo[] {
  return Array.from({ length: count }, (_, index) => ({
    platform: `platform-${index}`,
    name: `Platform ${index}`,
    methodHint: 'Test interception',
  }));
}

describe('subtitle sites pagination', () => {
  it('exposes initial visible and batch sizes of 10', () => {
    expect(SUBTITLE_SITES_INITIAL_VISIBLE).toBe(10);
    expect(SUBTITLE_SITES_LOAD_MORE_BATCH).toBe(10);
  });

  it('excludes the generic fallback from platform site lists', () => {
    const platformSites = getPlatformSubtitleSites();
    expect(platformSites).toHaveLength(9);
    expect(platformSites.some((site) => site.platform === 'generic')).toBe(false);
  });

  it('shows only the first page when count exceeds the initial visible limit', () => {
    const sites = makePlatformSites(15);
    const state = getSubtitleSitesLoadMoreState(sites, SUBTITLE_SITES_INITIAL_VISIBLE);

    expect(state.visibleSites).toHaveLength(10);
    expect(state.visibleSites[0]?.platform).toBe('platform-0');
    expect(state.visibleSites[9]?.platform).toBe('platform-9');
    expect(state.showLoadMore).toBe(true);
    expect(state.remainingCount).toBe(5);
    expect(state.nextVisibleCount).toBe(15);
  });

  it('loads the next batch when visible count increases', () => {
    const sites = makePlatformSites(25);
    const firstPage = getSubtitleSitesLoadMoreState(sites, SUBTITLE_SITES_INITIAL_VISIBLE);
    const secondPage = getSubtitleSitesLoadMoreState(sites, firstPage.nextVisibleCount);

    expect(secondPage.visibleSites).toHaveLength(20);
    expect(secondPage.showLoadMore).toBe(true);
    expect(secondPage.remainingCount).toBe(5);
    expect(secondPage.nextVisibleCount).toBe(25);
  });

  it('hides load more and shows all once all platform sites are visible', () => {
    const sites = makePlatformSites(12);
    const state = getSubtitleSitesLoadMoreState(sites, 12);

    expect(state.visibleSites).toHaveLength(12);
    expect(state.showLoadMore).toBe(false);
    expect(state.remainingCount).toBe(0);
  });
});

describe('DEFAULT_SUBTITLE_SETTINGS.disabledSubtitleSites', () => {
  it('defaults to an empty array', () => {
    expect(DEFAULT_SUBTITLE_SETTINGS.disabledSubtitleSites).toEqual([]);
  });
});

describe('monogramAccentClasses (FR-6)', () => {
  it.each([
    ['red', 'bg-red-500/15 border-red-500/20 text-red-400'],
    ['blue', 'bg-blue-500/15 border-blue-500/20 text-blue-400'],
    ['cyan', 'bg-cyan-500/15 border-cyan-500/20 text-cyan-400'],
    ['purple', 'bg-purple-500/15 border-purple-500/20 text-purple-400'],
    ['zinc', 'bg-zinc-500/15 border-zinc-500/20 text-zinc-400'],
  ] as const)('returns the NFR-4 opacity triplet for accent %s', (accent, expected) => {
    expect(monogramAccentClasses(accent)).toBe(expected);
  });

  it('falls back to zinc for an undefined accent', () => {
    expect(monogramAccentClasses(undefined)).toBe('bg-zinc-500/15 border-zinc-500/20 text-zinc-400');
  });

  it('every supported site has a monogram and accent populated', () => {
    for (const site of SUPPORTED_SUBTITLE_SITES) {
      expect(site.monogram).toBeTruthy();
      expect(site.accent).toBeTruthy();
    }
  });
});
