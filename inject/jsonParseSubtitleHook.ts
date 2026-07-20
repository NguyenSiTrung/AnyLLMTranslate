/**
 * MAIN-world JSON.parse hook for streaming platforms that embed subtitle
 * track lists in API JSON (Netflix, Disney+) rather than exposing stable
 * metadata XHR URLs. Pattern follows Immersive Translate video-subtitle inject.
 */

import type { MessageBridgeSender } from '@/inject/messageBridge';
import type { SubtitleHandler } from '@/inject/subtitleHandlers/registry';
import type { SubtitleTracksDiscoveredPayload } from '@/types/subtitle';

let installed = false;
let originalParse: typeof JSON.parse | null = null;

function tryExtractTracks(
  value: unknown,
  handlers: SubtitleHandler[],
): { platform: string; body: string } | null {
  for (const handler of handlers) {
    if (!handler.extractTracksFromParsedJson) continue;
    const tracks = handler.extractTracksFromParsedJson(value);
    if (tracks.length === 0) continue;
    return {
      platform: handler.platform,
      body: JSON.stringify({ tracks }),
    };
  }
  return null;
}

/**
 * Install a chained JSON.parse wrapper that notifies the content script when
 * a registered handler recognizes caption metadata in parsed JSON.
 */
export function installJsonParseSubtitleHook(
  handlers: SubtitleHandler[],
  bridge: MessageBridgeSender,
): () => void {
  const active = handlers.filter((h) => h.extractTracksFromParsedJson);
  if (active.length === 0) {
    return () => {};
  }

  if (!installed) {
    originalParse = JSON.parse;
    installed = true;
  }

  const baseParse = originalParse;
  if (!baseParse) {
    return () => {};
  }

  JSON.parse = function jsonParseWithSubtitleDiscovery(
    text: string,
    reviver?: (this: unknown, key: string, value: unknown) => unknown,
  ): unknown {
    const result = baseParse.call(this, text, reviver as never);
    try {
      const hit = tryExtractTracks(result, active);
      if (hit) {
        const parsed = JSON.parse(hit.body) as { tracks: SubtitleTracksDiscoveredPayload['tracks'] };
        bridge.send('SUBTITLE_TRACKS_DISCOVERED', {
          tracks: parsed.tracks,
          platform: hit.platform,
        } satisfies SubtitleTracksDiscoveredPayload);
      }
    } catch {
      // Never break page JSON parsing
    }
    return result;
  };

  return () => {
    if (originalParse) {
      JSON.parse = originalParse;
    }
    installed = false;
  };
}
