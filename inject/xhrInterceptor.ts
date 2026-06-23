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
  /** Configurable translation timeout in ms (default 30s). */
  private translationTimeoutMs = 30000;
  /** Original prototype methods captured at enable time, restored on disable. */
  private originalOpen: typeof OriginalXHR.prototype.open | null = null;
  private originalAddEventListenerRef: typeof OriginalXHR.prototype.addEventListener | null = null;
  private originalSendRef: typeof OriginalXHR.prototype.send | null = null;
  /** The patched methods we installed (for identity check on disable). */
  private patchedOpen: ((this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) => void) | null = null;
  private patchedAddEventListener: ((this: XMLHttpRequest, type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => void) | null = null;
  private patchedSend: ((this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) => void) | null = null;

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

    // Patch XMLHttpRequest.prototype.open
    const originalOpen = OriginalXHR.prototype.open;
    this.originalOpen = originalOpen;
    OriginalXHR.prototype.open = function (method: string, url: string | URL, ...args: unknown[]) {
      const urlString = typeof url === 'string' ? url : url.toString();

      // Check if this URL matches any subtitle patterns
      const match = registry.matchUrl(urlString);

      if (match) {
        // Store match info on the XHR instance
        (this as XMLHttpRequest & { __anyllmTranslateMatch?: UrlMatch; __anyllmTranslateUrl?: string }).__anyllmTranslateMatch = match;
        (this as XMLHttpRequest & { __anyllmTranslateUrl?: string }).__anyllmTranslateUrl = urlString;
      }

      // Check for metadata match (read-only, non-blocking)
      const metadataMatch = registry.matchMetadataUrl(urlString);
      if (metadataMatch) {
        (this as XMLHttpRequest & { __anyllmMetadataMatch?: UrlMatch; __anyllmTranslateUrl?: string }).__anyllmMetadataMatch = metadataMatch;
        (this as XMLHttpRequest & { __anyllmTranslateUrl?: string }).__anyllmTranslateUrl = urlString;
      }

      return (originalOpen as (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) => void).apply(this, [method, url, ...args]);
    };
    this.patchedOpen = OriginalXHR.prototype.open as XhrInterceptor['patchedOpen'];

    // Patch XMLHttpRequest.prototype.addEventListener to capture load/readystatechange handlers
    const originalAddEventListener = OriginalXHR.prototype.addEventListener;
    this.originalAddEventListenerRef = originalAddEventListener;
    OriginalXHR.prototype.addEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) {
      const xhr = this as XMLHttpRequest & {
        __anyllmTranslateMatch?: UrlMatch;
        __anyllmTranslateEventHandlers?: Map<string, EventListenerOrEventListenerObject[]>;
      };

      if (xhr.__anyllmTranslateMatch && (type === 'load' || type === 'readystatechange')) {
        if (!xhr.__anyllmTranslateEventHandlers) {
          xhr.__anyllmTranslateEventHandlers = new Map();
        }
        const handlers = xhr.__anyllmTranslateEventHandlers.get(type) || [];
        handlers.push(listener);
        xhr.__anyllmTranslateEventHandlers.set(type, handlers);
        // Don't register with the real addEventListener — we'll call them manually
        return;
      }

      return originalAddEventListener.call(this, type, listener, options);
    };
    this.patchedAddEventListener = OriginalXHR.prototype.addEventListener as XhrInterceptor['patchedAddEventListener'];

    // Patch XMLHttpRequest.prototype.send
    const originalSend = OriginalXHR.prototype.send;
    this.originalSendRef = originalSend;
    OriginalXHR.prototype.send = function (_body?: Document | XMLHttpRequestBodyInit | null) {
      const xhr = this as XMLHttpRequest & {
        __anyllmTranslateMatch?: UrlMatch;
        __anyllmMetadataMatch?: UrlMatch;
        __anyllmTranslateUrl?: string;
        __anyllmTranslateEventHandlers?: Map<string, EventListenerOrEventListenerObject[]>;
      };

      // Handle metadata match: non-blocking, read-only pass-through
      const metadataMatch = xhr.__anyllmMetadataMatch;
      if (metadataMatch && !xhr.__anyllmTranslateMatch) {
        // Attach a non-blocking listener to capture the response body
        const metadataListener = () => {
          if (this.readyState !== 4 || this.status !== 200) return;
          try {
            bridge.send('SUBTITLE_TRACKS_DISCOVERED', {
              url: xhr.__anyllmTranslateUrl || '',
              body: this.responseText,
              contentType: this.getResponseHeader('Content-Type') || '',
              platform: metadataMatch.platform,
            });
            console.log('AnyLLMTranslate: XHR interceptor discovered metadata', {
              url: xhr.__anyllmTranslateUrl,
              platform: metadataMatch.platform,
            });
          } catch { /* silently ignore parse errors */ }
        };
        originalAddEventListener.call(this, 'readystatechange', metadataListener);
        return originalSend.apply(this, [_body]);
      }

      const match = xhr.__anyllmTranslateMatch;

      if (!match) {
        return originalSend.apply(this, [_body]);
      }

      // This is a subtitle request — intercept the response
      const originalOnReadyStateChange = this.onreadystatechange;
      const originalOnLoad = this.onload;

      // P2: do NOT suppress onreadystatechange entirely — players rely on
      // intermediate readyState transitions (1 OPENED, 2 HEADERS_RECEIVED,
      // 3 LOADING) to show loading spinners / progress. Only the final
      // readyState 4 (DONE) must be held back until translation completes.
      // Wrap the handler so non-4 states pass through immediately; 4 is
      // captured for replay after translation.
      this.onreadystatechange = function (ev: Event) {
        if (xhrRef.readyState !== 4) {
          if (originalOnReadyStateChange) {
            originalOnReadyStateChange.call(xhrRef, ev);
          }
        }
        // readyState 4 is replayed by replayHandlers() after translation.
      };
      // onload fires only at readyState 4, so it must be held back too.
      this.onload = null;

      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const xhrRef = this;

      const handleResponse = () => {
        if (xhrRef.readyState !== 4 || xhrRef.status !== 200) return;

        const responseText = xhrRef.responseText;
        const requestId = bridge.send('SUBTITLE_INTERCEPTED', {
          url: xhr.__anyllmTranslateUrl || '',
          contentType: xhrRef.getResponseHeader('Content-Type') || '',
          body: responseText,
          platform: match.platform,
          originalLanguage: match.language || '',
        } as SubtitleInterceptedPayload);

        console.log('AnyLLMTranslate: XHR interceptor intercepted subtitle', {
          url: xhr.__anyllmTranslateUrl,
          platform: match.platform,
          extractedLanguage: match.language,
        });

        /** Replay all captured handlers with the (possibly translated) response */
        const replayHandlers = () => {
          // Fire onreadystatechange property handler
          if (originalOnReadyStateChange) originalOnReadyStateChange.call(xhrRef, new Event('readystatechange'));
          // Fire onload property handler
          if (originalOnLoad) originalOnLoad.call(xhrRef, new ProgressEvent('load'));

          // Fire addEventListener-registered handlers
          const eventHandlers = xhr.__anyllmTranslateEventHandlers;
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
        const expectedOrigin = window.location.origin;

        /** Clean up listener, timeout, and abort handler. */
        let cleanedUp = false;
        const cleanup = () => {
          if (cleanedUp) return;
          cleanedUp = true;
          clearTimeout(timeoutId);
          window.removeEventListener('message', translatedHandler);
          xhrRef.removeEventListener('abort', abortHandler);
        };

        const translatedHandler = (event: MessageEvent) => {
          if (event.origin !== expectedOrigin) return;
          if (event.data?.channel !== 'anyllm-translate') return;
          if (event.data?.type !== 'SUBTITLE_TRANSLATED') return;
          if (event.data?.requestId !== requestId) return;

          cleanup();

          const translatedVtt = event.data.payload.vttContent;

          // Replace responseText with translated VTT
          Object.defineProperty(xhrRef, 'responseText', {
            value: translatedVtt,
            writable: false,
            configurable: true,
          });

          // Also override response property (handles responseType variants)
          const responseType = xhrRef.responseType;
          if (responseType === 'arraybuffer') {
            const encoder = new TextEncoder();
            Object.defineProperty(xhrRef, 'response', {
              value: encoder.encode(translatedVtt).buffer,
              writable: false,
              configurable: true,
            });
          } else {
            // text, json, or empty — response is the VTT string
            Object.defineProperty(xhrRef, 'response', {
              value: translatedVtt,
              writable: false,
              configurable: true,
            });
          }

          replayHandlers();
        };

        // Abort handler — clean up dangling listener when player switches tracks
        const abortHandler = () => {
          cleanup();
          replayHandlers();
        };

        // Self-cleaning timeout — remove listener and replay with original content
        const timeoutId = setTimeout(() => {
          cleanup();
          replayHandlers();
        }, self.translationTimeoutMs);

        xhrRef.addEventListener('abort', abortHandler);
        window.addEventListener('message', translatedHandler);
      };

      // Use the real addEventListener to watch readyState changes internally
      originalAddEventListener.call(this, 'readystatechange', handleResponse);

      return originalSend.apply(this, [_body]);
    };
    this.patchedSend = OriginalXHR.prototype.send as XhrInterceptor['patchedSend'];
  }

  disable(): void {
    if (!this.enabled) return;
    // P2: only restore a prototype method if it still identity-equals the one
    // we installed. A third party may have wrapped our patch after enable();
    // blindly overwriting would clobber their wrapper. Mirrors the
    // FetchInterceptor.disable() identity-check pattern.
    if (this.originalOpen && OriginalXHR.prototype.open === this.patchedOpen) {
      OriginalXHR.prototype.open = this.originalOpen;
    }
    if (
      this.originalAddEventListenerRef &&
      OriginalXHR.prototype.addEventListener === this.patchedAddEventListener
    ) {
      OriginalXHR.prototype.addEventListener = this.originalAddEventListenerRef;
    }
    if (this.originalSendRef && OriginalXHR.prototype.send === this.patchedSend) {
      OriginalXHR.prototype.send = this.originalSendRef;
    }
    this.originalOpen = null;
    this.originalAddEventListenerRef = null;
    this.originalSendRef = null;
    this.patchedOpen = null;
    this.patchedAddEventListener = null;
    this.patchedSend = null;
    window.XMLHttpRequest = OriginalXHR;
    this.enabled = false;
  }
}
