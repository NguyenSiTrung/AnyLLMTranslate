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
import { registerSubtitleHandlers, getAllPatterns, getMetadataPatternsForCurrentHost } from '@/inject/subtitleHandlers/registry';
import { YouTubeHandler } from '@/inject/subtitleHandlers/youtube';
import { UdemyHandler } from '@/inject/subtitleHandlers/udemy';
import { CourseraHandler } from '@/inject/subtitleHandlers/coursera';
import { LinkedInHandler } from '@/inject/subtitleHandlers/linkedin';
import { startTextTrackDiscovery } from '@/inject/textTrackDiscovery';

export default defineContentScript({
  matches: ['<all_urls>'],
  world: 'MAIN',
  runAt: 'document_start',
  async main() {
    console.log('[AnyLLMTranslate] MAIN world script injected');

    // Register platform handlers
    registerSubtitleHandlers([
       new YouTubeHandler(),
       new UdemyHandler(),
       new CourseraHandler(),
       new LinkedInHandler(),
     ]);

    const registry = new InterceptorRegistry();
    const bridge = createBridgeSender();

    // Register all platform URL patterns (subtitle content interception)
    registry.registerPatterns(getAllPatterns());

    // Register metadata patterns (read-only, non-blocking track discovery)
    registry.registerMetadataPatterns(getMetadataPatternsForCurrentHost());

    const xhrInterceptor = new XhrInterceptor(registry, bridge);
    const fetchInterceptor = new FetchInterceptor(registry, bridge);

    xhrInterceptor.enable();
    fetchInterceptor.enable();

    // Handle BFCache lifecycle: disable interceptors when page goes into BFCache,
    // re-enable when it's restored. Non-persisted pagehide means the page is
    // truly unloading, so we also disable to restore prototypes.
    window.addEventListener('pagehide', (event: PageTransitionEvent) => {
      xhrInterceptor.disable();
      fetchInterceptor.disable();
      if (!event.persisted) {
        // True unload — no further action needed
        return;
      }
      // BFCache freeze — interceptors will be re-enabled on pageshow
    });

    window.addEventListener('pageshow', (event: PageTransitionEvent) => {
      if (event.persisted) {
        // Restored from BFCache — re-enable interceptors
        xhrInterceptor.enable();
        fetchInterceptor.enable();
        console.log('[AnyLLMTranslate] Interceptors re-enabled after BFCache restore');
      }
    });

    console.log('[AnyLLMTranslate] XHR/Fetch interceptors enabled');

    // Start HTML5 TextTrack discovery (universal fallback)
    // Wait for DOM to be ready before scanning for video elements
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        startTextTrackDiscovery(bridge);
      });
    } else {
      startTextTrackDiscovery(bridge);
    }

    console.log('[AnyLLMTranslate] TextTrack discovery started');
  },
});

