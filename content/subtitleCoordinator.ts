/**
 * Subtitle Coordinator — Orchestrates subtitle translation flow.
 * Detects interception failure and auto-activates overlay fallback.
 *
 * Features:
 * - Parse intercepted subtitles via platform handler
 * - Translate cues via background service
 * - Build bilingual or translation-only VTT and post back to interceptor
 * - Activate overlay fallback with translated cues when interception times out
 */

import { onSubtitleIntercepted, sendTranslatedSubtitle, onTracksDiscovered } from '@/content/messageBridge';
import { initializeOverlay, updateCues, cleanup as cleanupOverlay, getOverlayTextContainer } from '@/content/subtitleOverlay';
import { showSubtitleToast, hideSubtitleToast } from '@/content/subtitleToast';
import { initializeControls, enableDragReposition } from '@/content/subtitleControls';
import { parseSubtitles } from '@/lib/subtitleParser';
import { getHandlerByPlatform, detectCurrentHandler } from '@/inject/subtitleHandlers/registry';
import { loadSettings } from '@/lib/config';
import type { SubtitleCue, SubtitleInterceptedPayload, AvailableSubtitleTrack, SubtitleTracksDiscoveredPayload } from '@/types/subtitle';
import type { PageContext } from '@/types/config';
import { extractPageContext, resolveCategory } from '@/content/utils/pageContext';
import { findMatchingRule } from '@/lib/siteRules';

/** Coordinator state */
interface CoordinatorState {
  isOverlayMode: boolean;
  pendingRequests: Map<string, ReturnType<typeof setTimeout>>;
  interceptTimeout: number;
  dragCleanup: (() => void) | null;
  availableTracks: AvailableSubtitleTrack[];
  /** Incremented on SPA navigation to invalidate stale async callbacks */
  navigationEpoch: number;
  /** Debounce timer for track discovery events */
  discoverDebounceTimer: ReturnType<typeof setTimeout> | null;
  /** True once the user has pressed play on the primary video */
  videoIsPlaying: boolean;
  /** Temporary tab-scoped category override from popup */
  categoryOverride: string | undefined;
}

const state: CoordinatorState = {
  isOverlayMode: false,
  pendingRequests: new Map(),
  interceptTimeout: 30000, // Default; overridden by loadSettings() on each interception
  dragCleanup: null,
  availableTracks: [],
  navigationEpoch: 0,
  discoverDebounceTimer: null,
  videoIsPlaying: false,
  categoryOverride: undefined,
};

/**
 * Build resolved page context for subtitle translation.
 * Extracts metadata, applies site rules and tab overrides.
 */
async function buildSubtitlePageContext(): Promise<PageContext | undefined> {
  const settings = await loadSettings();
  if (!settings.enableContextAwareTranslation) return undefined;

  const pageContext = extractPageContext(document, settings.enablePageCategoryDetection);

  // Apply category override resolution (FR-4: temp > siteRule > autoDetect)
  // Always run resolution — a SiteRule category may exist even when
  // enablePageCategoryDetection is off and no tab override is active.
  const hostname = window.location.hostname;
  const matchingRule = findMatchingRule(hostname, settings.siteRules ?? []);
  const resolved = resolveCategory(
    pageContext.category,
    matchingRule?.category,
    state.categoryOverride,
  );
  if (resolved) {
    pageContext.category = resolved;
  }

  return pageContext;
}

/**
 * Handle subtitle interception from MAIN world.
 */
