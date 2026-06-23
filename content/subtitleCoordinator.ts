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

import {
  onSubtitleIntercepted,
  sendTranslatedSubtitle,
  onTracksDiscovered,
  onDomCues,
  onDomTrackChanged,
} from '@/content/messageBridge';
import { initializeOverlay, updateCues, cleanup as cleanupOverlay, getOverlayTextContainer } from '@/content/subtitleOverlay';
import { clearHoverCache } from '@/content/hoverTranslate';
import { clearTranslatedSections } from '@/content/sectionTranslate';
import { showSubtitleToast, hideSubtitleToast } from '@/content/subtitleToast';
import { initializeControls, enableDragReposition } from '@/content/subtitleControls';
import { parseSubtitles } from '@/lib/subtitleParser';
import { getHandlerByPlatform, detectCurrentHandler } from '@/inject/subtitleHandlers/registry';
import { loadSettings } from '@/lib/config';
import type {
  SubtitleCue,
  SubtitleInterceptedPayload,
  AvailableSubtitleTrack,
  SubtitleTracksDiscoveredPayload,
  SubtitleDomCuesPayload,
  SubtitleDomTrackChangedPayload,
} from '@/types/subtitle';
import type { PageContext, SubtitleSettings } from '@/types/config';
import type { OverlayConfig } from '@/content/subtitleOverlay';
import { extractPageContext, resolveCategory, triggerAutoCategoryDetection } from '@/content/utils/pageContext';
import { setAutoDetectedCategory, broadcastCategoryInfo, getAutoDetectedCategory } from '@/content/categoryState';
import { findMatchingRule } from '@/lib/siteRules';
import { isSiteDisabled } from '@/lib/subtitleSites';
import { resolveProfile, type SubtitleProfile } from '@/lib/subtitleProfiles';

/** Resolve the subtitle profile for the current page from its hostname.
 *  Called per outbound translateSubtitle message; resolveProfile is a cheap
 *  map lookup, so no caching needed. */
function currentSubtitleProfile(): SubtitleProfile {
  return resolveProfile(window.location.hostname);
}

/** Coordinator state */
interface CoordinatorState {
  isOverlayMode: boolean;
  dragCleanup: (() => void) | null;
  availableTracks: AvailableSubtitleTrack[];
  /** Incremented on SPA navigation to invalidate stale async callbacks */
  navigationEpoch: number;
  /** Debounce timer for track discovery events */
  discoverDebounceTimer: ReturnType<typeof setTimeout> | null;
  /** Debounce timer for DOM track list scraping (Max) */
  domDiscoverDebounceTimer: ReturnType<typeof setTimeout> | null;
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
  /** Translated cues array (merged from chunk deltas) for overlay display */
  translatedCues: SubtitleCue[] | null;
  /** Cached settings to avoid loadSettings() in hot paths */
  cachedSettings: Awaited<ReturnType<typeof loadSettings>> | null;
  /** Active track identity (language + URL) for race condition prevention */
  activeTrackIdentity: string | null;
  /** URLs already fetched via selectSubtitleTrack (dedup with interceptor flow) */
  fetchedTrackUrls: Set<string>;
}

