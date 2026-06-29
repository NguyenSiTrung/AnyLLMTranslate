/**
 * Max MPD subtitle processor — fetches and parses subtitle tracks from intercepted manifests.
 *
 * Runs in MAIN world when fetch/XHR interceptors detect .mpd responses on Max pages.
 * Deduplicates repeated manifest requests and emits parsed cues to the coordinator.
 *
 * Language selection priority:
 *   1. Extension preferredSubtitleLanguage (from SUBTITLE_CONFIG) — if not 'auto'
 *   2. Active Max player subtitle (DOM aria-checked track button)
 *   3. All MPD tracks (only when both above are unset)
 */

import type { MessageBridgeSender } from '@/inject/messageBridge';
import { createBridgeSubtitleFetcher } from '@/inject/maxMpdSubtitleFetch';
import {
  detectMpdRequests,
  parseMpd,
  extractSubtitleTracks,
  fetchAndParseSubtitle,
  type ParsedSubtitleCue,
  type MpdSubtitleTrack,
} from '@/lib/maxMpdSubtitles';
import { readMaxActiveSubtitleLanguage } from '@/lib/maxSubtitleLanguages';
import { subtitleLanguagesMatch } from '@/lib/subtitleLanguageMatch';
import type { SubtitleCue } from '@/types/subtitle';

const processedMpdUrls = new Set<string>();
const processedTrackUrls = new Set<string>();

/** Extension preferred language from coordinator (null = 'auto' or unset). */
let extensionPreferredLanguage: string | null = null;

/** Reset dedup state (e.g. on SPA navigation). Exported for tests. */
export function resetMaxMpdProcessorState(): void {
  processedMpdUrls.clear();
  processedTrackUrls.clear();
}

/** Called when coordinator sends SUBTITLE_CONFIG. Exported for tests. */
export function setMpdPreferredLanguage(lang: string | undefined): void {
  extensionPreferredLanguage = lang && lang !== 'auto' ? lang : null;
}

/**
 * Resolve which language the MPD processor should fetch.
 * Preferred extension setting wins over Max player active track.
 */
export function resolveMpdTargetLanguage(): string {
  if (extensionPreferredLanguage) return extensionPreferredLanguage;
  return readMaxActiveSubtitleLanguage();
}

/**
 * Process an intercepted MPD manifest: extract subtitle tracks, fetch, parse, emit.
 */
