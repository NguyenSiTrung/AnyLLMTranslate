/**
 * XHR Interceptor — Monkey-patches XMLHttpRequest to intercept subtitle responses.
 *
 * Runs in MAIN world (page context) where XMLHttpRequest is accessible.
 * Matches subtitle URLs against platform-specific patterns and holds responses
 * for translation via the postMessage bridge.
 */

import type { InterceptorRegistry, UrlMatch } from '@/inject/interceptorRegistry';
import type { MessageBridgeSender } from '@/inject/messageBridge';
import type { SubtitleInterceptedPayload } from '@/types/subtitle';

const OriginalXHR = window.XMLHttpRequest;

export class XhrInterceptor {
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

    // Patch XMLHttpRequest.prototype.open
    const originalOpen = OriginalXHR.prototype.open;
    OriginalXHR.prototype.open = function (method: string, url: string | URL, ...args: unknown[]) {
      const urlString = typeof url === 'string' ? url : url.toString();

      // Check if this URL matches any subtitle patterns
      const match = registry.matchUrl(urlString);

      if (match) {
        // Store match info on the XHR instance
        (this as XMLHttpRequest & { __linguaLensMatch?: UrlMatch; __linguaLensUrl?: string }).__linguaLensMatch = match;
        (this as XMLHttpRequest & { __linguaLensUrl?: string }).__linguaLensUrl = urlString;
      }

      return originalOpen.apply(this, [method, url, ...args]);
    };

    // Patch XMLHttpRequest.prototype.send
    const originalSend = OriginalXHR.prototype.send;
    OriginalXHR.prototype.send = function (_body?: Document | XMLHttpRequestBodyInit | null) {
      const xhr = this as XMLHttpRequest & { __linguaLensMatch?: UrlMatch; __linguaLensUrl?: string };
      const match = xhr.__linguaLensMatch;

      if (!match) {
        return originalSend.apply(this, [_body]);
      }

      // This is a subtitle request — intercept the response
      const originalOnReadyStateChange = this.onreadystatechange;
      const originalOnLoad = this.onload;

      const handleResponse = () => {
        if (this.readyState !== 4 || this.status !== 200) return;

        const responseText = this.responseText;
        const requestId = bridge.send('SUBTITLE_INTERCEPTED', {
          url: xhr.__linguaLensUrl || '',
          contentType: this.getResponseHeader('Content-Type') || '',
          body: responseText,
          platform: match.platform,
          originalLanguage: match.language || '',
        } as SubtitleInterceptedPayload);

        // Override the response with a translated version when it arrives
        const translatedHandler = (event: MessageEvent) => {
          if (event.data?.channel !== 'lingua-lens') return;
          if (event.data?.type !== 'SUBTITLE_TRANSLATED') return;
          if (event.data?.requestId !== requestId) return;

          // Replace the response text with translated VTT
          Object.defineProperty(this, 'responseText', {
            value: event.data.payload.vttContent,
            writable: false,
            configurable: true,
          });

          window.removeEventListener('message', translatedHandler);

          // Trigger original handlers with modified response
          if (originalOnLoad) originalOnLoad.call(this, event);
          if (originalOnReadyStateChange) originalOnReadyStateChange.call(this);
        };

        window.addEventListener('message', translatedHandler);
      };

      this.onreadystatechange = function (...args: unknown[]) {
        handleResponse();
        if (originalOnReadyStateChange) {
          originalOnReadyStateChange.apply(this, args);
        }
      };

      return originalSend.apply(this, [_body]);
    };
  }

  disable(): void {
    if (!this.enabled) return;
    window.XMLHttpRequest = OriginalXHR;
    this.enabled = false;
  }
}
