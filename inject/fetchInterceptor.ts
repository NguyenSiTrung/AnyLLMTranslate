/**
 * Fetch Interceptor — Monkey-patches window.fetch to intercept subtitle responses.
 *
 * Runs in MAIN world where fetch is accessible.
 * Clones responses for non-subtitle requests to avoid consuming the body.
 */

import type { InterceptorRegistry } from '@/inject/interceptorRegistry';
import type { MessageBridgeSender } from '@/inject/messageBridge';
import type { SubtitleInterceptedPayload } from '@/types/subtitle';

const originalFetch = window.fetch.bind(window);

export class FetchInterceptor {
  private enabled = false;

  constructor(
    private registry: InterceptorRegistry,
    private bridge: MessageBridgeSender,
  ) {}

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;

    const registry = this.registry;
    const bridge = this.bridge;

    window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
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

      // Check for subtitle content match (blocking interception)
      const match = registry.matchUrl(urlString);

      if (!match) {
        return originalFetch(input, init);
      }

      // This is a subtitle request
      const response = await originalFetch(input, init);
      if (!response.ok) return response;
      const responseClone = response.clone();
      const responseText = await responseClone.text();

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
        const timeout = setTimeout(() => {
          window.removeEventListener('message', translatedHandler);
          // Translation timed out — return original response
          resolve(response);
        }, 30000);

        const translatedHandler = (event: MessageEvent) => {
          if (event.data?.channel !== 'anyllm-translate') return;
          if (event.data?.type !== 'SUBTITLE_TRANSLATED') return;
          if (event.data?.requestId !== requestId) return;

          clearTimeout(timeout);
          window.removeEventListener('message', translatedHandler);

          // Create a new Response with the translated content
          const translatedResponse = new Response(event.data.payload.vttContent, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
          resolve(translatedResponse);
        };

        window.addEventListener('message', translatedHandler);
      });
    };
  }

  disable(): void {
    if (!this.enabled) return;
    window.fetch = originalFetch;
    this.enabled = false;
  }
}
