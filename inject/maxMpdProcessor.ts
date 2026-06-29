/**
 * Max MPD subtitle processor — fetches and parses subtitle tracks from intercepted manifests.
 *
 * Runs in MAIN world when fetch/XHR interceptors detect .mpd responses on Max pages.
 * Deduplicates repeated manifest requests and emits parsed cues to the coordinator.
 */

import type { MessageBridgeSender } from '@/inject/messageBridge';
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

/** Reset dedup state (e.g. on SPA navigation). Exported for tests. */
export function resetMaxMpdProcessorState(): void {
  processedMpdUrls.clear();
  processedTrackUrls.clear();
}

/**
 * Process an intercepted MPD manifest: extract subtitle tracks, fetch, parse, emit.
 * Prefers the active Max subtitle language from the DOM; skips unavailable CDN tracks quietly.
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

  const mpdDoc = parseMpd(mpdText, mpdUrl);
  if (!mpdDoc) {
    console.warn('AnyLLMTranslate: Failed to parse Max MPD manifest', { url: mpdUrl });
    return;
  }

  const tracks = prioritizeTracksForFetch(extractSubtitleTracks(mpdDoc, mpdUrl));
  if (tracks.length === 0) {
    console.log('AnyLLMTranslate: Max MPD manifest has no subtitle tracks', { url: mpdUrl });
    return;
  }

  console.log('AnyLLMTranslate: Max MPD subtitle tracks discovered', {
    mpdUrl,
    trackCount: tracks.length,
    activeLanguage: readMaxActiveSubtitleLanguage() || undefined,
    tracks: tracks.map((t) => ({ language: t.language, url: t.url, mimeType: t.mimeType })),
  });

  const activeLang = readMaxActiveSubtitleLanguage();
  let emitted = false;

  for (const track of tracks) {
    const isPriority = !activeLang || subtitleLanguagesMatch(track.language, activeLang);
    const cues = await fetchAndEmitSubtitleTrack(track, mpdUrl, bridge, isPriority);
    if (cues && cues.length > 0) {
      emitted = true;
      if (isPriority) break;
    }
    // When user has an active language, don't fall back to other languages.
    if (activeLang && isPriority) break;
  }

  if (!emitted && activeLang) {
    console.log('AnyLLMTranslate: MPD subtitle track unavailable for active language — DOM fallback', {
      activeLanguage: activeLang,
      mpdUrl,
    });
  }
}

/** Order tracks: active Max language first, then the rest. */
export function prioritizeTracksForFetch(tracks: MpdSubtitleTrack[]): MpdSubtitleTrack[] {
  const activeLang = readMaxActiveSubtitleLanguage();
  if (!activeLang) return tracks;

  const priority: MpdSubtitleTrack[] = [];
  const rest: MpdSubtitleTrack[] = [];
  for (const track of tracks) {
    if (subtitleLanguagesMatch(track.language, activeLang)) {
      priority.push(track);
    } else {
      rest.push(track);
    }
  }
  return [...priority, ...rest];
}

async function fetchAndEmitSubtitleTrack(
  track: MpdSubtitleTrack,
  mpdUrl: string,
  bridge?: MessageBridgeSender,
  isPriority = true,
): Promise<SubtitleCue[] | null> {
  const normalizedTrackUrl = normalizeUrl(track.url);
  if (processedTrackUrls.has(normalizedTrackUrl)) return null;
  processedTrackUrls.add(normalizedTrackUrl);

  try {
    const cues: ParsedSubtitleCue[] = await fetchAndParseSubtitle(track.url);
    const subtitleCues: SubtitleCue[] = cues.map((cue) => ({
      startTime: cue.start,
      endTime: cue.end,
      text: cue.text,
    }));

    console.log('AnyLLMTranslate: Max MPD subtitles parsed', {
      mpdUrl,
      language: track.language,
      url: track.url,
      cueCount: subtitleCues.length,
    });

    if (bridge && subtitleCues.length > 0) {
      bridge.send('SUBTITLE_MANIFEST_CUES', {
        cues: subtitleCues,
        platform: 'hbomax',
        language: track.language,
        url: track.url,
      });
    }

    return subtitleCues;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const is404 = message.includes('404');

    if (isPriority) {
      const level = is404 ? 'log' : 'warn';
      console[level]('AnyLLMTranslate: Active MPD subtitle track unavailable', {
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