/**
 * YouTube link pre-align orchestration (Options → Subtitle Studio → paste URL).
 *
 * Fetches the watch page, extracts the ASR caption track, runs the existing
 * AI re-align pipeline (BYOK pool, batched, single-flight) ahead of playback,
 * and saves the result to the AI re-align cache (`ai:{videoId}:{lang}:{hash}`).
 * A later watch reuses the saved cues and only translation runs at playback.
 *
 * Never translates. Fail-open: playback behavior is never affected.
 * Network only here (background); extraction/selection logic is pure
 * (`lib/youtubeWatchPage.ts`). No DOMParser — json3 path only.
 */

import {
  buildAsrRealignCacheKey,
  extractYoutubeVideoIdFromUrl,
  hashAsrRealignContent,
  stripYoutubeTitleSuffix,
  youtubeThumbnailUrl,
  youtubeWatchUrl,
  type YoutubeAsrRealignCacheEntry,
} from '@/lib/youtubeAsrRealignCache';
import { prepareYoutubeAsrAiInput } from '@/lib/youtubeAsrResegment';
import {
  buildJson3TimedtextUrl,
  extractPlayerResponseFromWatchHtml,
  selectAsrTrack,
} from '@/lib/youtubeWatchPage';
import { YouTubeHandler } from '@/inject/subtitleHandlers/youtube';
import type { TranslationService } from '@/services/base';
import {
  getAsrRealignEntry,
  getOrCreateAsrRealignInflight,
  saveAsrRealignEntry,
  touchAsrRealignEntry,
} from '@/services/youtubeAsrRealignStore';
import type {
  AsrRealignProgressBroadcastMessage,
  RealignYoutubeUrlErrorCode,
  RealignYoutubeUrlResult,
} from '@/types/messages';

/** Consistent with FETCH_SUBTITLE. */
const FETCH_TIMEOUT_MS = 30000;

export type PrealignFetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface YoutubeLinkPrealignDeps {
  /** Injected for tests; defaults to global fetch. */
  fetchFn?: PrealignFetchFn;
  /** Background wires `initService` (provider pool). */
  resolveService: () => Promise<Pick<TranslationService, 'resegmentYoutubeAsr'>>;
  /** Defaults to a runtime broadcast of ASR_REALIGN_PROGRESS_BROADCAST. */
  broadcastProgress?: (videoId: string, current: number, total: number) => void;
  /** Defaults to a runtime broadcast of ASR_REALIGN_CACHE_UPDATED. */
  broadcastCacheUpdated?: () => void;
  now?: () => number;
}

function defaultBroadcastProgress(videoId: string, current: number, total: number): void {
  try {
    const payload: AsrRealignProgressBroadcastMessage = {
      action: 'ASR_REALIGN_PROGRESS_BROADCAST',
      videoId,
      current,
      total,
    };
    chrome.runtime.sendMessage(payload).catch(() => {});
  } catch {
    // no receiver
  }
}

function defaultBroadcastCacheUpdated(): void {
  try {
    chrome.runtime.sendMessage({ action: 'ASR_REALIGN_CACHE_UPDATED' }).catch(() => {});
  } catch {
    // no receiver
  }
}

type FetchTextOutcome =
  | { ok: true; body: string }
  | { ok: false; error: string; httpStatus?: number };