async function handleIntercepted(payload: SubtitleInterceptedPayload, requestId: string): Promise<void> {
  const { url, body, contentType, platform, originalLanguage } = payload;

  // Guard: only activate on actual watch pages.
  // On listing/search/home pages (e.g. YouTube /results, /), pass the original
  // subtitle content straight back so native thumbnail preview playback is unaffected.
  if (!isOnWatchPage()) {
    console.log('AnyLLMTranslate: Skipping subtitle interception — not a watch page', { url });
    sendTranslatedSubtitle({ requestId, vttContent: body });
    return;
  }

  try {
    const handler = getHandlerByPlatform(platform);
    if (!handler) return;

    const cues = handler.transformResponse(body, contentType, url);
    if (cues.length === 0) return;


    const settings = await loadSettings();

    // Immediately activate overlay fallback to handle progressive chunks
    if (!state.isOverlayMode) {
      console.log('AnyLLMTranslate: Activating overlay mode for progressive translation');
      state.isOverlayMode = true;
      
      await initializeControls();
      
      const subtitleCfg = settings.subtitleSettings;
      const fontFamilyMap: Record<string, string> = {
        serif: 'Georgia, serif',
        monospace: 'monospace',
        system: 'system-ui, sans-serif',
      };
      const fontFamily = fontFamilyMap[subtitleCfg?.fontFamily ?? 'system'] ?? 'system-ui, sans-serif';
      const displayMode = subtitleCfg?.displayMode ?? 'bilingual';

      // Initialize with original cues so they show immediately
      initializeOverlay(cues, { fontFamily, displayMode });

      // Attach drag-to-reposition on the subtitle text container
      const textContainer = getOverlayTextContainer();
      if (textContainer) {
        state.dragCleanup = enableDragReposition(textContainer);
      }
    } else {
      // If already in overlay mode, just update cues
      updateCues(cues);
    }

    // Post an empty VTT back to the interceptor to disable native subtitles
    // and prevent duplicate rendering
    sendTranslatedSubtitle({ requestId, vttContent: 'WEBVTT\n\n' });

    const sourceLanguage = settings.sourceLanguage === 'auto' 
      ? (originalLanguage || 'en') 
      : settings.sourceLanguage;

    showSubtitleToast('Translating subtitles progressively...', true);

    const pageContext = await buildSubtitlePageContext();

    const response = await chrome.runtime.sendMessage({
      action: 'translateSubtitle',
      cues,
      sourceLanguage,
      targetLanguage: settings.targetLanguage,
      pageContext,
    }) as { success: boolean; cues?: SubtitleCue[]; error?: string };

    if (!response?.success || !response.cues) {
      console.warn('AnyLLMTranslate: Translation failed', response?.error);
      hideSubtitleToast();
      showSubtitleToast('Subtitle translation failed.');
      return;
    }

    // The first chunk comes back immediately in response.cues
    updateTranslatedCues(response.cues);
    
    hideSubtitleToast();
    showSubtitleToast('Subtitles processing...');
  } catch (error) {
    console.warn('AnyLLMTranslate: handleIntercepted error', error);
    hideSubtitleToast();
    showSubtitleToast('Subtitle translation error.');
  }
}

/**
 * Activate overlay mode with fetched subtitles.
 */
