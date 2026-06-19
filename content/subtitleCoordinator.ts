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

import { onSubtitleIntercepted, sendTranslatedSubtitle, onTracksDiscovered, onDomCues } from '@/content/messageBridge';
import { initializeOverlay, updateCues, cleanup as cleanupOverlay, getOverlayTextContainer } from '@/content/subtitleOverlay';
import { clearHoverCache } from '@/content/hoverTranslate';
import { showSubtitleToast, hideSubtitleToast } from '@/content/subtitleToast';
import { initializeControls, enableDragReposition } from '@/content/subtitleControls';
import { parseSubtitles } from '@/lib/subtitleParser';
import { getHandlerByPlatform, detectCurrentHandler } from '@/inject/subtitleHandlers/registry';
import { loadSettings } from '@/lib/config';
import type { SubtitleCue, SubtitleInterceptedPayload, AvailableSubtitleTrack, SubtitleTracksDiscoveredPayload, SubtitleDomCuesPayload } from '@/types/subtitle';
import type { PageContext, SubtitleSettings } from '@/types/config';
import type { OverlayConfig } from '@/content/subtitleOverlay';
import { extractPageContext, resolveCategory, detectLLMCategoryIfNeeded } from '@/content/utils/pageContext';
import { setAutoDetectedCategory, broadcastCategoryInfo, getAutoDetectedCategory } from '@/content/categoryState';
import { findMatchingRule } from '@/lib/siteRules';
import { isSiteDisabled } from '@/lib/subtitleSites';

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
  /** Active subtitle session ID — stale chunks with different IDs are dropped */
  activeSubtitleSessionId: number | null;
  /** Injected <style> hiding the platform's native caption window (null when inactive) */
  captionHideStyle: HTMLStyleElement | null;
  /** DOM-platform: rolling original (source-language) cues from the scraper */
  domOriginalCues: SubtitleCue[];
  /** DOM-platform: merged bilingual cues shown in the overlay (originalText + translated text) */
  domTranslatedCues: SubtitleCue[];
  /** DOM-platform: set of original cue texts already sent for translation (dedup) */
  domTranslatedTexts: Set<string>;
  /** DOM-platform: persistent map of originalText → translatedText across batches */
  domTranslationMap: Map<string, string>;
}

const state: CoordinatorState = {
  isOverlayMode: false,
  pendingRequests: new Map(),
  interceptTimeout: 30000, // Reserved for future use — interceptors manage their own timeouts
  dragCleanup: null,
  availableTracks: [],
  navigationEpoch: 0,
  discoverDebounceTimer: null,
  videoIsPlaying: false,
  categoryOverride: undefined,
  activeSubtitleSessionId: null,
  captionHideStyle: null,
  domOriginalCues: [],
  domTranslatedCues: [],
  domTranslatedTexts: new Set(),
  domTranslationMap: new Map(),
};

function resolveSubtitleFontFamily(fontFamily: SubtitleSettings['fontFamily'] | undefined): string {
  const fontFamilyMap: Record<SubtitleSettings['fontFamily'], string> = {
    serif: 'Georgia, serif',
    monospace: 'monospace',
    system: 'system-ui, sans-serif',
  };
  return fontFamilyMap[fontFamily ?? 'system'] ?? 'system-ui, sans-serif';
}

function buildSubtitleOverlayConfig(
  subtitleSettings: SubtitleSettings,
  savedPrefs?: Partial<OverlayConfig>,
): Partial<OverlayConfig> {
  return {
    fontSize: subtitleSettings.fontSize,
    fontSizeMode: subtitleSettings.fontSizeMode,
    position: subtitleSettings.position,
    backgroundOpacity: subtitleSettings.backgroundOpacity,
    fontFamily: resolveSubtitleFontFamily(subtitleSettings.fontFamily),
    displayMode: subtitleSettings.displayMode,
    offsetX: savedPrefs?.offsetX ?? 0,
    offsetY: savedPrefs?.offsetY ?? 0,
  };
}

function cleanupActiveOverlay(): void {
  if (state.dragCleanup) {
    state.dragCleanup();
    state.dragCleanup = null;
  }
  if (state.isOverlayMode) {
    cleanupOverlay();
    state.isOverlayMode = false;
  }
}

/** Inject a <style> hiding the platform's native caption window. */
function hideNativeCaptions(selector: string): void {
  if (state.captionHideStyle) return;
  const style = document.createElement('style');
  style.setAttribute('data-anyllm-role', 'caption-hide');
  style.textContent = `${selector} { visibility: hidden !important; }`;
  document.head.appendChild(style);
  state.captionHideStyle = style;
}