export async function processMaxMpdManifest(
  mpdText: string,
  mpdUrl: string,
  bridge?: MessageBridgeSender,
): Promise<void> {
  if (!detectMpdRequests(mpdUrl)) return;

  const normalizedMpdUrl = normalizeUrl(mpdUrl);
  if (processedMpdUrls.has(normalizedMpdUrl)) return;
  processedMpdUrls.add(normalizedMpdUrl);

  try {
    bridge?.send('SUBTITLE_MPD_PROCESSING', {
      mpdUrl,
      platform: 'hbomax',
      status: 'started',
    });

    const mpdDoc = parseMpd(mpdText, mpdUrl);
  if (!mpdDoc) {
    console.warn('AnyLLMTranslate: Failed to parse Max MPD manifest', { url: mpdUrl });
    bridge?.send('SUBTITLE_MPD_PROCESSING', {
      mpdUrl,
      platform: 'hbomax',
      status: 'complete',
      success: false,
    });
    return;
  }

  const targetLang = resolveMpdTargetLanguage();
  const tracks = selectTracksForFetch(extractSubtitleTracks(mpdDoc, mpdUrl), targetLang);
  if (tracks.length === 0) {
    console.log('AnyLLMTranslate: Max MPD manifest has no matching subtitle tracks', {
      url: mpdUrl,
      targetLanguage: targetLang || undefined,
      preferredLanguage: extensionPreferredLanguage ?? undefined,
      activeLanguage: readMaxActiveSubtitleLanguage() || undefined,
    });
    bridge?.send('SUBTITLE_MPD_PROCESSING', {
      mpdUrl,
      platform: 'hbomax',
      status: 'complete',
      success: false,
    });
    return;
  }

  console.log('AnyLLMTranslate: Max MPD subtitle tracks discovered', {
    mpdUrl,
    targetLanguage: targetLang || undefined,
    preferredLanguage: extensionPreferredLanguage ?? undefined,
    activeLanguage: readMaxActiveSubtitleLanguage() || undefined,
    trackCount: tracks.length,
    tracks: tracks.map((t) => ({
      language: t.language,
      url: t.url,
      mimeType: t.mimeType,
      segmentCount: t.segmentUrls?.length ?? (t.segmentFetch ? 'progressive' : 1),
    })),
  });

  let emitted = false;

  for (const track of tracks) {
    const cues = await fetchAndEmitSubtitleTrack(track, mpdUrl, bridge, true);
    if (cues && cues.length > 0) {
      emitted = true;
      break;
    }
  }

  if (!emitted && targetLang) {
    console.log('AnyLLMTranslate: MPD subtitle track unavailable for target language — DOM fallback', {
      targetLanguage: targetLang,
      preferredLanguage: extensionPreferredLanguage ?? undefined,
      activeLanguage: readMaxActiveSubtitleLanguage() || undefined,
      mpdUrl,
    });
  }

    bridge?.send('SUBTITLE_MPD_PROCESSING', {
      mpdUrl,
      platform: 'hbomax',
      status: 'complete',
      success: emitted,
    });
  } catch (error) {
    console.warn('AnyLLMTranslate: Max MPD processor failed', {
      mpdUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    bridge?.send('SUBTITLE_MPD_PROCESSING', {
      mpdUrl,
      platform: 'hbomax',
      status: 'complete',
      success: false,
    });
  }
}

/**
 * Select tracks to fetch. When a target language is set, only matching MPD tracks are returned.
 */
export function selectTracksForFetch(
  tracks: MpdSubtitleTrack[],
  targetLang: string,
): MpdSubtitleTrack[] {
  if (!targetLang) return tracks;

  const matched = tracks.filter((t) => subtitleLanguagesMatch(t.language, targetLang));
  return matched;
}

/** @deprecated Use selectTracksForFetch — kept for existing tests. */
export function prioritizeTracksForFetch(tracks: MpdSubtitleTrack[]): MpdSubtitleTrack[] {
  return selectTracksForFetch(tracks, resolveMpdTargetLanguage());
}

async function fetchAndEmitSubtitleTrack(
  track: MpdSubtitleTrack,
  mpdUrl: string,
  bridge?: MessageBridgeSender,
  isPriority = true,
): Promise<SubtitleCue[] | null> {
  const normalizedTrackUrl = normalizeUrl(track.url);
  if (processedTrackUrls.has(normalizedTrackUrl)) return null;

  try {
    const fetchSegment = bridge ? createBridgeSubtitleFetcher(bridge) : undefined;
    const cues: ParsedSubtitleCue[] = await fetchAndParseSubtitle(track.url, {
      segmentUrls: track.segmentUrls,
      segmentFetch: track.segmentFetch,
      fetchSegment,
    });
    const subtitleCues: SubtitleCue[] = cues.map((cue) => ({
      startTime: cue.start,
      endTime: cue.end,
      text: cue.text,
    }));

    console.log('AnyLLMTranslate: Max MPD subtitles parsed', {
      mpdUrl,
      language: track.language,
      url: track.url,
      segmentCount: track.segmentUrls?.length ?? (track.segmentFetch ? 'progressive' : 1),
      cueCount: subtitleCues.length,
    });

    if (subtitleCues.length > 0) {
      processedTrackUrls.add(normalizedTrackUrl);
      if (bridge) {
        bridge.send('SUBTITLE_MANIFEST_CUES', {
          cues: subtitleCues,
          platform: 'hbomax',
          language: track.language,
          url: track.url,
        });
      }
    }

    return subtitleCues;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const is404 = message.includes('404');
    const isMpdError = message.includes('returned MPD manifest');

    if (isPriority) {
      const level = (is404 || isMpdError) ? 'log' : 'warn';
      console[level]('AnyLLMTranslate: MPD subtitle track unavailable', {
        mpdUrl,
        language: track.language,
        url: track.url,
        error: message,
      });
    } else {
      console.log('AnyLLMTranslate: Skipping unavailable MPD subtitle track', {
        language: track.language,
        error: message,
      });
    }
    return null;
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