async function activateOverlayMode(subtitleUrl: string, content?: string): Promise<void> {
  if (state.isOverlayMode) return;

  state.isOverlayMode = true;
  console.log('AnyLLMTranslate: Activating overlay fallback mode');

  // Fetch subtitle content if not provided
  let subtitleContent = content;
  if (!subtitleContent) {
    try {
      subtitleContent = await fetchSubtitleContent(subtitleUrl);
    } catch (error) {
      console.error('AnyLLMTranslate: Failed to fetch subtitle content', error);
      return;
    }
  }

  // Parse subtitles
  const cues = parseSubtitles(subtitleContent);
  if (cues.length === 0) {
    console.warn('AnyLLMTranslate: No cues found in subtitle content');
    return;
  }

  // FR-5: Translate cues before handing to overlay
  let cuesToDisplay = cues;
  try {
    showSubtitleToast('Translating Overlay Subtitles...', true);

    const settings = await loadSettings();
    const pageContext = await buildSubtitlePageContext();

    const response = await chrome.runtime.sendMessage({
      action: 'translateSubtitle',
      cues,
      sourceLanguage: settings.sourceLanguage,
      targetLanguage: settings.targetLanguage,
      pageContext,
    }) as { success: boolean; cues?: SubtitleCue[]; error?: string };

    if (response?.success && response.cues) {
      cuesToDisplay = response.cues;
      hideSubtitleToast();
      showSubtitleToast('Overlay mapped successfully!');
    } else {
      hideSubtitleToast();
      showSubtitleToast('Overlay mapping failed.');
    }
  } catch (error) {
    hideSubtitleToast();
    showSubtitleToast('Overlay translation error.');
    console.warn('AnyLLMTranslate: Overlay translation failed — showing original cues', error);
  }

  // Initialize overlay with controls
  await initializeControls();

  // Reuse settings already loaded above
  const subtitleCfg = settings.subtitleSettings;
  const fontFamilyMap: Record<string, string> = {
    serif: 'Georgia, serif',
    monospace: 'monospace',
    system: 'system-ui, sans-serif',
  };
  const fontFamily = fontFamilyMap[subtitleCfg?.fontFamily ?? 'system'] ?? 'system-ui, sans-serif';
  const displayMode = subtitleCfg?.displayMode ?? 'bilingual';

  initializeOverlay(cuesToDisplay, { fontFamily, displayMode });

  // Attach drag-to-reposition on the subtitle text container
  const textContainer = getOverlayTextContainer();
  if (textContainer) {
    state.dragCleanup = enableDragReposition(textContainer);
  }

  // Clear all pending timeouts since we're in overlay mode now
  for (const timeoutId of state.pendingRequests.values()) {
    clearTimeout(timeoutId);
  }
  state.pendingRequests.clear();
}

/**
 * Fetch subtitle content via background worker (CORS bypass).
 */
async function fetchSubtitleContent(url: string): Promise<string> {
  try {
    // Try direct fetch first
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.text();
  } catch (error) {
    // If direct fetch fails, try via background worker
    console.warn('AnyLLMTranslate: Direct fetch failed, trying background worker', error);
    return fetchViaBackground(url);
  }
}

/**
 * Fetch subtitle content via background worker for CORS bypass.
 */
async function fetchViaBackground(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: 'FETCH_SUBTITLE',
        url,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        resolve(response.content);
      },
    );
  });
}

/**
 * Update translated cues in overlay.
 */
export function updateTranslatedCues(cues: SubtitleCue[]): void {
  if (!state.isOverlayMode) {
    console.warn('AnyLLMTranslate: Cannot update cues - not in overlay mode');
    return;
  }
  updateCues(cues);
}

/**
 * Clear a pending request timeout to prevent spurious overlay activation.
 * Called when translation completes successfully.
 */
export function clearPendingRequest(requestId: string): void {
  const timeoutId = state.pendingRequests.get(requestId);
  if (timeoutId) {
    clearTimeout(timeoutId);
    state.pendingRequests.delete(requestId);
  }
}

/**
 * Hook into SPA navigation events to reset state when the user navigates away
 * from a watch page (e.g. YouTube home → /watch or /watch → home).
 * Returns a cleanup function.
 */
function startSpaNavigationWatcher(): () => void {
  let lastUrl = window.location.href;

  const handleNavigation = () => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      console.log('AnyLLMTranslate: SPA navigation detected, resetting coordinator state');
      resetCoordinatorState();
    }
  };

  // YouTube emits 'yt-navigate-finish' on SPA nav; fall back to history API patching
  window.addEventListener('yt-navigate-finish', handleNavigation);

  // Patch pushState / replaceState for generic SPA support
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = function (...args) {
    originalPushState(...args);
    handleNavigation();
  };
  history.replaceState = function (...args) {
    originalReplaceState(...args);
    handleNavigation();
  };

  window.addEventListener('popstate', handleNavigation);

  return () => {
    window.removeEventListener('yt-navigate-finish', handleNavigation);
    window.removeEventListener('popstate', handleNavigation);
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
  };
}

/**
 * Start the subtitle coordinator.
 * Returns a cleanup function.
 */
