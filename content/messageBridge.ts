/**
 * Content script side of the message bridge.
 * Listens for messages from the MAIN world inject script.
 *
 * This module provides the ISOLATED world interface for receiving
 * intercepted subtitle data and sending translated results back.
 */

import { onMessage, sendMessage } from '@/inject/messageBridge';
import type {
  SubtitleInterceptedPayload,
  SubtitleTranslatedPayload,
  SubtitleTracksDiscoveredPayload,
  SubtitleDomCuesPayload,
  SubtitleDomTrackChangedPayload,
  SubtitleTextTrackCuesPayload,
  SubtitleMseCuesPayload,
  SubtitleManifestCuesPayload,
} from '@/types/subtitle';

/**
 * Listen for subtitle interception events from the MAIN world.
 * Returns a cleanup function.
 */
export function onSubtitleIntercepted(
  handler: (payload: SubtitleInterceptedPayload, requestId: string) => Promise<void>,
): () => void {
  return onMessage('SUBTITLE_INTERCEPTED', async (payload, requestId) => {
    try {
      await handler(payload as SubtitleInterceptedPayload, requestId);
    } catch (error) {
      sendMessage('SUBTITLE_ERROR', {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'INTERCEPTION_FAILED',
      });
    }
  });
}

/**
 * Listen for subtitle track discovery events from the MAIN world.
 * Returns a cleanup function.
 */
export function onTracksDiscovered(
  handler: (payload: SubtitleTracksDiscoveredPayload) => Promise<void>,
): () => void {
  return onMessage('SUBTITLE_TRACKS_DISCOVERED', async (payload) => {
    try {
      await handler(payload as SubtitleTracksDiscoveredPayload);
    } catch (error) {
      console.warn('AnyLLMTranslate: Track discovery handler error', error);
    }
  });
}

/**
 * Listen for DOM-scraped cue events from the MAIN world.
 * Returns a cleanup function.
 */
export function onDomCues(
  handler: (payload: SubtitleDomCuesPayload) => Promise<void>,
): () => void {
  return onMessage('SUBTITLE_DOM_CUES', async (payload) => {
    try {
      await handler(payload as SubtitleDomCuesPayload);
    } catch (error) {
      console.warn('AnyLLMTranslate: DOM cues handler error', error);
    }
  });
}

/**
 * Listen for DOM subtitle track changes from the MAIN world.
 * Returns a cleanup function.
 */
export function onDomTrackChanged(
  handler: (payload: SubtitleDomTrackChangedPayload) => Promise<void>,
): () => void {
  return onMessage('SUBTITLE_DOM_TRACK_CHANGED', async (payload) => {
    try {
      await handler(payload as SubtitleDomTrackChangedPayload);
    } catch (error) {
      console.warn('AnyLLMTranslate: DOM track changed handler error', error);
    }
  });
}

/**
 * Listen for full TextTrack cues from the MAIN world (Tier 4).
 * Returns a cleanup function.
 */
export function onTextTrackCues(
  handler: (payload: SubtitleTextTrackCuesPayload) => Promise<void>,
): () => void {
  return onMessage('SUBTITLE_TEXTTRACK_CUES', async (payload) => {
    try {
      await handler(payload as SubtitleTextTrackCuesPayload);
    } catch (error) {
      console.warn('AnyLLMTranslate: TextTrack cues handler error', error);
    }
  });
}

/**
 * Listen for manifest-parsed full-track cues from the MAIN world (Tier 2).
 * Returns a cleanup function.
 */
export function onManifestCues(
  handler: (payload: SubtitleManifestCuesPayload) => Promise<void>,
): () => void {
  return onMessage('SUBTITLE_MANIFEST_CUES', async (payload) => {
    try {
      await handler(payload as SubtitleManifestCuesPayload);
    } catch (error) {
      console.warn('AnyLLMTranslate: Manifest cues handler error', error);
    }
  });
}

/**
 * Listen for MSE SourceBuffer cues from the MAIN world (Tier 3).
 * Returns a cleanup function.
 */
export function onMseCues(
  handler: (payload: SubtitleMseCuesPayload) => Promise<void>,
): () => void {
  return onMessage('SUBTITLE_MSE_CUES', async (payload) => {
    try {
      await handler(payload as SubtitleMseCuesPayload);
    } catch (error) {
      console.warn('AnyLLMTranslate: MSE cues handler error', error);
    }
  });
}

/**
 * Send translated subtitle content back to the MAIN world.
 * IMPORTANT: The envelope requestId MUST match the original SUBTITLE_INTERCEPTED requestId
 * so that XHR/fetch interceptors can correlate and unblock the response.
 */
export function sendTranslatedSubtitle(payload: SubtitleTranslatedPayload): void {
  sendMessage('SUBTITLE_TRANSLATED', payload, payload.requestId);
}

/**
 * Start the content-side bridge listener.
 * Returns a cleanup function to stop listening.
 */
export function startContentBridge(
  handler: (payload: SubtitleInterceptedPayload, requestId: string) => Promise<void>,
): () => void {
  return onSubtitleIntercepted(handler);
}
