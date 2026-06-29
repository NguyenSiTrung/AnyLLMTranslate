/**
 * Fetch Interceptor — Monkey-patches window.fetch to intercept subtitle responses.
 *
 * Runs in MAIN world where fetch is accessible.
 * Clones responses for non-subtitle requests to avoid consuming the body.
 */

import type { InterceptorRegistry } from '@/inject/interceptorRegistry';
import type { MessageBridgeSender } from '@/inject/messageBridge';
import type { SubtitleInterceptedPayload } from '@/types/subtitle';
import { detectManifestTracks } from '@/lib/manifestParser';
import { detectMpdRequests } from '@/lib/maxMpdSubtitles';
import { processMaxMpdManifest } from '@/inject/maxMpdProcessor';

const originalFetch = window.fetch.bind(window);

export class FetchInterceptor {
  private enabled = false;
  /** Configurable translation timeout in ms (default 30s). */
  private translationTimeoutMs = 30000;
  /** Reference to the patched fetch so disable() only restores our own patch. */
  private patchedFetch: typeof window.fetch | null = null;
  /**
   * P2: pending translation listeners registered by in-flight intercepted
   * requests. Drained in disable() so a BFCache restore / teardown doesn't
   * leave dangling listeners that resolve with stale content.
   */
  private pendingHandlers: Set<(event: MessageEvent) => void> = new Set();
  /** Pending timeout ids for in-flight translations (cleared on disable). */
  private pendingTimeouts: Set<ReturnType<typeof setTimeout>> = new Set();

  constructor(
    private registry: InterceptorRegistry,
    private bridge: MessageBridgeSender,
  ) {}

  /** Set the translation timeout (called when coordinator sends SUBTITLE_CONFIG). */
  setTimeout(ms: number): void {
    this.translationTimeoutMs = ms;
  }

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;

    const registry = this.registry;
    const bridge = this.bridge;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    const patchedFetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const urlString = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      // Check for metadata match first (non-blocking, read-only)
      const metadataMatch = registry.matchMetadataUrl(urlString);
      if (metadataMatch) {
        const response = await originalFetch(input, init);
        if (response.ok) {
          const responseClone = response.clone();
          responseClone.text().then((body) => {
            bridge.send('SUBTITLE_TRACKS_DISCOVERED', {
              url: urlString,
              body,
              contentType: response.headers.get('Content-Type') || '',
              platform: metadataMatch.platform,
            });
            console.log('AnyLLMTranslate: Fetch interceptor discovered metadata', {
              url: urlString,
              platform: metadataMatch.platform,
            });
          }).catch(() => { /* silently ignore clone read errors */ });
        }
        return response; // Always pass through immediately
      }

      // Check for manifest match (non-blocking, Tier 2)
      const manifestMatch = registry.matchManifestUrl(urlString);
      const isManifest = manifestMatch || registry.isManifestUrl(urlString);
      if (isManifest) {
        const platform = manifestMatch?.platform || 'generic';
        const response = await originalFetch(input, init);
        if (response.ok) {
          const responseClone = response.clone();
          const contentType = response.headers.get('Content-Type') || '';
          responseClone.text().then((body) => {
            // Parse manifest and emit discovered subtitle tracks
            const tracks = detectManifestTracks(body, urlString, contentType, platform);
            if (tracks.length > 0) {
              bridge.send('SUBTITLE_TRACKS_DISCOVERED', {
                tracks,
                platform,
              });
              console.log('AnyLLMTranslate: Fetch interceptor discovered manifest subtitle tracks', {
                url: urlString,
                platform,
                count: tracks.length,
              });
            }

            // Max: fetch and parse TTML subtitle tracks from DASH manifests
            if (platform === 'hbomax' && detectMpdRequests(urlString)) {
              processMaxMpdManifest(body, urlString, bridge).catch(() => { /* non-blocking */ });
            }
          }).catch(() => { /* silently ignore clone read errors */ });
        }
        return response; // Always pass through immediately — never block playback
      }

      // Check for subtitle content match (blocking interception)
      const match = registry.matchUrl(urlString);

      if (!match) {
        return originalFetch(input, init);
      }

      // This is a subtitle request
      const response = await originalFetch(input, init);
      if (!response.ok) return response;
      const responseClone = response.clone();
      // P3: responseClone.text() can throw if the body was already consumed or
      // the stream is locked/errored (e.g. opaque responses, double-read on
      // some platforms). Fall back to the original response so the page keeps
      // working even if we can't intercept this request.
      let responseText: string;
      try {
        responseText = await responseClone.text();
      } catch (err) {
        console.warn('AnyLLMTranslate: Failed to read cloned subtitle response; passing through original', {
          url: urlString,
          error: err instanceof Error ? err.message : String(err),
        });
        return response;
      }

      const requestId = bridge.send('SUBTITLE_INTERCEPTED', {
        url: urlString,
        contentType: response.headers.get('Content-Type') || '',
        body: responseText,
        platform: match.platform,
        originalLanguage: match.language || '',
      } as SubtitleInterceptedPayload);

      console.log('AnyLLMTranslate: Fetch interceptor intercepted subtitle', {
        url: urlString,
        platform: match.platform,
        extractedLanguage: match.language,
      });

      // Wait for translated response and return it
      return new Promise((resolve) => {
        const expectedOrigin = window.location.origin;

        const timeout = setTimeout(() => {
          window.removeEventListener('message', translatedHandler);
          self.pendingHandlers.delete(translatedHandler);
          self.pendingTimeouts.delete(timeout);
          // Translation timed out — return original response
          resolve(response);
        }, self.translationTimeoutMs);
        self.pendingTimeouts.add(timeout);

        const translatedHandler = (event: MessageEvent) => {
          if (event.origin !== expectedOrigin) return;
          if (event.data?.channel !== 'anyllm-translate') return;
          if (event.data?.type !== 'SUBTITLE_TRANSLATED') return;
          if (event.data?.requestId !== requestId) return;

          clearTimeout(timeout);
          self.pendingTimeouts.delete(timeout);
          window.removeEventListener('message', translatedHandler);
          self.pendingHandlers.delete(translatedHandler);

          // Create a new Response with the translated content
          const translatedResponse = new Response(event.data.payload.vttContent, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
          resolve(translatedResponse);
        };

        self.pendingHandlers.add(translatedHandler);
        window.addEventListener('message', translatedHandler);
      });
    };

    this.patchedFetch = patchedFetch;
    window.fetch = patchedFetch;
  }

  disable(): void {
    if (!this.enabled) return;
    // Only restore if our patch is still the active fetch — avoids clobbering
    // a different patch installed on top of ours.
    if (this.patchedFetch && window.fetch === this.patchedFetch) {
      window.fetch = originalFetch;
    }
    // P2: drain pending translation listeners + timeouts so disable() (e.g. on
    // BFCache pagehide) doesn't leak handlers that resolve with stale content
    // or fire after the interceptor is gone.
    for (const handler of this.pendingHandlers) {
      window.removeEventListener('message', handler);
    }
    this.pendingHandlers.clear();
    for (const t of this.pendingTimeouts) {
      clearTimeout(t);
    }
    this.pendingTimeouts.clear();
    this.patchedFetch = null;
    this.enabled = false;
  }
}


