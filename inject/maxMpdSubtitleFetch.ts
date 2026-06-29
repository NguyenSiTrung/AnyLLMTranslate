/**
 * Relay Max CDN subtitle segment fetches through the extension background (CORS bypass).
 * MAIN world cannot use chrome.*; ISOLATED coordinator handles FETCH_SUBTITLE.
 */

import { onMessage, sendMessage } from '@/inject/messageBridge';
import type { MessageBridgeSender } from '@/inject/messageBridge';

export interface SubtitleSegmentFetchResult {
  ok: boolean;
  status: number;
  text: string;
  contentType: string;
}

const FETCH_TIMEOUT_MS = 35000;
/** Abort MAIN-world page fetch early if it stalls (page may wrap fetch). */
const PAGE_FETCH_TIMEOUT_MS = 5000;

/**
 * Fetch a subtitle URL via postMessage to the ISOLATED coordinator.
 * Falls back to page fetch when the bridge does not respond (e.g. unit tests).
 */
export function createBridgeSubtitleFetcher(
  bridge: MessageBridgeSender,
): (url: string) => Promise<SubtitleSegmentFetchResult> {
  return async (url: string) => {
    const pageResult = await fallbackPageFetch(url);
    if (pageResult && pageResult.ok) return pageResult;
    return relaySubtitleFetch(bridge, url);
  };
}

function relaySubtitleFetch(
  bridge: MessageBridgeSender,
  url: string,
): Promise<SubtitleSegmentFetchResult> {
  return new Promise((resolve) => {
    const requestId = bridge.send('SUBTITLE_FETCH_REQUEST', { url });
    let settled = false;

    const finish = (result: SubtitleSegmentFetchResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const onResponse = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.channel !== 'anyllm-translate') return;
      if (event.data?.type !== 'SUBTITLE_FETCH_RESPONSE') return;
      if (event.data?.requestId !== requestId) return;
      const payload = event.data.payload as {
        success?: boolean;
        content?: string;
        contentType?: string;
        error?: string;
      };
      if (payload?.success && payload.content !== undefined) {
        finish({
          ok: true,
          status: 200,
          text: payload.content,
          contentType: payload.contentType ?? '',
        });
      } else {
        finish({
          ok: false,
          status: 0,
          text: '',
          contentType: '',
        });
      }
    };

    const timer = setTimeout(() => {
      finish({ ok: false, status: 0, text: '', contentType: '' });
    }, FETCH_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('message', onResponse);
    };

    window.addEventListener('message', onResponse);
  });
}

async function fallbackPageFetch(url: string): Promise<SubtitleSegmentFetchResult | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PAGE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) return null;
    const text = await response.text();
    // Reject manifest responses — the relay / background fetch handles them
    if (text.includes('<MPD') || text.includes('urn:mpeg:dash:schema:mpd')) {
      return null;
    }
    return {
      ok: true,
      status: response.status,
      text,
      contentType: response.headers.get('Content-Type') ?? '',
    };
  } catch {
    clearTimeout(timer);
    return null;
  }
}

/** ISOLATED world: listen for MAIN-world subtitle fetch requests. */
export function startSubtitleFetchRelay(): () => void {
  return onMessage('SUBTITLE_FETCH_REQUEST', async (payload, requestId) => {
    const url = (payload as { url?: string })?.url;
    if (!url) {
      sendMessage('SUBTITLE_FETCH_RESPONSE', { success: false, error: 'missing url' }, requestId);
      return;
    }
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'FETCH_SUBTITLE',
        url,
      }) as { success?: boolean; content?: string; error?: string };
      if (response?.success && response.content !== undefined) {
        sendMessage(
          'SUBTITLE_FETCH_RESPONSE',
          { success: true, content: response.content, contentType: 'text/plain' },
          requestId,
        );
      } else {
        sendMessage(
          'SUBTITLE_FETCH_RESPONSE',
          { success: false, error: response?.error ?? 'fetch failed' },
          requestId,
        );
      }
    } catch (error) {
      sendMessage(
        'SUBTITLE_FETCH_RESPONSE',
        {
          success: false,
          error: error instanceof Error ? error.message : 'relay failed',
        },
        requestId,
      );
    }
  });
}