export function startCoordinator(): () => void {
  console.log('AnyLLMTranslate: Starting subtitle coordinator');

  // Listen for intercepted subtitles
  const cleanupBridge = onSubtitleIntercepted(handleIntercepted);

  // Listen for track discovery from MAIN world
  const cleanupDiscovery = onTracksDiscovered(handleTracksDiscovered);

  // Watch for SPA navigations to reset per-video state
  const cleanupNavWatcher = startSpaNavigationWatcher();

  // Watch for video play events — the ONLY trigger for auto-activate
  const cleanupPlaybackWatcher = startVideoPlaybackWatcher();

  // Listen for progressive chunk updates from background
  const handleExtensionMessage = (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    _sendResponse: () => void
  ) => {
    const msg = message as { action?: string; cues?: SubtitleCue[]; language?: string };
    if (msg.action === 'SUBTITLE_CHUNK_TRANSLATED' && msg.cues) {
      updateTranslatedCues(msg.cues);
    }
    // Handle popup requesting subtitle track selection
    if (msg.action === 'SELECT_SUBTITLE_TRACK' && msg.language) {
      selectSubtitleTrack(msg.language);
    }
    // Handle popup querying available tracks
    if (msg.action === 'GET_AVAILABLE_TRACKS') {
      _sendResponse();
      chrome.runtime.sendMessage({
        action: 'SUBTITLE_TRACKS_AVAILABLE',
        tracks: state.availableTracks,
      });
    }
    // Handle category override changes from popup
    if (msg.action === 'categoryChanged') {
      state.categoryOverride = (message as { category?: string | null }).category ?? undefined;
    }
  };
  chrome.runtime.onMessage.addListener(handleExtensionMessage);

  // Return cleanup function
  return () => {
    console.log('AnyLLMTranslate: Stopping subtitle coordinator');
    cleanupBridge();
    cleanupDiscovery();
    cleanupNavWatcher();
    cleanupPlaybackWatcher();
    chrome.runtime.onMessage.removeListener(handleExtensionMessage);

    if (state.discoverDebounceTimer !== null) {
      clearTimeout(state.discoverDebounceTimer);
      state.discoverDebounceTimer = null;
    }

    // Clear all pending timeouts
    for (const timeoutId of state.pendingRequests.values()) {
      clearTimeout(timeoutId);
    }
    state.pendingRequests.clear();

    // Cleanup drag listeners and overlay if active
    if (state.dragCleanup) {
      state.dragCleanup();
      state.dragCleanup = null;
    }
    if (state.isOverlayMode) {
      cleanupOverlay();
    }
  };
}

/**
 * Manually trigger overlay mode (for testing or user preference).
 */
export async function forceOverlayMode(subtitleUrl: string, content?: string): Promise<void> {
  await activateOverlayMode(subtitleUrl, content);
}

/**
 * Check if coordinator is in overlay mode.
 */
export function isInOverlayMode(): boolean {
  return state.isOverlayMode;
}

/**
 * Reset coordinator state (for testing or SPA navigation).
 */
export function resetCoordinatorState(): void {
  // Clean up active overlay before resetting the flag
  if (state.isOverlayMode) {
    cleanupOverlay();
  }
  state.isOverlayMode = false;
  state.availableTracks = [];
  state.navigationEpoch++;
  state.videoIsPlaying = false;
  state.categoryOverride = undefined;
  if (state.discoverDebounceTimer !== null) {
    clearTimeout(state.discoverDebounceTimer);
    state.discoverDebounceTimer = null;
  }
  if (state.dragCleanup) {
    state.dragCleanup();
    state.dragCleanup = null;
  }
  for (const timeoutId of state.pendingRequests.values()) {
    clearTimeout(timeoutId);
  }
  state.pendingRequests.clear();
}

/**
 * Detect if current page is a video watch page (not a listing/home page).
 * Guards against auto-activate firing on YouTube home, search, etc.
 */
