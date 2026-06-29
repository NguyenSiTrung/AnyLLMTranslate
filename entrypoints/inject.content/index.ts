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
import { MseInterceptor } from '@/inject/mseInterceptor';
import { registerSubtitleHandlers, getPatternsForCurrentHost, getMetadataPatternsForCurrentHost, getManifestPatternsForCurrentHost } from '@/inject/subtitleHandlers/registry';
import { YouTubeHandler } from '@/inject/subtitleHandlers/youtube';
import { UdemyHandler } from '@/inject/subtitleHandlers/udemy';
import { CourseraHandler } from '@/inject/subtitleHandlers/coursera';
import { LinkedInHandler } from '@/inject/subtitleHandlers/linkedin';
import { HboMaxHandler } from '@/inject/subtitleHandlers/hbomax';
import { YoukuHandler } from '@/inject/subtitleHandlers/youku';
import { startDomCueSource } from '@/inject/domCueSource';
import { detectCurrentHandler } from '@/inject/subtitleHandlers/registry';
import { startTextTrackDiscovery } from '@/inject/textTrackDiscovery';
import { onMessage } from '@/inject/messageBridge';
import { resetMaxMpdProcessorState, setMpdPreferredLanguage } from '@/inject/maxMpdProcessor';

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
       new HboMaxHandler(),
       new YoukuHandler(),
     ]);

    const registry = new InterceptorRegistry();
    const bridge = createBridgeSender();

    // Register patterns only for handlers that detect the current host
    // (avoids cross-platform false positives on non-target domains)
    registry.registerPatterns(getPatternsForCurrentHost());

    // Register metadata patterns (read-only, non-blocking track discovery)
    registry.registerMetadataPatterns(getMetadataPatternsForCurrentHost());

    // Register manifest patterns (read-only, non-blocking manifest detection)
    registry.registerManifestPatterns(getManifestPatternsForCurrentHost());

    const xhrInterceptor = new XhrInterceptor(registry, bridge);
    const fetchInterceptor = new FetchInterceptor(registry, bridge);
    const mseInterceptor = new MseInterceptor(bridge);

    xhrInterceptor.enable();
    fetchInterceptor.enable();
    mseInterceptor.enable();

    // Listen for config messages from the coordinator (ISOLATED world)
    // to update the translation timeout from user settings
    onMessage('SUBTITLE_CONFIG', (payload) => {
      const config = payload as {
        translationTimeoutMs?: number;
        preferredSubtitleLanguage?: string;
      };
      if (config?.translationTimeoutMs) {
        xhrInterceptor.setTimeout(config.translationTimeoutMs);
        fetchInterceptor.setTimeout(config.translationTimeoutMs);
        console.log('[AnyLLMTranslate] Interceptor timeout updated to', config.translationTimeoutMs, 'ms');
      }
      if (config?.preferredSubtitleLanguage !== undefined) {
        setMpdPreferredLanguage(config.preferredSubtitleLanguage);
      }
    });

    // Handle BFCache lifecycle: disable interceptors when page goes into BFCache,
    // re-enable when it's restored. Non-persisted pagehide means the page is
    // truly unloading, so we also disable to restore prototypes.
    window.addEventListener('pagehide', (event: PageTransitionEvent) => {
      resetMaxMpdProcessorState();
      xhrInterceptor.disable();
      fetchInterceptor.disable();
      mseInterceptor.disable();
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
        mseInterceptor.enable();
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

    // Start DOM cue source for platforms that render captions into the DOM (e.g. Max)
    const currentHandler = detectCurrentHandler();
    if (currentHandler?.getDomCueSource) {
      const startDom = () => startDomCueSource(currentHandler, bridge);
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startDom);
      } else {
        startDom();
      }
      console.log('[AnyLLMTranslate] DOM cue source started for', currentHandler.platform);
    }
  },
});