const state: CoordinatorState = {
  isOverlayMode: false,
  dragCleanup: null,
  availableTracks: [],
  navigationEpoch: 0,
  discoverDebounceTimer: null,
  domDiscoverDebounceTimer: null,
  videoIsPlaying: false,
  categoryOverride: undefined,
  activeSubtitleSessionId: null,
  captionHideStyle: null,
  domOriginalCues: [],
  domTranslatedCues: [],
  domTranslatedTexts: new Set(),
  domTranslationMap: new Map(),
  translatedCues: null,
  cachedSettings: null,
  activeTrackIdentity: null,
  fetchedTrackUrls: new Set(),
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

/** Inject a <style> hiding the platform's native caption window.
 *  Uses display:none to fully remove from layout (opacity:0 fallback
 *  if display:none causes layout shift issues on specific platforms). */
function hideNativeCaptions(selector: string): void {
  if (state.captionHideStyle) return;
  const style = document.createElement('style');
  style.setAttribute('data-anyllm-role', 'caption-hide');
  // Use display:none for most platforms — fully removes caption from layout.
  // The !important ensures platform CSS doesn't override our hiding rule.
  style.textContent = `${selector} { display: none !important; }`;
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

  // Pass enableContextAwareTranslation (not the LLM toggle) so the cheap
  // heuristic domain-map detection runs whenever context-aware translation is
  // on, regardless of whether LLM-based detection is enabled. The expensive
  // LLM detection is gated separately via triggerAutoCategoryDetection below.
  const pageContext = extractPageContext(document, settings.enableContextAwareTranslation);

  // Delegate detection to the shared helper, which guards on disabled detection /
  // existing override / existing autoDetected / in-flight, then writes the result
  // into the shared singleton + broadcasts to the popup via the onDetected callback.
  await triggerAutoCategoryDetection(
    settings,
    state.categoryOverride,
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

  // Task 6.3: Deduplicate with auto-activate (fetch) flow
  if (state.fetchedTrackUrls.has(url)) {
    console.log('AnyLLMTranslate: Skipping intercepted URL — already fetched via selectSubtitleTrack', { url });
    sendTranslatedSubtitle({ requestId, vttContent: body });
    return;
  }

  try {
    // Task 6.1: Use cached settings in hot path, fall back to loadSettings
    const settings = state.cachedSettings ?? await loadSettings();
    if (!state.cachedSettings) state.cachedSettings = settings;
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

    // Task 6.2: Track identity guard — cancel previous session if track changed
    const trackIdentity = `${originalLanguage}:${url}`;
    if (state.activeTrackIdentity !== null && state.activeTrackIdentity !== trackIdentity) {
      console.log('AnyLLMTranslate: Track changed, resetting previous session', {
        previous: state.activeTrackIdentity,
        current: trackIdentity,
      });
      cleanupActiveOverlay();
      state.translatedCues = null;
    }
    state.activeTrackIdentity = trackIdentity;

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

    // Task 6.4: Don't blank native subtitles until translation succeeds.
    // If translation fails, we send the original body back so native subtitles continue.
    // The overlay shows original cues on top while waiting — temporary duplication
    // is acceptable and better than blanking native subtitles before we know translation works.

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
      profile: currentSubtitleProfile(),
    }) as { success: boolean; cues?: SubtitleCue[]; error?: string; sessionId?: number };

    if (!response?.success || !response.cues) {
      console.warn('AnyLLMTranslate: Translation failed', response?.error);
      // Task 6.4: Restore native subtitles on failure — send original body back
      sendTranslatedSubtitle({ requestId, vttContent: body });
      cleanupActiveOverlay();
      hideSubtitleToast();
      showSubtitleToast('Subtitle translation failed.');
      return;
    }

    // Translation succeeded — now blank native subtitles (overlay takes over)
    sendTranslatedSubtitle({ requestId, vttContent: 'WEBVTT\n\n' });

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
    // Task 6.4: Restore native subtitles on error — send original body back
    sendTranslatedSubtitle({ requestId, vttContent: body });
    cleanupActiveOverlay();
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
      profile: currentSubtitleProfile(),
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
      profile: currentSubtitleProfile(),
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

/** Clear DOM-platform translation buffers without tearing down the overlay shell. */
function clearDomTranslationBuffers(): void {
  state.domOriginalCues = [];
  state.domTranslatedCues = [];
  state.domTranslatedTexts = new Set();
  state.domTranslationMap = new Map();
  state.activeSubtitleSessionId = null;
}

/**
 * Reset coordinator state when Max subtitle track changes mid-session.
 */
async function handleDomTrackChanged(_payload: SubtitleDomTrackChangedPayload): Promise<void> {
  console.log('AnyLLMTranslate: DOM subtitle track changed — clearing translation state');
  cancelBackgroundSubtitleSession();
  clearDomTranslationBuffers();
  if (state.isOverlayMode) {
    updateCues([]);
  }
  scheduleDomTrackDiscovery();
}

const DOM_TRACK_DISCOVER_DEBOUNCE_MS = 300;

/** Debounced scrape of Max track buttons → SUBTITLE_TRACKS_AVAILABLE. */
function scheduleDomTrackDiscovery(): void {
  if (state.domDiscoverDebounceTimer !== null) {
    clearTimeout(state.domDiscoverDebounceTimer);
  }
  state.domDiscoverDebounceTimer = setTimeout(() => {
    state.domDiscoverDebounceTimer = null;
    void discoverDomSubtitleTracks();
  }, DOM_TRACK_DISCOVER_DEBOUNCE_MS);
}

async function discoverDomSubtitleTracks(): Promise<void> {
  if (!isOnWatchPage()) return;
  const handler = detectCurrentHandler();
  if (!handler?.getDomCueSource?.() || !handler.extractAvailableTracks) return;

  const tracks = handler.extractAvailableTracks('', 'application/json', '');
  if (tracks.length === 0) return;

  await processTracksDiscovered({
    platform: handler.platform,
    tracks,
    videoId: tracks[0]?.videoId,
  });
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

  // Task 6.1: Use cached settings in hot path
  const settings = state.cachedSettings ?? await loadSettings();
  if (!state.cachedSettings) state.cachedSettings = settings;
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
        // P1: sendMessage can invoke the callback with `undefined` when no
        // listener handled the message (e.g. service worker asleep / evicted).
        // Accessing `response.error` on undefined throws a TypeError that rejects
        // the promise as an unhandled rejection instead of a clean error.
        if (!response) {
          reject(new Error('No response from background'));
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
  state.translatedCues = cues;
  updateCues(cues);
}

/**
 * Merge a translated chunk into the existing translated cues array at the given offset.
 * Called when background sends chunk deltas (SUBTITLE_CHUNK_TRANSLATED with chunkStart).
 */
function mergeTranslatedChunk(chunkStart: number, chunkCues: SubtitleCue[]): void {
  if (!state.isOverlayMode) {
    console.warn('AnyLLMTranslate: Cannot merge chunk - not in overlay mode');
    return;
  }
  // Get current translated cues from the overlay, merge chunk, and update
  const currentCues = state.translatedCues
    ? [...state.translatedCues]
    : new Array<SubtitleCue>(chunkStart + chunkCues.length);
  // Ensure array is large enough
  const needed = chunkStart + chunkCues.length;
  if (currentCues.length < needed) {
    currentCues.length = needed;
  }
  // Merge chunk at offset
  for (let j = 0; j < chunkCues.length; j++) {
    currentCues[chunkStart + j] = chunkCues[j];
  }
  state.translatedCues = currentCues;
  updateCues(currentCues);
}

/**
 * Clear a pending request timeout to prevent spurious overlay activation.
 * Called when translation completes successfully.
 * NOTE: The pendingRequests Map was removed (it was never populated via .set()).
 * This function is kept as a no-op export for backward compatibility with tests.
 */
export function clearPendingRequest(_requestId: string): void {
  // No-op — pendingRequests Map was dead code (.set() was never called).
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
      // P1: cancel the pending proactive-category-detection timer so it doesn't
      // fire against the new page's context after the reset. Cleared here (not
      // in resetCoordinatorState) because resetCoordinatorState runs in many
      // test beforeEach setups under fake timers and clearing there breaks them.
      if (proactiveCategoryDetectionTimer !== null) {
        clearTimeout(proactiveCategoryDetectionTimer);
        proactiveCategoryDetectionTimer = null;
      }
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

/** Debounce timer for proactive category detection on watch pages. */
let proactiveCategoryDetectionTimer: ReturnType<typeof setTimeout> | null = null;

/** Schedule a debounced proactive LLM category detection on subtitle watch pages.
 *  No-ops (via triggerAutoCategoryDetection's guards) when not applicable: non-watch
 *  page, disabled detection, existing override, existing autoDetected, or already
 *  in flight. Debounced so page metadata (title/meta) can settle before extraction. */
function scheduleProactiveCategoryDetection(): void {
  if (proactiveCategoryDetectionTimer) {
    clearTimeout(proactiveCategoryDetectionTimer);
  }
  proactiveCategoryDetectionTimer = setTimeout(() => {
    proactiveCategoryDetectionTimer = null;
    if (!isOnWatchPage()) return;
    void (async () => {
      const settings = await loadSettings();
      if (!settings.enableContextAwareTranslation) return;
      if (!settings.enableLLMPageCategoryDetection) return;
      // state.categoryOverride and the singleton are checked inside the helper.
      await triggerAutoCategoryDetection(settings, state.categoryOverride, (cat) => {
        setAutoDetectedCategory(cat);
        broadcastCategoryInfo(settings, state.categoryOverride);
      });
    })();
  }, 1500);
}

/**
 * Start the subtitle coordinator.
 * Returns a cleanup function.
 */
export function startCoordinator(): () => void {
  console.log('AnyLLMTranslate: Starting subtitle coordinator');

  // Task 6.1: Settings are cached lazily in hot paths (handleIntercepted, handleDomCues).
  // Refresh cache on settings changes.
  const settingsChangeListener = () => {
    loadSettings().then((s) => { state.cachedSettings = s; }).catch(() => {});
  };
  try { chrome.storage.onChanged.addListener(settingsChangeListener); } catch { /* tests may not mock */ }

  // Send SUBTITLE_CONFIG to MAIN world interceptors with the timeout setting
  loadSettings().then((s) => {
    try {
      window.postMessage({
        type: 'SUBTITLE_CONFIG',
        channel: 'anyllm-translate',
        requestId: `config-${Date.now()}`,
        payload: { translationTimeoutMs: (s.subtitleSettings.translationTimeout ?? 30) * 1000 },
      }, window.location.origin);
    } catch { /* ignore */ }
  }).catch(() => {});


  // Proactive LLM category detection on watch pages: fire once, debounced, so
  // the popup shows a detected category before the user presses play. The
  // trigger helper no-ops when not applicable, so this is safe to schedule always.
  scheduleProactiveCategoryDetection();

  // Listen for intercepted subtitles
  const cleanupBridge = onSubtitleIntercepted(handleIntercepted);

  // Listen for track discovery from MAIN world
  const cleanupDiscovery = onTracksDiscovered(handleTracksDiscovered);

  // Listen for DOM-scraped cues from MAIN world (Max)
  const cleanupDomCues = onDomCues(handleDomCues);

  const cleanupDomTrackChanged = onDomTrackChanged(handleDomTrackChanged);

  // Proactive DOM track list for popup (Max has no metadata URLs)
  scheduleDomTrackDiscovery();

  // Watch for SPA navigations to reset per-video state
  const cleanupNavWatcher = startSpaNavigationWatcher();

  // Watch for video play events — the ONLY trigger for auto-activate
  const cleanupPlaybackWatcher = startVideoPlaybackWatcher();

  // Listen for progressive chunk updates from background
  const handleExtensionMessage = (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    _sendResponse: (response?: unknown) => void
  ) => {
    const msg = message as { action?: string; cues?: SubtitleCue[]; chunkStart?: number; chunkCues?: SubtitleCue[]; language?: string };
    if (msg.action === 'SUBTITLE_CHUNK_TRANSLATED') {
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
      // Handle chunk delta format (chunkStart + chunkCues)
      if (msg.chunkCues && msg.chunkStart !== undefined) {
        mergeTranslatedChunk(msg.chunkStart, msg.chunkCues);
      } else if (msg.cues) {
        // Fallback: full array format (backward compat)
        updateTranslatedCues(msg.cues);
      }
    }
    // Handle popup requesting subtitle track selection
    if (msg.action === 'SELECT_SUBTITLE_TRACK' && msg.language) {
      selectSubtitleTrack(msg.language);
      _sendResponse({ success: true });
    }
    // Handle popup querying available tracks — use sendResponse directly
    if (msg.action === 'GET_AVAILABLE_TRACKS') {
      _sendResponse({ tracks: state.availableTracks });
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
    cleanupDomTrackChanged();
    cleanupNavWatcher();
    cleanupPlaybackWatcher();
    chrome.runtime.onMessage.removeListener(handleExtensionMessage);
    try { chrome.storage.onChanged.removeListener(settingsChangeListener); } catch { /* tests */ }

    if (state.discoverDebounceTimer !== null) {
      clearTimeout(state.discoverDebounceTimer);
      state.discoverDebounceTimer = null;
    }
    if (state.domDiscoverDebounceTimer !== null) {
      clearTimeout(state.domDiscoverDebounceTimer);
      state.domDiscoverDebounceTimer = null;
    }

    if (proactiveCategoryDetectionTimer !== null) {
      clearTimeout(proactiveCategoryDetectionTimer);
      proactiveCategoryDetectionTimer = null;
    }

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
  state.activeTrackIdentity = null;
  state.fetchedTrackUrls.clear();
  state.translatedCues = null;
  state.cachedSettings = null;
  if (state.discoverDebounceTimer !== null) {
    clearTimeout(state.discoverDebounceTimer);
    state.discoverDebounceTimer = null;
  }
  if (state.domDiscoverDebounceTimer !== null) {
    clearTimeout(state.domDiscoverDebounceTimer);
    state.domDiscoverDebounceTimer = null;
  }
  if (state.dragCleanup) {
    state.dragCleanup();
    state.dragCleanup = null;
  }
  // NOTE: proactive-category-detection timer clearing is handled inside
  // scheduleProactiveCategoryDetection() (idempotent re-schedule) rather than
  // here, to avoid interfering with fake-timer-based unit tests that rely on
  // the timer surviving resetCoordinatorState.
  clearHoverCache();
  clearTranslatedSections();
  restoreNativeCaptions();
  clearDomTranslationBuffers();
}

/**
 * Detect if current page is a video watch page (not a listing/home page).
 * Guards against auto-activate firing on YouTube home, search, etc.
 * Delegates to the current handler's isWatchPage() when available.
 */
export function isOnWatchPage(): boolean {
  // Prefer handler-specific watch page detection
  const handler = detectCurrentHandler();
  if (handler?.isWatchPage) {
    return handler.isWatchPage();
  }

  const { pathname, hostname } = window.location;

  // Fallback for handlers without isWatchPage — use strict explicit matching.
  if (hostname.includes('youtube.com')) {
    return pathname === '/watch';
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
export async function tryAutoActivateForDom(options?: {
  manual?: boolean;
}): Promise<{ activated: boolean; reason: string }> {
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
  if (!settings.subtitleSettings.enabled) {
    return { activated: false, reason: 'subtitles disabled' };
  }
  if (!options?.manual && !settings.subtitleSettings.autoActivateSubtitles) {
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
  if (
    !options?.manual &&
    preferred &&
    preferred !== 'auto' &&
    activeLang !== preferred
  ) {
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

  // Watch for dynamically added videos (e.g. YouTube player loads after page).
  // Filter mutations to only scan when added nodes could contain <video> elements,
  // avoiding a full scanForVideos on every text/style/class change.
  const observer = new MutationObserver((mutations) => {
    let needsScan = false;
    for (const mutation of mutations) {
      if (mutation.type !== 'childList') continue;
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLVideoElement) {
          needsScan = true;
          break;
        }
        if (node instanceof Element && node.querySelector('video')) {
          needsScan = true;
          break;
        }
      }
      if (needsScan) break;
    }
    if (needsScan) scanForVideos();
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
  const handler = detectCurrentHandler();
  if (handler?.getDomCueSource) {
    if (!track) {
      console.warn('AnyLLMTranslate: No DOM track metadata for', language);
      return;
    }
    console.log('AnyLLMTranslate: DOM platform track selected — awaiting cues', { language });
    await tryAutoActivateForDom({ manual: true });
    return;
  }
  if (!track?.url) {
    console.warn('AnyLLMTranslate: No URL for track', language);
    return;
  }

  console.log('AnyLLMTranslate: Selecting subtitle track', { language, url: track.url });
  // Task 6.3: Record fetched URL to deduplicate with interceptor flow
  state.fetchedTrackUrls.add(track.url);
  await activateOverlayMode(track.url);
}

/**
 * Manual subtitle activation (Alt+S, context menu). Uses DOM path when the
 * current handler has no VTT URL.
 */
export async function manualActivateSubtitles(): Promise<void> {
  const handler = detectCurrentHandler();
  if (handler?.getDomCueSource) {
    await tryAutoActivateForDom({ manual: true });
    return;
  }

  const tracks = getAvailableTracks();
  if (tracks.length === 0) {
    console.warn('AnyLLMTranslate: No subtitle tracks available for manual activation');
    return;
  }

  const settings = await loadSettings();
  const preferredLang = settings.subtitleSettings?.preferredSubtitleLanguage;
  const preferred = tracks.find((t) => t.language === preferredLang);
  const trackToSelect = preferred ?? tracks[0];
  if (trackToSelect) {
    await selectSubtitleTrack(trackToSelect.language);
  }
}

/**
 * Get all discovered subtitle tracks.
 */
export function getAvailableTracks(): AvailableSubtitleTrack[] {
  return [...state.availableTracks];
}
