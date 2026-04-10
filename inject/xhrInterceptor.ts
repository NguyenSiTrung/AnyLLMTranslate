/**
 * XHR Interceptor — Monkey-patches XMLHttpRequest to intercept subtitle responses.
 *
 * Runs in MAIN world (page context) where XMLHttpRequest is accessible.
 * Matches subtitle URLs against platform-specific patterns and holds responses
 * for translation via the postMessage bridge.
 *
 * Block-and-Wait: readyState 4 delivery is blocked until translation completes
 * or a 5s timeout expires. Both onreadystatechange/onload properties and
 * addEventListener-registered handlers are captured and replayed.
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

    // Patch XMLHttpRequest.prototype.addEventListener to capture load/readystatechange handlers
    const originalAddEventListener = OriginalXHR.prototype.addEventListener;
    OriginalXHR.prototype.addEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) {
      const xhr = this as XMLHttpRequest & {
        __linguaLensMatch?: UrlMatch;
        __linguaLensEventHandlers?: Map<string, EventListenerOrEventListenerObject[]>;
      };

      if (xhr.__linguaLensMatch && (type === 'load' || type === 'readystatechange')) {
        if (!xhr.__linguaLensEventHandlers) {
          xhr.__linguaLensEventHandlers = new Map();
        }
        const handlers = xhr.__linguaLensEventHandlers.get(type) || [];
        handlers.push(listener);
        xhr.__linguaLensEventHandlers.set(type, handlers);
        // Don't register with the real addEventListener — we'll call them manually
        return;
      }

      return originalAddEventListener.call(this, type, listener, options);
    };

    // Patch XMLHttpRequest.prototype.send
    const originalSend = OriginalXHR.prototype.send;
    OriginalXHR.prototype.send = function (_body?: Document | XMLHttpRequestBodyInit | null) {
      const xhr = this as XMLHttpRequest & {
        __linguaLensMatch?: UrlMatch;
        __linguaLensUrl?: string;
        __linguaLensEventHandlers?: Map<string, EventListenerOrEventListenerObject[]>;
      };
      const match = xhr.__linguaLensMatch;

      if (!match) {
        return originalSend.apply(this, [_body]);
      }

      // This is a subtitle request — intercept the response
      const originalOnReadyStateChange = this.onreadystatechange;
      const originalOnLoad = this.onload;

      // Suppress original property handlers — we'll replay them after translation
      this.onreadystatechange = null;
      this.onload = null;

      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const xhrRef = this;

      const handleResponse = () => {
        if (xhrRef.readyState !== 4 || xhrRef.status !== 200) return;

        const responseText = xhrRef.responseText;
        const requestId = bridge.send('SUBTITLE_INTERCEPTED', {
          url: xhr.__linguaLensUrl || '',
          contentType: xhrRef.getResponseHeader('Content-Type') || '',
          body: responseText,
          platform: match.platform,
          originalLanguage: match.language || '',
        } as SubtitleInterceptedPayload);

        /** Replay all captured handlers with the (possibly translated) response */
        const replayHandlers = () => {
          // Fire onreadystatechange property handler
          if (originalOnReadyStateChange) originalOnReadyStateChange.call(xhrRef, new Event('readystatechange'));
          // Fire onload property handler
          if (originalOnLoad) originalOnLoad.call(xhrRef, new ProgressEvent('load'));

          // Fire addEventListener-registered handlers
          const eventHandlers = xhr.__linguaLensEventHandlers;
          if (eventHandlers) {
            const rscHandlers = eventHandlers.get('readystatechange') || [];
            for (const h of rscHandlers) {
              if (typeof h === 'function') h.call(xhrRef, new Event('readystatechange'));
              else if (typeof h === 'object' && 'handleEvent' in h) h.handleEvent(new Event('readystatechange'));
            }
            const loadHandlers = eventHandlers.get('load') || [];
            for (const h of loadHandlers) {
              if (typeof h === 'function') h.call(xhrRef, new ProgressEvent('load'));
              else if (typeof h === 'object' && 'handleEvent' in h) h.handleEvent(new ProgressEvent('load'));
            }
          }
        };

        // Listen for translation result
        const translatedHandler = (event: MessageEvent) => {
          if (event.data?.channel !== 'lingua-lens') return;
          if (event.data?.type !== 'SUBTITLE_TRANSLATED') return;
          if (event.data?.requestId !== requestId) return;

          clearTimeout(timeoutId);
          window.removeEventListener('message', translatedHandler);

          // Replace the response text with translated VTT
          Object.defineProperty(xhrRef, 'responseText', {
            value: event.data.payload.vttContent,
            writable: false,
            configurable: true,
          });

          replayHandlers();
        };

        // Self-cleaning timeout — remove listener and replay with original content
        const timeoutId = setTimeout(() => {
          window.removeEventListener('message', translatedHandler);
          replayHandlers();
        }, 5000);

        window.addEventListener('message', translatedHandler);
      };

      // Use the real addEventListener to watch readyState changes internally
      originalAddEventListener.call(this, 'readystatechange', handleResponse);

      return originalSend.apply(this, [_body]);
    };
  }

  disable(): void {
    if (!this.enabled) return;
    window.XMLHttpRequest = OriginalXHR;
    this.enabled = false;
  }
}