function isOnWatchPage(): boolean {
  const { pathname, hostname } = window.location;

  // For known platforms, use strict explicit matching.
  // Return false immediately for non-watch paths — never fall through to
  // the generic heuristic, since these platforms have listing/home/search
  // pages with autoplay thumbnail videos that would trigger it incorrectly.
  if (hostname.includes('youtube.com')) {
    return pathname === '/watch';
  }
  if (hostname.includes('udemy.com')) {
    return pathname.includes('/learn/');
  }
  if (hostname.includes('coursera.org')) {
    return pathname.includes('/lecture/');
  }

  // Unknown platform — do not auto-activate on generic video elements
  return false;
}


/**
 * Handle discovered subtitle tracks from MAIN world bridge.
 * Deduplicates by videoId+language+platform, notifies popup, and auto-activates if configured.
 * Debounced 150ms to coalesce rapid events (e.g. YouTube home carousel).
 */
function handleTracksDiscovered(payload: SubtitleTracksDiscoveredPayload): Promise<void> {
  if (state.discoverDebounceTimer !== null) {
    clearTimeout(state.discoverDebounceTimer);
  }
  return new Promise((resolve) => {
    state.discoverDebounceTimer = setTimeout(() => {
      state.discoverDebounceTimer = null;
      processTracksDiscovered(payload).then(resolve).catch(resolve);
    }, 150);
  });
}

async function processTracksDiscovered(payload: SubtitleTracksDiscoveredPayload): Promise<void> {
  const epochAtStart = state.navigationEpoch;

  const handler = detectCurrentHandler();
  let tracks: AvailableSubtitleTrack[];

  // If payload is from html5 textTrackDiscovery, use it directly
  if (payload.platform === 'html5' && payload.tracks && Array.isArray(payload.tracks)) {
    tracks = payload.tracks;
  } else if (handler?.extractAvailableTracks) {
    const rawPayload = payload as unknown as { body?: string; contentType?: string; url?: string };
    tracks = handler.extractAvailableTracks(
      rawPayload.body || JSON.stringify(payload),
      rawPayload.contentType || 'application/json',
      rawPayload.url || '',
    );
  } else if (payload.tracks && Array.isArray(payload.tracks)) {
    // Fallback for other cases
    tracks = payload.tracks;
  } else {
    return;
  }

  if (tracks.length === 0) return;

  // Determine the video scope: prefer videoId from tracks themselves or from payload
  const incomingVideoId = tracks[0]?.videoId || payload.videoId;

  // If we have a videoId, clear stale tracks from a different video before accumulating
  if (incomingVideoId) {
    const currentVideoId = state.availableTracks[0]?.videoId;
    if (currentVideoId && currentVideoId !== incomingVideoId) {
      console.log('AnyLLMTranslate: New video detected, clearing stale tracks', {
        previous: currentVideoId,
        next: incomingVideoId,
      });
      state.availableTracks = [];
    }
  }

  // Merge with existing tracks — deduplicate by videoId+language+platform
  for (const track of tracks) {
    const existing = state.availableTracks.find(
      (t) =>
        t.language === track.language &&
        t.platform === track.platform &&
        (t.videoId === track.videoId || (!t.videoId && !track.videoId)),
    );
    if (!existing) {
      state.availableTracks.push(track);
    } else if (track.url && !existing.url) {
      // Update URL if newly discovered
      existing.url = track.url;
    }
  }

  console.log('AnyLLMTranslate: Subtitle tracks discovered', {
    total: state.availableTracks.length,
    languages: state.availableTracks.map((t) => t.language),
    platform: payload.platform,
    videoId: incomingVideoId,
  });

  // Notify popup/UI about available tracks
  chrome.runtime.sendMessage({
    action: 'SUBTITLE_TRACKS_AVAILABLE',
    tracks: state.availableTracks,
  }).catch(() => { /* popup may not be open */ });

  // Tracks are now stored. Auto-activate will fire only when the user
  // actually presses play — see startVideoPlaybackWatcher().
  // If video is already playing when tracks arrive, try immediately.
  if (state.videoIsPlaying) {
    await tryAutoActivate(epochAtStart);
  }
}

