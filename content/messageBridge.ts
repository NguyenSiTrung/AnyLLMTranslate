/**
 * Content script side of the message bridge.
 * Listens for messages from the MAIN world inject script.
 *
 * This module provides the ISOLATED world interface for receiving
 * intercepted subtitle data and sending translated results back.
 */

import { onMessage, sendMessage } from '@/inject/messageBridge';
import type { SubtitleInterceptedPayload, SubtitleTranslatedPayload } from '@/types/subtitle';

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
