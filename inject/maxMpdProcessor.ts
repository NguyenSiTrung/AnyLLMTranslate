/**
 * Max MPD subtitle processor — fetches and parses TTML tracks from intercepted manifests.
 *
 * Runs in MAIN world when fetch/XHR interceptors detect .mpd responses on Max pages.
 * Deduplicates repeated manifest requests and logs parsed cues to the console.
 */

import {
  detectMpdRequests,
  parseMpd,
  extractSubtitleTracks,
  fetchAndParseSubtitle,
  type ParsedSubtitleCue,
  type MpdSubtitleTrack,
} from '@/lib/maxMpdSubtitles';

const processedMpdUrls = new Set<string>();
const processedTrackUrls = new Set<string>();

/** Reset dedup state (e.g. on SPA navigation). Exported for tests. */
export function resetMaxMpdProcessorState(): void {
  processedMpdUrls.clear();
  processedTrackUrls.clear();
}

/**
 * Process an intercepted MPD manifest: extract subtitle tracks, fetch, parse, log.
 * Safe to call multiple times — duplicate MPD and track URLs are skipped.
 */
export async function processMaxMpdManifest(mpdText: string, mpdUrl: string): Promise<void> {
  if (!detectMpdRequests(mpdUrl)) return;

  const normalizedMpdUrl = normalizeUrl(mpdUrl);
  if (processedMpdUrls.has(normalizedMpdUrl)) return;
  processedMpdUrls.add(normalizedMpdUrl);

  const mpdDoc = parseMpd(mpdText, mpdUrl);
  if (!mpdDoc) {
    console.warn('AnyLLMTranslate: Failed to parse Max MPD manifest', { url: mpdUrl });
    return;
  }

  const tracks = extractSubtitleTracks(mpdDoc, mpdUrl);
  if (tracks.length === 0) {
    console.log('AnyLLMTranslate: Max MPD manifest has no subtitle tracks', { url: mpdUrl });
    return;
  }

  console.log('AnyLLMTranslate: Max MPD subtitle tracks discovered', {
    mpdUrl,
    trackCount: tracks.length,
    tracks: tracks.map((t) => ({ language: t.language, url: t.url, mimeType: t.mimeType })),
  });

  for (const track of tracks) {
    await fetchAndLogSubtitleTrack(track, mpdUrl);
  }
}

async function fetchAndLogSubtitleTrack(track: MpdSubtitleTrack, mpdUrl: string): Promise<void> {
  const normalizedTrackUrl = normalizeUrl(track.url);
  if (processedTrackUrls.has(normalizedTrackUrl)) return;
  processedTrackUrls.add(normalizedTrackUrl);

  try {
    const cues: ParsedSubtitleCue[] = await fetchAndParseSubtitle(track.url);
    console.log('AnyLLMTranslate: Max MPD subtitles parsed', {
      mpdUrl,
      language: track.language,
      url: track.url,
      cueCount: cues.length,
      cues,
    });
  } catch (error) {
    console.warn('AnyLLMTranslate: Failed to fetch/parse Max subtitle track', {
      mpdUrl,
      language: track.language,
      url: track.url,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';
    return parsed.href;
  } catch {
    return url.split('?')[0].split('#')[0];
  }
}