async function fetchText(fetchFn: PrealignFetchFn, url: string): Promise<FetchTextOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchFn(url, { signal: controller.signal });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}: ${res.statusText}`, httpStatus: res.status };
    }
    return { ok: true, body: await res.text() };
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? 'Fetch timed out after 30s'
        : error instanceof Error
          ? error.message
          : String(error);
    return { ok: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}

/** Timedtext baseUrl must stay on YouTube (player-response data is untrusted). */
function isYoutubeTimedtextUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'youtube.com' || host.endsWith('.youtube.com');
  } catch {
    return false;
  }
}

function fail(
  errorCode: RealignYoutubeUrlErrorCode,
  error: string,
): RealignYoutubeUrlResult {
  return { success: false, errorCode, error };
}

export async function runYoutubeLinkPrealign(
  url: string,
  deps: YoutubeLinkPrealignDeps,
): Promise<RealignYoutubeUrlResult> {
  const fetchFn = deps.fetchFn ?? ((u, init) => fetch(u, init));
  const broadcastProgress = deps.broadcastProgress ?? defaultBroadcastProgress;
  const broadcastCacheUpdated = deps.broadcastCacheUpdated ?? defaultBroadcastCacheUpdated;
  const now = deps.now ?? (() => Date.now());

  try {
    // 1. Validate the pasted URL.
    const videoId = extractYoutubeVideoIdFromUrl(url);
    if (!videoId) {
      return fail('invalid-url', 'Not a valid YouTube watch, share, shorts, or embed URL');
    }

    // 2. Fetch the watch-page HTML. The URL is built by us from the videoId,
    //    so it is inherently youtube-only.
    const watch = await fetchText(fetchFn, youtubeWatchUrl(videoId));
    if (!watch.ok) {
      return watch.httpStatus
        ? fail('video-unavailable', `Watch page returned ${watch.error}`)
        : fail('fetch-blocked', `Could not fetch the watch page: ${watch.error}`);
    }

    // 3. Extract the player response (null on consent/bot/malformed pages).
    const extracted = extractPlayerResponseFromWatchHtml(watch.body);
    if (!extracted) {
      return fail(
        'fetch-blocked',
        'Could not read player data — YouTube showed a consent or bot-check page',
      );
    }

    // 4. Playability gate (private / age-gated / removed videos).
    const playability = (extracted.data.playabilityStatus as { status?: string } | undefined)
      ?.status;
    if (playability && playability !== 'OK') {
      return fail('video-unavailable', `Video is not playable (status: ${playability})`);
    }

    // 5. Caption tracks via the existing handler parser (no duplicated parsing).
    const handler = new YouTubeHandler();
    const tracks = handler.extractAvailableTracks(extracted.rawJson);
    if (tracks.length === 0) {
      return fail('no-captions', 'This video has no caption tracks');
    }

    // 6. Select the ASR track.
    const selection = selectAsrTrack(tracks);
    if (!selection.ok) {
      return selection.reason === 'no-tracks'
        ? fail('no-captions', 'This video has no caption tracks')
        : fail(
            'no-asr',
            'Only human-uploaded captions found — AI re-align is for auto-generated (ASR) captions',
          );
    }
    const track = selection.track;
    const trackUrl = track.url as string;
    if (!isYoutubeTimedtextUrl(trackUrl)) {
      return fail('fetch-blocked', 'Caption track URL is not on youtube.com — refused to fetch');
    }

    // 7. Fetch the ASR track as fmt=json3 (word-level) — same canonical form
    //    as the proactive playback path, so units + contentHash match.
    const json3Url = buildJson3TimedtextUrl(trackUrl);
    const captions = await fetchText(fetchFn, json3Url);
    if (!captions.ok) {
      return fail('fetch-blocked', `Could not fetch the ASR caption track: ${captions.error}`);
    }

    // 8. Build timed units exactly like the playback pipeline.
    const rawCues = handler.transformResponse(captions.body, 'application/json', json3Url);
    const units = prepareYoutubeAsrAiInput({ body: captions.body, cues: rawCues });
    if (units.length === 0) {
      return fail('no-captions', 'The ASR caption track returned no usable text');
    }

    // 9. Cache check first — a hit means zero LLM cost.
    const language = track.language || 'en';
    const contentHash = await hashAsrRealignContent(units);
    const key = buildAsrRealignCacheKey(videoId, language, contentHash);
    const cached = await getAsrRealignEntry(key);
    if (cached?.cues && cached.cues.length > 0) {
      void touchAsrRealignEntry(key);
      return { success: true, outcome: 'already-saved' };
    }

    // 10. Run the existing AI resegment pipeline under the shared single-flight
    //     map (same key shape as the playback path → cross-flow dedupe).
    const inflightKey = `${language}:${contentHash}`;
    return await getOrCreateAsrRealignInflight(inflightKey, async () => {
      const service = await deps.resolveService();
      if (!service.resegmentYoutubeAsr) {
        return fail('llm-failure', 'Provider does not support YouTube ASR resegment');
      }

      const aiResult = await service.resegmentYoutubeAsr(units, language, (current, total) => {
        broadcastProgress(videoId, current, total);
      });

      if (!aiResult.success || !aiResult.cues || aiResult.cues.length === 0) {
        const message = aiResult.error ?? 'AI re-align failed';
        return /pool is empty|no providers configured/i.test(message)
          ? fail('provider-not-configured', 'No translation provider is configured')
          : fail('llm-failure', message);
      }

      const cues = aiResult.cues;
      const videoDetails = extracted.data.videoDetails as
        | { title?: string }
        | undefined;
      const title = stripYoutubeTitleSuffix(videoDetails?.title ?? '');
      const timestamp = now();
      const entry: YoutubeAsrRealignCacheEntry = {
        key,
        videoId,
        language,
        mode: 'ai',
        title: title || undefined,
        thumbnailUrl: youtubeThumbnailUrl(videoId),
        youtubeUrl: youtubeWatchUrl(videoId),
        cueCount: cues.length,
        byteSize: 0,
        contentHash,
        createdAt: timestamp,
        lastUsedAt: timestamp,
        cues,
      };
      await saveAsrRealignEntry(entry);
      broadcastCacheUpdated();
      return { success: true, outcome: 'realigned' } satisfies RealignYoutubeUrlResult;
    });
  } catch (error) {
    // Fail-open at the message boundary: playback is never affected.
    return fail('llm-failure', error instanceof Error ? error.message : String(error));
  }
}