/**
 * Shared auto-activate logic. Runs when BOTH conditions are true:
 *   1. The user has started playing the video (videoIsPlaying = true)
 *   2. Subtitle tracks have been discovered (availableTracks is populated)
 *
 * @param epochAtStart - navigationEpoch captured before any async call.
 *   Pass `state.navigationEpoch` when calling synchronously.
 */
async function tryAutoActivate(epochAtStart: number): Promise<void> {
  if (state.isOverlayMode) return;
  if (!isOnWatchPage()) return;

  // Only activate if all known tracks belong to a single video
  const knownVideoIds = new Set(
    state.availableTracks.map((t) => t.videoId).filter((id): id is string => !!id),
  );
  if (knownVideoIds.size > 1) {
    console.log('AnyLLMTranslate: Skipping auto-activate — tracks from multiple videos', {
      videoIds: [...knownVideoIds],
    });
    return;
  }

  const settings = await loadSettings();
  if (state.navigationEpoch !== epochAtStart) return; // stale — user navigated away

  const preferredLang = settings.subtitleSettings?.preferredSubtitleLanguage;
  const autoActivate = settings.subtitleSettings?.autoActivateSubtitles;

  if (autoActivate && preferredLang && !state.isOverlayMode) {
    const preferred = state.availableTracks.find((t) => t.language === preferredLang);
    if (preferred?.url) {
      console.log('AnyLLMTranslate: Auto-activating preferred subtitle track on play', preferredLang);
      await selectSubtitleTrack(preferredLang);
    }
  }
}

/**
 * Watch for the user pressing play on any video element.
 * This is the single trigger for auto-activate — we never activate on
 * discovery alone to avoid unnecessary LLM calls for unplayed videos.
 *
 * Handles two orderings:
 *   A) play fires before tracks arrive  → sets videoIsPlaying, tryAutoActivate
 *      will be called again from processTracksDiscovered when they arrive.
 *   B) tracks arrive before play fires  → tryAutoActivate called on play.
 *
 * Returns a cleanup function.
 */
function startVideoPlaybackWatcher(): () => void {
  const watchedVideos = new WeakSet<HTMLVideoElement>();

  const attachPlayListener = (video: HTMLVideoElement) => {
    if (watchedVideos.has(video)) return;
    watchedVideos.add(video);

    video.addEventListener('play', () => {
      if (state.videoIsPlaying) return; // already handled
      state.videoIsPlaying = true;
      console.log('AnyLLMTranslate: Video play detected — attempting auto-activate');
      const epoch = state.navigationEpoch;
      tryAutoActivate(epoch).catch((err) => {
        console.warn('AnyLLMTranslate: Auto-activate on play failed', err);
      });
    });

    // Reset flag when the video stops so re-play re-triggers correctly
    video.addEventListener('pause', () => {
      // Don't reset here — a brief pause shouldn't lose the "playing" state.
      // Only SPA navigation (resetCoordinatorState) should clear it.
    });
  };

  const scanForVideos = () => {
    if (typeof document === 'undefined') return;
    const videos = document.querySelectorAll<HTMLVideoElement>('video');
    for (const video of videos) {
      attachPlayListener(video);
    }
  };

  // Initial scan
  scanForVideos();

  // Watch for dynamically added videos (e.g. YouTube player loads after page)
  const observer = new MutationObserver(() => {
    scanForVideos();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
  };
}

/**
 * Proactively fetch and translate a specific subtitle track by language.
 */
export async function selectSubtitleTrack(language: string): Promise<void> {
  const track = state.availableTracks.find((t) => t.language === language);
  if (!track?.url) {
    console.warn('AnyLLMTranslate: No URL for track', language);
    return;
  }

  console.log('AnyLLMTranslate: Selecting subtitle track', { language, url: track.url });
  await activateOverlayMode(track.url);
}

/**
 * Get all discovered subtitle tracks.
 */
export function getAvailableTracks(): AvailableSubtitleTrack[] {
  return [...state.availableTracks];
}
