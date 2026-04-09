/**
 * MAIN World Content Script — Injected into page context.
 * Has access to page globals (window.XMLHttpRequest, window.fetch, etc.)
 * but NO access to extension APIs (chrome.*).
 *
 * Loaded at document_start before any video player initializes.
 * Wires up XHR/Fetch interceptors with the postMessage bridge.
 */

import { InterceptorRegistry } from '@/inject/interceptorRegistry';
import { createBridgeSender } from '@/inject/messageBridge';
import { XhrInterceptor } from '@/inject/xhrInterceptor';
import { FetchInterceptor } from '@/inject/fetchInterceptor';

export default defineContentScript({
  matches: ['<all_urls>'],
  world: 'MAIN',
  runAt: 'document_start',
  async main() {
    console.log('[LinguaLens] MAIN world script injected');

    const registry = new InterceptorRegistry();
    const bridge = createBridgeSender();

    // Platform handlers will register their URL patterns in Phase 3
    // For now, interceptors are wired but with no patterns registered

    const xhrInterceptor = new XhrInterceptor(registry, bridge);
    const fetchInterceptor = new FetchInterceptor(registry, bridge);

    xhrInterceptor.enable();
    fetchInterceptor.enable();

    console.log('[LinguaLens] XHR/Fetch interceptors enabled');
  },
});
