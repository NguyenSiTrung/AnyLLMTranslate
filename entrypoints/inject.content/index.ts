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
import { registerSubtitleHandlers, getAllPatterns } from '@/inject/subtitleHandlers/registry';
import { YouTubeHandler } from '@/inject/subtitleHandlers/youtube';
import { UdemyHandler } from '@/inject/subtitleHandlers/udemy';
import { CourseraHandler } from '@/inject/subtitleHandlers/coursera';

export default defineContentScript({
  matches: ['<all_urls>'],
  world: 'MAIN',
  runAt: 'document_start',
  async main() {
    console.log('[LinguaLens] MAIN world script injected');

    // Register platform handlers
    registerSubtitleHandlers([
      new YouTubeHandler(),
      new UdemyHandler(),
      new CourseraHandler(),
    ]);

    const registry = new InterceptorRegistry();
    const bridge = createBridgeSender();

    // Register all platform URL patterns
    registry.registerPatterns(getAllPatterns());

    const xhrInterceptor = new XhrInterceptor(registry, bridge);
    const fetchInterceptor = new FetchInterceptor(registry, bridge);

    xhrInterceptor.enable();
    fetchInterceptor.enable();

    console.log('[LinguaLens] XHR/Fetch interceptors enabled');
  },
});
