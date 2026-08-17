/**
 * DeepLearning.AI embedded-metadata discovery (MAIN world).
 *
 * Lesson pages SSR the lesson video data (course.getLessonVideo) into the
 * `#__NEXT_DATA__` script: subtitle track URLs plus videoId. Reads that
 * payload and emits SUBTITLE_TRACKS_DISCOVERED so the coordinator can fetch
 * the preferred VTT on playback. SPA lesson navigation is covered by the
 * handler's tRPC metadata interception instead (the embedded payload is
 * static after the initial SSR).
 */

import type { SubtitleTracksDiscoveredPayload } from '@/types/subtitle';
import type { MessageBridgeSender } from '@/inject/messageBridge';
import {
  DEEP_LEARNING_AI_PLATFORM,
  extractDeepLearningAiVideoData,
  readNextDataJson,
} from '@/inject/subtitleHandlers/deepLearningAi';

const DISCOVERY_RETRY_MS = 100;
const DISCOVERY_RETRY_LIMIT = 100; // ~10s — the SSR script is present immediately, retries guard hydration timing

export function startDeepLearningAiMetadataDiscovery(bridge: MessageBridgeSender): () => void {
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let attempts = 0;
  let emittedKey = '';

  const discover = () => {
    retryTimer = null;
    const data = readNextDataJson();
    const result = data ? extractDeepLearningAiVideoData(data) : null;

    if (result && result.tracks.length > 0) {
      const key = [
        result.videoId ?? '',
        ...result.tracks.map((t) => `${t.language}:${t.url ?? ''}`),
      ].join('|');
      if (key !== emittedKey) {
        emittedKey = key;
        bridge.send('SUBTITLE_TRACKS_DISCOVERED', {
          tracks: result.tracks,
          platform: DEEP_LEARNING_AI_PLATFORM,
          ...(result.videoId ? { videoId: result.videoId } : {}),
        } satisfies SubtitleTracksDiscoveredPayload);
        console.log('AnyLLMTranslate: DeepLearning.AI tracks from embedded __NEXT_DATA__', {
          videoId: result.videoId,
          count: result.tracks.length,
          languages: result.tracks.map((t) => t.language),
        });
      }
      return;
    }

    attempts += 1;
    if (attempts < DISCOVERY_RETRY_LIMIT) {
      retryTimer = setTimeout(discover, DISCOVERY_RETRY_MS);
    }
  };

  discover();

  return () => {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };
}