/** Remove the injected caption-hide <style>. */
function restoreNativeCaptions(): void {
  if (state.captionHideStyle) {
    state.captionHideStyle.remove();
    state.captionHideStyle = null;
  }
}

/**
 * Build resolved page context for subtitle translation.
 * Extracts metadata, applies site rules and tab overrides.
 */
async function buildSubtitlePageContext(): Promise<PageContext | undefined> {
  const settings = await loadSettings();
  if (!settings.enableContextAwareTranslation) return undefined;

  const pageContext = extractPageContext(document, settings.enableLLMPageCategoryDetection);

  await detectLLMCategoryIfNeeded(
    pageContext,
    settings,
    state.categoryOverride,
    getAutoDetectedCategory(),
    (cat) => {
      setAutoDetectedCategory(cat);
      broadcastCategoryInfo(settings, state.categoryOverride);
    },
  );

  // If a tab-level category exists, it overrides the auto-detected one.
  // Note: pageContext.category will be empty if extractPageContext found no generic info and
  // enableLLMPageCategoryDetection is off and no tab override is active.
  // Prefer the shared singleton (LLM-detected) over the per-batch heuristic so
  // async LLM results reach the translation prompt.
  const hostname = window.location.hostname;
  const matchingRule = findMatchingRule(hostname, settings.siteRules ?? []);
  const resolved = resolveCategory(
    getAutoDetectedCategory() ?? pageContext.category,
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
    const settings = await loadSettings();
    if (!settings.subtitleSettings.enabled) {
      cleanupActiveOverlay();
      sendTranslatedSubtitle({ requestId, vttContent: body });
      return;
    }

    // Per-site toggle: skip translation for disabled platforms (always-respond pattern)
    if (isSiteDisabled(platform, settings.subtitleSettings.disabledSubtitleSites ?? [])) {
      sendTranslatedSubtitle({ requestId, vttContent: body });
      return;
    }

    const handler = getHandlerByPlatform(platform);
    if (!handler) {
      sendTranslatedSubtitle({ requestId, vttContent: body });
      return;
    }

    const cues = handler.transformResponse(body, contentType, url);
    if (cues.length === 0) {
      sendTranslatedSubtitle({ requestId, vttContent: body });
      return;
    }

    // Immediately activate overlay fallback to handle progressive chunks
    if (!state.isOverlayMode) {
      console.log('AnyLLMTranslate: Activating overlay mode for progressive translation');
      state.isOverlayMode = true;
      
      const savedPrefs = await initializeControls();
      const overlayConfig = buildSubtitleOverlayConfig(settings.subtitleSettings, savedPrefs);

      // Initialize with original cues so they show immediately
      initializeOverlay(cues, overlayConfig);

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
    }) as { success: boolean; cues?: SubtitleCue[]; error?: string; sessionId?: number };

    if (!response?.success || !response.cues) {
      console.warn('AnyLLMTranslate: Translation failed', response?.error);
      hideSubtitleToast();
      showSubtitleToast('Subtitle translation failed.');
      return;
    }

    // Track the active session so stale chunks from older sessions are dropped
    if (response.sessionId !== undefined) {
      state.activeSubtitleSessionId = response.sessionId;
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

  const settings = await loadSettings();
  if (!settings.subtitleSettings.enabled) {
    cleanupActiveOverlay();
    return;
  }

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

  state.isOverlayMode = true;
  console.log('AnyLLMTranslate: Activating overlay fallback mode');

  // FR-5: Translate cues before handing to overlay
  let cuesToDisplay = cues;
  try {
    showSubtitleToast('Translating Overlay Subtitles...', true);

    const pageContext = await buildSubtitlePageContext();

    const response = await chrome.runtime.sendMessage({
      action: 'translateSubtitle',
      cues,
      sourceLanguage: settings.sourceLanguage,
      targetLanguage: settings.targetLanguage,
      pageContext,
    }) as { success: boolean; cues?: SubtitleCue[]; error?: string; sessionId?: number };

    if (response?.success && response.cues) {
      cuesToDisplay = response.cues;
      if (response.sessionId !== undefined) {
        state.activeSubtitleSessionId = response.sessionId;
      }
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
  const savedPrefs = await initializeControls();
  const overlayConfig = buildSubtitleOverlayConfig(settings.subtitleSettings, savedPrefs);

  initializeOverlay(cuesToDisplay, overlayConfig);

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
 * Replace the rolling original cue buffer with the latest from MAIN world.
 * The MAIN world always sends the FULL rolling array with correct timing
 * (endTimes updated when new cues close previous ones). Replacing the
 * entire array ensures the content script always has up-to-date timing.
 * Returns the list of NEW cue texts not yet sent for translation.
 */
function mergeDomOriginalCues(incoming: SubtitleCue[]): string[] {
  const newTexts: string[] = [];
  // Replace the full buffer — the MAIN world array has authoritative timing.
  state.domOriginalCues = incoming.map((c) => ({ ...c }));
  for (const cue of incoming) {
    if (!state.domTranslatedTexts.has(cue.text)) {
      newTexts.push(cue.text);
      state.domTranslatedTexts.add(cue.text);
    }
  }
  return newTexts;
}

/**
 * Rebuild domTranslatedCues from domOriginalCues using the persistent
 * translation map. Each cue carries originalText (source) + text
 * (translated, or source if not yet translated).
 */
function rebuildTranslatedCues(): void {
  state.domTranslatedCues = state.domOriginalCues.map((cue) => ({
    startTime: cue.startTime,
    endTime: cue.endTime,
    text: state.domTranslationMap.get(cue.text) ?? cue.text,
    originalText: cue.text,
  }));
}

/**
 * Translate the given new source cue texts and merge into the overlay.
 * Sends a translateSubtitle request for the delta only.
 */
async function translateDomCueTexts(
  newTexts: string[],
  sourceLanguage: string,
  targetLanguage: string,
  pageContext: PageContext | undefined,
  sessionId: number | null,
): Promise<void> {
  if (newTexts.length === 0) return;
  const cuesToTranslate: SubtitleCue[] = newTexts.map((text, i) => ({
    startTime: i,
    endTime: i + 1,
    text,
  }));
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'translateSubtitle',
      cues: cuesToTranslate,
      sourceLanguage,
      targetLanguage,
      pageContext,
      sessionId: sessionId ?? undefined,
    }) as { success: boolean; cues?: SubtitleCue[]; error?: string; sessionId?: number };

    if (!response?.success || !response.cues) {
      console.warn('AnyLLMTranslate: DOM cue delta translation failed', response?.error);
      return;
    }
    if (response.sessionId !== undefined) {
      state.activeSubtitleSessionId = response.sessionId;
    }
    // Accumulate translations in the persistent map so previous
    // batches' translations are preserved across rebuilds.
    response.cues.forEach((c) => {
      state.domTranslationMap.set(c.originalText ?? c.text, c.text);
    });
    rebuildTranslatedCues();
    updateCues(state.domTranslatedCues);
  } catch (error) {
    console.warn('AnyLLMTranslate: DOM cue delta translation error', error);
  }
}

/**
 * Handle DOM-scraped cues from MAIN world (Max). Accumulates cues, translates
 * the delta on each batch, and keeps the overlay showing bilingual cues
 * (originalText + translated text). Never overwrites translated cues with raw
 * source cues — that was the critical bug fixed here.
 */
async function handleDomCues(payload: SubtitleDomCuesPayload): Promise<void> {
  if (!isOnWatchPage()) return;
  if (payload.cues.length === 0) return;

  if (!state.isOverlayMode) {
    await activateOverlayFromDom(payload);
    return;
  }

  // Already active — merge new cues (updates timing of all cues).
  const newTexts = mergeDomOriginalCues(payload.cues);

  // Always rebuild + push to overlay even when no new texts — cue timing
  // changes (endTime corrections on previous cues) must reach findActiveCue().
  rebuildTranslatedCues();
  updateCues(state.domTranslatedCues);

  if (newTexts.length === 0) return;

  const settings = await loadSettings();
  const sourceLanguage = settings.sourceLanguage === 'auto'
    ? (payload.language || 'en')
    : settings.sourceLanguage;
  const pageContext = await buildSubtitlePageContext();
  await translateDomCueTexts(
    newTexts,
    sourceLanguage,
    settings.targetLanguage,
    pageContext,
    state.activeSubtitleSessionId,
  );
}

/**
 * Activate overlay mode from DOM-scraped cues (Max).
 * Hides native captions, starts with original cues, then translates.
 */
async function activateOverlayFromDom(payload: SubtitleDomCuesPayload): Promise<void> {
  if (state.isOverlayMode) return;

  const epochAtStart = state.navigationEpoch;
  const settings = await loadSettings();
  if (state.navigationEpoch !== epochAtStart) return; // stale — user navigated away
  if (!settings.subtitleSettings.enabled) {
    cleanupActiveOverlay();
    return;
  }

  const handlerForCheck = detectCurrentHandler();
  if (handlerForCheck && isSiteDisabled(handlerForCheck.platform, settings.subtitleSettings.disabledSubtitleSites ?? [])) {
    return;
  }

  const handler = handlerForCheck;
  const domSource = handler?.getDomCueSource?.();
  if (!handler || !domSource) {
    console.warn('AnyLLMTranslate: No DOM cue source for platform', payload.platform);
    return;
  }

  if (payload.cues.length === 0) {
    console.log('AnyLLMTranslate: No DOM cues yet — waiting for caption changes');
    return;
  }

  state.isOverlayMode = true;
  console.log('AnyLLMTranslate: Activating overlay from DOM cues (Max)');

  // Hide Max's native caption window.
  hideNativeCaptions(domSource.captionWindowSelector);

  // Seed the rolling buffers with the first batch.
  mergeDomOriginalCues(payload.cues);
  rebuildTranslatedCues();

  const savedPrefs = await initializeControls();
  if (state.navigationEpoch !== epochAtStart) return; // stale
  const overlayConfig = buildSubtitleOverlayConfig(settings.subtitleSettings, savedPrefs);

  // Initialize overlay with bilingual cues (source until translated).
  initializeOverlay(state.domTranslatedCues, overlayConfig);

  const textContainer = getOverlayTextContainer();
  if (textContainer) {
    state.dragCleanup = enableDragReposition(textContainer);
  }

  showSubtitleToast('Translating subtitles progressively...', true);

  const sourceLanguage = settings.sourceLanguage === 'auto'
    ? (payload.language || 'en')
    : settings.sourceLanguage;

  const pageContext = await buildSubtitlePageContext();
  if (state.navigationEpoch !== epochAtStart) return; // stale

  // Translate all cue texts seen so far (the first batch).
  const newTexts = [...state.domTranslatedTexts];
  await translateDomCueTexts(
    newTexts,
    sourceLanguage,
    settings.targetLanguage,
    pageContext,
    null,
  );

  hideSubtitleToast();
  showSubtitleToast('Subtitles processing...');
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
        action: 'FETCH_SUBTITLE',
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
 * Best-effort notification to the background to cancel this tab's subtitle
 * translation session. Guarded so it is a no-op when chrome messaging is
 * unavailable (e.g. some test contexts).
 */
function cancelBackgroundSubtitleSession(): void {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      const result = chrome.runtime.sendMessage({ action: 'CANCEL_SUBTITLE_SESSION' });
      if (result && typeof (result as Promise<unknown>).catch === 'function') {
        (result as Promise<unknown>).catch(() => { /* popup/SW may be unavailable */ });
      }
    }
  } catch {
    /* best-effort */
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
      // Tell the background to abandon any in-progress subtitle session for this
      // tab so it stops translating cues for the page we just left.
      cancelBackgroundSubtitleSession();
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

  // Listen for DOM-scraped cues from MAIN world (Max)
  const cleanupDomCues = onDomCues(handleDomCues);

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
      // Drop stale chunks from old subtitle sessions
      const chunkSessionId = (message as { sessionId?: number }).sessionId;
      if (
        state.activeSubtitleSessionId !== null &&
        chunkSessionId !== undefined &&
        chunkSessionId !== state.activeSubtitleSessionId
      ) {
        console.log('AnyLLMTranslate: Dropping stale subtitle chunk', {
          expected: state.activeSubtitleSessionId,
          received: chunkSessionId,
        });
        return;
      }
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
    cleanupDomCues();
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
    restoreNativeCaptions();
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
  state.activeSubtitleSessionId = null;
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
  clearHoverCache();
  restoreNativeCaptions();
  state.domOriginalCues = [];
  state.domTranslatedCues = [];
  state.domTranslatedTexts = new Set();
  state.domTranslationMap = new Map();
}

/**
 * Detect if current page is a video watch page (not a listing/home page).
 * Guards against auto-activate firing on YouTube home, search, etc.
 */
export function isOnWatchPage(): boolean {
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
  if (hostname.includes('linkedin.com')) {
    return pathname.startsWith('/learning/');
  }
  if (hostname.includes('max.com') || hostname.includes('hbomax.com')) {
    return pathname.includes('/video/watch/');
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

  // Per-site toggle: skip auto-activate for disabled platforms
  const currentHandler = detectCurrentHandler();
  if (currentHandler && isSiteDisabled(currentHandler.platform, settings.subtitleSettings.disabledSubtitleSites ?? [])) {
    return;
  }

  const preferredLang = settings.subtitleSettings?.preferredSubtitleLanguage;
  const autoActivate = settings.subtitleSettings?.autoActivateSubtitles;

  if (settings.subtitleSettings?.enabled && autoActivate && preferredLang && !state.isOverlayMode) {
    const preferred = state.availableTracks.find((t) => t.language === preferredLang);
    if (preferred?.url) {
      console.log('AnyLLMTranslate: Auto-activating preferred subtitle track on play', preferredLang);
      await selectSubtitleTrack(preferredLang);
    }
  }
}

/**
 * DOM-platform activation attempt (Max). Auto-activates on play ONLY if:
 *   1. Max's caption overlay is present and visible (captions on in Max)
 *   2. Active Max track language matches preferredSubtitleLanguage (or preferred is 'auto')
 * Returns { activated, reason } for testability.
 */
export async function tryAutoActivateForDom(): Promise<{ activated: boolean; reason: string }> {
  if (state.isOverlayMode) return { activated: false, reason: 'already active' };
  if (!isOnWatchPage()) return { activated: false, reason: 'not a watch page' };

  const handler = detectCurrentHandler();
  const domSource = handler?.getDomCueSource?.();
  if (!handler || !domSource) return { activated: false, reason: 'no DOM cue source' };

  const epochAtStart = state.navigationEpoch;
  const settings = await loadSettings();
  // Stale — user navigated away during the await.
  if (state.navigationEpoch !== epochAtStart) {
    return { activated: false, reason: 'stale (SPA navigation)' };
  }
  if (!settings.subtitleSettings.enabled || !settings.subtitleSettings.autoActivateSubtitles) {
    return { activated: false, reason: 'auto-activate disabled' };
  }

  // Per-site toggle: skip auto-activate for disabled platforms
  if (handler && isSiteDisabled(handler.platform, settings.subtitleSettings.disabledSubtitleSites ?? [])) {
    return { activated: false, reason: 'site disabled by user' };
  }

  // Precondition: Max's caption overlay must be present and visible.
  const overlay = document.querySelector<HTMLElement>(domSource.captionWindowSelector);
  if (!overlay || getComputedStyle(overlay).visibility === 'hidden') {
    showSubtitleToast('Enable subtitles in Max to enable translation (Alt+S to retry).');
    return { activated: false, reason: 'captions off in Max' };
  }

  const activeLang = domSource.readActiveLanguage();
  if (!activeLang) {
    showSubtitleToast('Enable subtitles in Max to enable translation (Alt+S to retry).');
    return { activated: false, reason: 'captions off in Max' };
  }

  const preferred = settings.subtitleSettings.preferredSubtitleLanguage;
  if (preferred && preferred !== 'auto' && activeLang !== preferred) {
    return { activated: false, reason: `active language ${activeLang} != preferred ${preferred}` };
  }

  // Defer to the DOM cue flow — actual activation happens when first cues arrive.
  // Mark videoIsPlaying so handleDomCues can proceed.
  state.videoIsPlaying = true;
  return { activated: true, reason: `activated for ${activeLang}` };
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
  /** Store references to remove listeners on cleanup */
  const listenerMap = new Map<HTMLVideoElement, { play: () => void; pause: () => void }>();

  const attachPlayListener = (video: HTMLVideoElement) => {
    if (watchedVideos.has(video)) return;
    watchedVideos.add(video);

    const playHandler = () => {
      if (state.videoIsPlaying) return;
      state.videoIsPlaying = true;
      console.log('AnyLLMTranslate: Video play detected — attempting auto-activate');
      const epoch = state.navigationEpoch;
      // DOM-sourced platforms (Max) use a different activation path.
      const currentHandler = detectCurrentHandler();
      if (currentHandler?.getDomCueSource) {
        tryAutoActivateForDom().catch((err) => {
          console.warn('AnyLLMTranslate: DOM auto-activate on play failed', err);
        });
        return;
      }
      tryAutoActivate(epoch).catch((err) => {
        console.warn('AnyLLMTranslate: Auto-activate on play failed', err);
      });
    };

    const pauseHandler = () => {
      // Don't reset here — a brief pause shouldn't lose the "playing" state.
      // Only SPA navigation (resetCoordinatorState) should clear it.
    };

    video.addEventListener('play', playHandler);
    video.addEventListener('pause', pauseHandler);
    listenerMap.set(video, { play: playHandler, pause: pauseHandler });
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
    // Remove all play/pause listeners on cleanup
    for (const [video, handlers] of listenerMap) {
      video.removeEventListener('play', handlers.play);
      video.removeEventListener('pause', handlers.pause);
    }
    listenerMap.clear();
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
