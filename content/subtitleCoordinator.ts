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
  onTextTrackCues,
  onMseCues,
  onManifestCues,
  onMpdProcessing,
} from '@/content/messageBridge';
import { sendMessage } from '@/inject/messageBridge';
import { getOverlayTextContainer } from '@/content/subtitleOverlay';
import { createRenderer, type SubtitleRenderer } from '@/content/subtitleRenderer';
import { clearHoverCache } from '@/content/hoverTranslate';
import { clearTranslatedSections } from '@/content/sectionTranslate';
import { showSubtitleToast, hideSubtitleToast } from '@/content/subtitleToast';
import { updateMiniProgress, hideMiniProgress } from '@/content/miniProgress';
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
  SubtitleTextTrackCuesPayload,
  SubtitleMseCuesPayload,
  SubtitleManifestCuesPayload,
} from '@/types/subtitle';
import type { PageContext, SubtitleSettings } from '@/types/config';
import type { OverlayConfig } from '@/content/subtitleOverlay';
import { extractPageContext, resolveCategory, triggerAutoCategoryDetection } from '@/content/utils/pageContext';
import {
  broadcastCategoryInfo,
  getAutoDetectedCategory,
  invalidateCategoryIfUrlChanged,
  _resetCategoryState,
} from '@/content/categoryState';
import { findMatchingRule } from '@/lib/siteRules';
import { isSiteDisabled } from '@/lib/subtitleSites';
import { resolveProfile, type SubtitleProfile, type ProfileKnobs } from '@/lib/subtitleProfiles';
import { adaptCueTimings } from '@/lib/subtitleTiming';
import { subtitleLanguagesMatch } from '@/lib/subtitleLanguageMatch';
import { SUBTITLE_CHUNK_SIZE } from '@/lib/constants';
import { findPrimaryVideo } from '@/lib/findPrimaryVideo';
import {
  reconcilePendingTranslatedTexts,
  sortCueTextsByPlaybackPriority,
} from '@/lib/subtitleTranslationPriority';
import {
  applyYoutubeAsrResegment,
  isYoutubeAsrUrl,
  prepareYoutubeAsrAiInput,
} from '@/lib/youtubeAsrResegment';
import {
  buildAsrRealignCacheKey,
  extractYoutubeVideoIdFromUrl,
  hashAsrRealignContent,
  stripYoutubeTitleSuffix,
  youtubeThumbnailUrl,
  youtubeWatchUrl,
} from '@/lib/youtubeAsrRealignCache';
import { buildJson3TimedtextUrl } from '@/lib/youtubeWatchPage';
import type {
  AsrRealignProgressMessage,
  GetAsrRealignCacheResult,
  ResegmentYoutubeAsrResult,
} from '@/types/messages';

/** Resolve the subtitle profile for the current page from its hostname.
 *  Called per outbound translateSubtitle message; resolveProfile is a cheap
 *  map lookup, so no caching needed. */
function currentSubtitleProfile(): SubtitleProfile {
  return resolveProfile(window.location.hostname);
}

/** Source tier precedence rank (lower = higher priority). Used by shouldSuppressSource(). */
const SOURCE_RANK: Record<string, number> = {
  manifest: 0,
  texttrack: 1,
  mse: 2,
  dom: 3,
};

/** Wait for Max MPD fetch/parse before falling back to DOM cues on play. */
const MAX_MPD_DOM_GRACE_MS = 8000;
/** Force DOM fallback if MPD stays in-flight (segment fetch) beyond this. */
const MAX_MPD_IN_FLIGHT_CAP_MS = 15_000;

/** True when the current page uses HBO Max DASH MPD subtitle discovery (Tier 2). */
function hbomaxUsesMpdSubtitlePipeline(): boolean {
  const handler = detectCurrentHandler();
  if (!handler || handler.platform !== 'hbomax') return false;
  return (
    typeof handler.getManifestPatterns === 'function' &&
    handler.getManifestPatterns().length > 0
  );
}

/** Start (or extend) the DOM deferral window while Max MPD may still deliver cues.
 *  Does not set mpdProcessingInFlight — only SUBTITLE_MPD_PROCESSING started does. */
function armMpdDomGraceWindow(): void {
  const until = Date.now() + MAX_MPD_DOM_GRACE_MS;
  if (until > state.mpdGraceUntil) {
    state.mpdGraceUntil = until;
  }
}

/**
 * Check whether a new source tier should be suppressed by the currently active source.
 * Returns true if the new source is lower-precedence than the active one.
 *
 * Complete full-file cues (intercepted or directly fetched) are higher
 * fidelity than DOM/MSE/TextTrack scrapers: once `interceptOriginalCues` is
 * populated, lower tiers must not clobber the overlay or spawn competing
 * translation sessions.
 */
function shouldSuppressSource(newSource: 'manifest' | 'texttrack' | 'mse' | 'dom'): boolean {
  if (state.interceptOriginalCues.length > 0 && newSource !== 'manifest') {
    return true;
  }
  if (!state.activeSource) return false;
  return SOURCE_RANK[newSource] > SOURCE_RANK[state.activeSource];
}

/**
 * Whether the intercepted body is ASS/SSA. Used to avoid rewriting ASS
 * responses as empty WEBVTT (Youku's player crashes: missing Dialogue).
 */
function isAssSubtitleBody(body: string): boolean {
  const stripped = body.replace(/^\uFEFF/, '').trim();
  return /^\[Script Info\]/im.test(stripped) || /^Dialogue:/im.test(stripped);
}

/**
 * Minimal valid ASS with zero Dialogue events. Youku's ASS.js parser requires
 * a real Events section (empty WEBVTT crashes with "reading 'Dialogue'"); an
 * empty-but-valid ASS file keeps the player alive while showing nothing so
 * our overlay owns the captions.
 */
const EMPTY_ASS_BODY = `[Script Info]
Title: AnyLLMTranslate
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

/**
 * Body to return to the player after successful intercept-path translation.
 * - VTT / generic: empty WEBVTT blanks the native track.
 * - ASS/SSA: empty-but-valid ASS (never WEBVTT — breaks Youku KUI ASS parser).
 *   Returning the original ASS would re-show native Dialogue under the overlay.
 */
function blankNativeSubtitleBody(body: string): string {
  return isAssSubtitleBody(body) ? EMPTY_ASS_BODY : 'WEBVTT\n\n';
}

/**
 * Content script-owned session ids for intercept/translate requests.
 * Pre-assigning before `await translateSubtitle` lets progressive chunks that
 * race ahead of the first-chunk response match `activeSubtitleSessionId`
 * instead of being dropped as stale (null !== sessionId).
 */
let nextContentSubtitleSessionId = 1;
/** Monotonic request ids and the latest valid direct full-file activation. */
let nextDirectFullTrackActivationGeneration = 1;
let activeDirectFullTrackActivationGeneration = 0;

/**
 * Revoke every direct full-track activation that started before a higher-tier
 * source took ownership, including activations still awaiting UI setup and
 * therefore not represented by an active translation session yet.
 */
function invalidateDirectFullTrackActivations(): void {
  activeDirectFullTrackActivationGeneration = nextDirectFullTrackActivationGeneration++;
}

function allocateSubtitleSessionId(): number {
  return nextContentSubtitleSessionId++;
}

/** Reset the active source (e.g. on track switch / seek) to allow re-resolution. */
function resetActiveSource(): void {
  state.activeSource = null;
}

/** True when URL is the top-level DASH manifest (not a leaf subtitle segment). */
function isRootDashManifestUrl(url: string): boolean {
  const lower = url.toLowerCase().split('?')[0].split('#')[0];
  if (lower.endsWith('.vtt') || lower.endsWith('.ttml')) return false;
  if (lower.endsWith('.mpd')) return true;
  try {
    const parsed = new URL(url);
    if (!/(?:^|\.)prd\.media\.max\.com$/i.test(parsed.hostname)) return false;
    if (!parsed.search.includes('manifest-params')) return false;
    const pathSegments = parsed.pathname.split('/').filter(Boolean);
    return pathSegments.length === 1;
  } catch {
    return false;
  }
}

function mpdInFlightExceededCap(): boolean {
  if (!state.mpdProcessingInFlight || state.mpdProcessingStartedAt === 0) return false;
  return Date.now() - state.mpdProcessingStartedAt > MAX_MPD_IN_FLIGHT_CAP_MS;
}

function clearMpdDomFallbackTimer(): void {
  if (state.mpdDomFallbackTimer !== null) {
    clearTimeout(state.mpdDomFallbackTimer);
    state.mpdDomFallbackTimer = null;
  }
}

function shouldDeferDomForMpd(): boolean {
  if (mpdInFlightExceededCap()) {
    state.mpdProcessingInFlight = false;
    state.mpdGraceUntil = 0;
    return false;
  }
  if (state.mpdProcessingInFlight) return true;
  return Date.now() < state.mpdGraceUntil;
}

function scheduleMpdDomFallbackRetry(): void {
  if (state.isOverlayMode || state.activeSource === 'manifest') return;
  if (!state.pendingDomCuesPayload) return;
  clearMpdDomFallbackTimer();
  const delay = state.mpdProcessingInFlight
    ? Math.min(
      MAX_MPD_IN_FLIGHT_CAP_MS,
      Math.max(500, state.mpdGraceUntil - Date.now()),
    )
    : Math.max(0, state.mpdGraceUntil - Date.now());
  state.mpdDomFallbackTimer = setTimeout(() => {
    state.mpdDomFallbackTimer = null;
    void flushPendingDomCuesAfterMpd();
  }, delay + 50);
}

async function flushPendingDomCuesAfterMpd(): Promise<void> {
  if (state.isOverlayMode || state.activeSource === 'manifest') {
    state.pendingDomCuesPayload = null;
    return;
  }
  if (shouldDeferDomForMpd()) {
    scheduleMpdDomFallbackRetry();
    return;
  }
  const payload = state.pendingDomCuesPayload;
  if (!payload || payload.cues.length === 0) return;
  state.pendingDomCuesPayload = null;
  console.log('AnyLLMTranslate: Max MPD did not activate overlay — using DOM subtitles');
  await handleDomCues(payload);
}

function handleMpdProcessing(payload: { status: string; success?: boolean }): void {
  if (payload.status === 'started') {
    state.mpdProcessingInFlight = true;
    state.mpdProcessingStartedAt = Date.now();
    state.mpdGraceUntil = Date.now() + MAX_MPD_DOM_GRACE_MS;
    return;
  }
  state.mpdProcessingInFlight = false;
  state.mpdProcessingStartedAt = 0;
  if (payload.success) {
    state.mpdGraceUntil = 0;
    state.pendingDomCuesPayload = null;
    clearMpdDomFallbackTimer();
    return;
  }
  state.mpdGraceUntil = 0;
  void flushPendingDomCuesAfterMpd();
}

async function waitForMpdGraceIfNeeded(): Promise<void> {
  while (state.mpdProcessingInFlight || Date.now() < state.mpdGraceUntil) {
    if (state.activeSource === 'manifest' && state.isOverlayMode) return;
    await new Promise((r) => setTimeout(r, 200));
  }
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
  /** Temporary tab-scoped translation-knob override from popup (resets on reload/nav). */
  subtitleKnobOverride: Partial<ProfileKnobs> | undefined;
  /** Active subtitle session ID — stale chunks with different IDs are dropped */
  activeSubtitleSessionId: number | null;
  /** Active subtitle source tier — first full-track source to resolve wins (precedence: manifest > texttrack > mse > dom) */
  activeSource: 'manifest' | 'texttrack' | 'mse' | 'dom' | null;
  /** Active subtitle renderer (native TextTrack or overlay fallback). Null until first init. */
  activeRenderer: SubtitleRenderer | null;
  /** Video element currently owned by the renderer. */
  rendererVideo: HTMLVideoElement | null;
  /** Latest cue/config snapshot used when a player mounts late. */
  rendererCues: SubtitleCue[] | null;
  rendererConfig: Partial<OverlayConfig> | null;
  /** Pending dynamic-player attachment lifecycle. */
  rendererRetryCleanup: (() => void) | null;
  rendererRetryTimer: ReturnType<typeof setTimeout> | null;
  rendererAttachPromise: Promise<boolean> | null;
  /** HTML5 tracks changed from showing to hidden by this coordinator. */
  hiddenHtml5Tracks: Set<TextTrack>;
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
  /**
   * Full-file path: parsed cues from an intercepted subtitle body or a directly
   * fetched subtitle URL. Because the whole track is available upfront, any
   * in-range seek keeps these cues and the active translation session valid.
   */
  interceptOriginalCues: SubtitleCue[];
  /** Manifest-platform (HBOMax progressive VTT): rolling original (source) cues from capture */
  manifestOriginalCues: SubtitleCue[];
  /** Manifest-platform: rebuilt bilingual cues shown in the overlay (originalText + translated/fallback) */
  manifestTranslatedCues: SubtitleCue[];
  /** Manifest-platform: set of original cue texts already sent for translation (dedup) */
  manifestTranslatedTexts: Set<string>;
  /** Manifest-platform: persistent map of originalText → translatedText across appended segments */
  manifestTranslationMap: Map<string, string>;
  /** Translated cues array (merged from chunk deltas) for overlay display */
  translatedCues: SubtitleCue[] | null;
  /** Cached settings to avoid loadSettings() in hot paths */
  cachedSettings: Awaited<ReturnType<typeof loadSettings>> | null;
  /** Active track identity (language + URL) for race condition prevention */
  activeTrackIdentity: string | null;
  /** URLs already fetched via selectSubtitleTrack (dedup with interceptor flow) */
  fetchedTrackUrls: Set<string>;
  /** YouTube timedtext URLs for which the native-player fallback was requested. */
  youtubeCaptionFallbackUrls: Set<string>;
  /** True while MAIN-world Max MPD processor is fetching/parsing */
  mpdProcessingInFlight: boolean;
  /** DOM tier deferred until this timestamp (ms) while MPD may still succeed */
  mpdGraceUntil: number;
  /** Timestamp when SUBTITLE_MPD_PROCESSING started (for in-flight cap). */
  mpdProcessingStartedAt: number;
  /** Latest DOM cue batch held while MPD may still win (Max). */
  pendingDomCuesPayload: SubtitleDomCuesPayload | null;
  /** One-shot timer to activate DOM after grace when MPD does not deliver. */
  mpdDomFallbackTimer: ReturnType<typeof setTimeout> | null;
  /** Playback time captured on seek — anchors translation priority until the next segment. */
  playbackAnchorTime: number | null;
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
  subtitleKnobOverride: undefined,
  activeSubtitleSessionId: null,
  activeSource: null,
  activeRenderer: null,
  rendererVideo: null,
  rendererCues: null,
  rendererConfig: null,
  rendererRetryCleanup: null,
  rendererRetryTimer: null,
  rendererAttachPromise: null,
  hiddenHtml5Tracks: new Set(),
  captionHideStyle: null,
  domOriginalCues: [],
  domTranslatedCues: [],
  domTranslatedTexts: new Set(),
  domTranslationMap: new Map(),
  interceptOriginalCues: [],
  manifestOriginalCues: [],
  manifestTranslatedCues: [],
  manifestTranslatedTexts: new Set(),
  manifestTranslationMap: new Map(),
  translatedCues: null,
  cachedSettings: null,
  activeTrackIdentity: null,
  fetchedTrackUrls: new Set(),
  youtubeCaptionFallbackUrls: new Set(),
  mpdProcessingInFlight: false,
  mpdGraceUntil: 0,
  mpdProcessingStartedAt: 0,
  pendingDomCuesPayload: null,
  mpdDomFallbackTimer: null,
  playbackAnchorTime: null,
};

/** Current video time for translation ordering (seek anchor wins over live time). */
function getPlaybackTimeForTranslation(): number {
  if (state.playbackAnchorTime !== null) {
    return state.playbackAnchorTime;
  }
  const video = document.querySelector('video');
  if (video && Number.isFinite(video.currentTime)) {
    return video.currentTime;
  }
  return 0;
}

function resolveSubtitleFontFamily(fontFamily: SubtitleSettings['fontFamily'] | undefined): string {
  const fontFamilyMap: Record<SubtitleSettings['fontFamily'], string> = {
    serif: 'Georgia, serif',
    monospace: 'monospace',
    system: 'system-ui, sans-serif',
  };
  return fontFamilyMap[fontFamily ?? 'system'] ?? 'system-ui, sans-serif';
}

/** Tear down the active renderer and forget its video ownership. */
function destroyRenderer(): void {
  state.activeRenderer?.destroy();
  state.activeRenderer = null;
  state.rendererVideo = null;
}

function cleanupRendererAttachmentRetry(): void {
  state.rendererRetryCleanup?.();
}

async function attachRendererNow(
  cues: SubtitleCue[],
  config: Partial<OverlayConfig>,
  video: HTMLVideoElement,
): Promise<boolean> {
  if (state.rendererVideo && state.rendererVideo !== video) {
    destroyRenderer();
  }

  if (state.activeRenderer && state.rendererVideo === video) {
    state.activeRenderer.updateCues(cues);
    return true;
  }

  const renderer = state.activeRenderer ?? createRenderer(video);
  state.activeRenderer = renderer;
  const attached = await renderer.initialize(cues, config, video);
  if (!attached) {
    destroyRenderer();
    return false;
  }

  state.rendererVideo = video;
  return true;
}

async function initializeActiveRenderer(
  cues: SubtitleCue[],
  config: Partial<OverlayConfig>,
): Promise<boolean> {
  state.rendererCues = cues;
  state.rendererConfig = config;
  if (state.rendererAttachPromise) return state.rendererAttachPromise;

  const video = findPrimaryVideo();
  if (!video) return false;

  const attachPromise = attachRendererNow(cues, config, video).then((attached) => {
    if (!attached) return false;

    hideHtml5TextTracks();
    const textContainer = getOverlayTextContainer();
    if (textContainer && !state.dragCleanup) {
      state.dragCleanup = enableDragReposition(textContainer);
    }
    cleanupRendererAttachmentRetry();
    return true;
  }).finally(() => {
    if (state.rendererAttachPromise === attachPromise) {
      state.rendererAttachPromise = null;
    }
  });
  state.rendererAttachPromise = attachPromise;
  return attachPromise;
}

function updateActiveRendererCues(cues: SubtitleCue[]): void {
  state.rendererCues = cues;
  if (state.activeRenderer && state.rendererVideo) {
    state.activeRenderer.updateCues(cues);
    return;
  }
  if (state.isOverlayMode && state.rendererConfig) {
    void initializeActiveRenderer(cues, state.rendererConfig).then((attached) => {
      if (!attached) scheduleRendererAttachmentRetry();
    });
  }
}

function scheduleRendererAttachmentRetry(): void {
  if (
    state.rendererRetryCleanup ||
    !state.rendererCues ||
    !state.rendererConfig
  ) {
    return;
  }

  const attempt = (): void => {
    const cues = state.rendererCues;
    const config = state.rendererConfig;
    if (!cues || !config) return;
    void initializeActiveRenderer(cues, config).then((attached) => {
      if (attached) cleanupRendererAttachmentRetry();
    });
  };
  const onMediaReady = (): void => attempt();
  const mediaEvents = ['loadedmetadata', 'canplay', 'play'] as const;
  for (const eventName of mediaEvents) {
    document.addEventListener(eventName, onMediaReady, true);
  }
  const observer = new MutationObserver(() => attempt());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  const timer = setTimeout(() => cleanupRendererAttachmentRetry(), 10_000);

  state.rendererRetryTimer = timer;
  state.rendererRetryCleanup = () => {
    for (const eventName of mediaEvents) {
      document.removeEventListener(eventName, onMediaReady, true);
    }
    observer.disconnect();
    clearTimeout(timer);
    state.rendererRetryTimer = null;
    state.rendererRetryCleanup = null;
  };
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
  if (state.activeSubtitleSessionId !== null) {
    cancelBackgroundSubtitleSession();
  }
  cleanupRendererAttachmentRetry();
  if (state.dragCleanup) {
    state.dragCleanup();
    state.dragCleanup = null;
  }
  if (state.isOverlayMode) {
    destroyRenderer();
    state.isOverlayMode = false;
  }
  state.rendererCues = null;
  state.rendererConfig = null;
  restoreHtml5TextTracks();
  restoreNativeCaptions();
  state.activeSubtitleSessionId = null;
  state.translatedCues = null;
  state.activeSource = null;
  // Drop the full-file cue cache: the overlay is gone, and any future
  // intercepted or directly fetched track repopulates it with parsed cues.
  state.interceptOriginalCues = [];
}

/** Inject a <style> hiding the platform's native caption window.
 *  - `method: 'display'` (default): `display: none !important` — fully removes
 *    the caption from layout. Correct when the platform keeps populating the
 *    node while hidden (HBO Max's React renderer writes to a child regardless).
 *  - `method: 'visibility'`: `visibility: hidden !important` — preserves box
 *    geometry and keeps the caption renderer producing cues. REQUIRED for
 *    platforms that stop populating a `display:none` container (Youku's KUI
 *    player), or when the hide target is the cue source itself
 *    (cueSelector === captionWindowSelector). */
function hideNativeCaptions(selector: string, method: 'display' | 'visibility' = 'display'): void {
  if (state.captionHideStyle) return;
  const style = document.createElement('style');
  style.setAttribute('data-anyllm-role', 'caption-hide');
  const rule = method === 'visibility'
    ? `${selector} { visibility: hidden !important; }`
    : `${selector} { display: none !important; }`;
  style.textContent = rule;
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

/** Apply native caption hide from DomCueSource or handler.getNativeCaptionHide() (WeTV). */
function applyNativeCaptionHideForHandler(handler: ReturnType<typeof getHandlerByPlatform>): void {
  if (!handler) return;
  const domSource = handler.getDomCueSource?.();
  if (domSource) {
    hideNativeCaptions(domSource.captionWindowSelector, domSource.captionHideMethod ?? 'display');
    return;
  }
  const hide = handler.getNativeCaptionHide?.();
  if (hide) {
    hideNativeCaptions(hide.selector, hide.method ?? 'display');
  }
}

/**
 * Turn off showing HTML5 TextTrack cues after the custom overlay attaches.
 * Only tracks changed by this extension are recorded for restoration.
 */
function hideHtml5TextTracks(): void {
  if (typeof document === 'undefined') return;
  try {
    const videos = document.querySelectorAll('video');
    for (const video of videos) {
      const tracks = video.textTracks;
      if (!tracks) continue;
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        if (track && track.mode === 'showing') {
          state.hiddenHtml5Tracks.add(track);
          track.mode = 'hidden';
        }
      }
    }
  } catch {
    /* ignore cross-origin / missing textTracks */
  }
}

function restoreHtml5TextTracks(): void {
  for (const track of state.hiddenHtml5Tracks) {
    try {
      track.mode = 'showing';
    } catch {
      // Ignore tracks removed during player teardown.
    }
  }
  state.hiddenHtml5Tracks.clear();
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
  invalidateCategoryIfUrlChanged();
  await triggerAutoCategoryDetection(
    settings,
    state.categoryOverride,
    () => {
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

type AsrResegmentMode = 'off' | 'local' | 'ai';

function findYoutubeTrackMeta(url: string): AvailableSubtitleTrack | undefined {
  return state.availableTracks.find(
    (t) =>
      t.platform === 'youtube' &&
      !!t.url &&
      (t.url === url || url.startsWith(t.url) || t.url.startsWith(url.split('&')[0])),
  );
}

/**
 * Surface AI re-align progress on mini-progress and the subtitle toast so the
 * user sees stages even when they only watch the larger toast.
 */
function showRealignProgressUi(
  status: 'realigning' | 'realign-cached',
  current: number,
  total: number,
): void {
  const safeTotal = Math.max(total, 1);
  updateMiniProgress({
    translated: current,
    total: safeTotal,
    status,
    onStop: () => {
      cancelBackgroundSubtitleSession();
      hideMiniProgress();
    },
  });

  if (status === 'realign-cached') {
    showSubtitleToast('Using saved re-align', true);
    return;
  }
  if (current <= 0) {
    showSubtitleToast('Re-aligning captions…', true);
    return;
  }
  showSubtitleToast(`Re-aligning captions… ${current}/${safeTotal}`, true);
}

/**
 * Shared YouTube ASR path: local rules → optional AI cache/resegment.
 * Used by intercept and proactive timedtext fetch so both get cache + progress.
 */
async function applyYoutubeAsrPipeline(options: {
  platform: string;
  url: string;
  body: string;
  rawCues: SubtitleCue[];
  originalLanguage: string;
  settings: Awaited<ReturnType<typeof loadSettings>>;
}): Promise<{
  cues: SubtitleCue[];
  resegmentMode: AsrResegmentMode;
  asrEnable: boolean;
  asrAiEnable: boolean;
}> {
  const { platform, url, body, rawCues, originalLanguage, settings } = options;
  const asrSettings = settings.subtitleSettings.youtubeAsrResegment;
  const asrEnable = asrSettings?.enable ?? true;
  const asrAiEnable = asrSettings?.aiEnable ?? false;
  const trackMeta = findYoutubeTrackMeta(url);
  const isAsrTrack =
    trackMeta?.isAutoGenerated === true || isYoutubeAsrUrl(url);

  let cues = applyYoutubeAsrResegment({
    platform,
    url,
    body,
    cues: rawCues,
    language: originalLanguage,
    enable: asrEnable,
    isAutoGenerated: trackMeta?.isAutoGenerated,
  });
  let resegmentMode: AsrResegmentMode =
    asrEnable && isAsrTrack && platform === 'youtube' ? 'local' : 'off';

  if (!(asrEnable && asrAiEnable && platform === 'youtube' && isAsrTrack && rawCues.length > 0)) {
    return { cues, resegmentMode, asrEnable, asrAiEnable };
  }

  const onProgressMsg = (msg: unknown) => {
    const m = msg as AsrRealignProgressMessage | undefined;
    if (m?.action !== 'ASR_REALIGN_PROGRESS') return;
    showRealignProgressUi('realigning', m.current, m.total);
  };
  chrome.runtime.onMessage.addListener(onProgressMsg);

  try {
    const units = prepareYoutubeAsrAiInput({ body, cues: rawCues });
    if (units.length === 0) {
      return { cues, resegmentMode, asrEnable, asrAiEnable };
    }

    const videoId =
      trackMeta?.videoId ||
      state.availableTracks.find((t) => t.videoId)?.videoId ||
      extractYoutubeVideoIdFromUrl(window.location.href);

    if (videoId) {
      const contentHash = await hashAsrRealignContent(units);
      const lang = originalLanguage || 'en';
      const key = buildAsrRealignCacheKey(videoId, lang, contentHash);
      const cached = (await chrome.runtime.sendMessage({
        action: 'GET_ASR_REALIGN_CACHE',
        key,
      })) as GetAsrRealignCacheResult | undefined;

      if (cached?.success && cached.entry?.cues && cached.entry.cues.length > 0) {
        cues = cached.entry.cues;
        resegmentMode = 'ai';
        showRealignProgressUi('realign-cached', 1, 1);
      } else {
        showRealignProgressUi('realigning', 0, 1);
        const aiResult = (await chrome.runtime.sendMessage({
          action: 'RESEGMENT_YOUTUBE_ASR',
          language: lang,
          units,
        })) as ResegmentYoutubeAsrResult | undefined;

        if (aiResult?.success && aiResult.cues && aiResult.cues.length > 0) {
          cues = aiResult.cues;
          resegmentMode = 'ai';
          const title = stripYoutubeTitleSuffix(document.title || '');
          const now = Date.now();
          void chrome.runtime.sendMessage({
            action: 'SAVE_ASR_REALIGN_CACHE',
            entry: {
              key,
              videoId,
              language: lang,
              mode: 'ai' as const,
              title: title || undefined,
              thumbnailUrl: youtubeThumbnailUrl(videoId),
              youtubeUrl: youtubeWatchUrl(videoId),
              cueCount: cues.length,
              byteSize: 0,
              contentHash,
              createdAt: now,
              lastUsedAt: now,
              cues,
            },
          });
        } else {
          console.warn(
            'AnyLLMTranslate: AI ASR resegment failed — using local rules',
            aiResult?.error,
          );
          showSubtitleToast('AI re-align failed · using local rules');
        }
      }
    } else {
      showRealignProgressUi('realigning', 0, 1);
      const aiResult = (await chrome.runtime.sendMessage({
        action: 'RESEGMENT_YOUTUBE_ASR',
        language: originalLanguage || 'en',
        units,
      })) as ResegmentYoutubeAsrResult | undefined;

      if (aiResult?.success && aiResult.cues && aiResult.cues.length > 0) {
        cues = aiResult.cues;
        resegmentMode = 'ai';
      } else {
        console.warn(
          'AnyLLMTranslate: AI ASR resegment failed — using local rules',
          aiResult?.error,
        );
        showSubtitleToast('AI re-align failed · using local rules');
      }
    }
  } catch (err) {
    console.warn('AnyLLMTranslate: AI ASR resegment error — using local rules', err);
    showSubtitleToast('AI re-align failed · using local rules');
  } finally {
    chrome.runtime.onMessage.removeListener(onProgressMsg);
  }

  return { cues, resegmentMode, asrEnable, asrAiEnable };
}

/**
 * Activate overlay + progressive translation for already-parsed full-track cues.
 * Shared by intercepted full files, direct subtitle URLs, and proactive
 * YouTube timedtext fetches.
 */
async function activateOverlayWithParsedCues(options: {
  cues: SubtitleCue[];
  sourceLanguage: string;
  settings: Awaited<ReturnType<typeof loadSettings>>;
  platform?: string;
  /** Navigation epoch captured before the async activation started. */
  navigationEpoch?: number;
  /** Optional ownership check for same-navigation activation races. */
  isActivationCurrent?: () => boolean;
  /** When set, blank native track after successful translation (intercept path). */
  intercept?: { requestId: string; originalBody: string };
}): Promise<boolean> {
  const {
    cues,
    sourceLanguage,
    settings,
    intercept,
    navigationEpoch,
  } = options;
  const isStaleActivation = () =>
    (navigationEpoch !== undefined && state.navigationEpoch !== navigationEpoch) ||
    (options.isActivationCurrent !== undefined && !options.isActivationCurrent());
  const unblockStaleIntercept = (): false => {
    if (intercept) {
      sendTranslatedSubtitle({ requestId: intercept.requestId, vttContent: intercept.originalBody });
    }
    return false;
  };
  if (isStaleActivation()) return unblockStaleIntercept();

  const handler =
    (options.platform ? getHandlerByPlatform(options.platform) : null) ??
    detectCurrentHandler();

  state.interceptOriginalCues = cues;
  // Progressive chunks can arrive before the initial response. Seed the merge
  // buffer with the complete source track so untranslated cues remain visible.
  state.translatedCues = [...cues];

  // Always (re)apply native hide: proactive YouTube can start overlay while
  // CC is already painting, and a prior overlay session may have skipped hide.
  const domSource = handler?.getDomCueSource?.();
  if (domSource) {
    hideNativeCaptions(domSource.captionWindowSelector, 'display');
  } else {
    applyNativeCaptionHideForHandler(handler);
  }
  if (!state.isOverlayMode) {
    console.log('AnyLLMTranslate: Activating overlay mode for progressive translation');
    const savedPrefs = await initializeControls();
    if (isStaleActivation()) return unblockStaleIntercept();
    state.isOverlayMode = true;
    const overlayConfig = buildSubtitleOverlayConfig(settings.subtitleSettings, savedPrefs);
    const attached = await initializeActiveRenderer(cues, overlayConfig);
    if (!attached) scheduleRendererAttachmentRetry();
    if (isStaleActivation()) return unblockStaleIntercept();
  } else {
    updateActiveRendererCues(cues);
  }

  const sessionId = allocateSubtitleSessionId();
  state.activeSubtitleSessionId = sessionId;
  const stillOwnsSession = () => state.activeSubtitleSessionId === sessionId;

  showSubtitleToast('Preparing subtitles (indexing names on first view)...', true);
  const pageContext = await buildSubtitlePageContext();
  if (isStaleActivation() || !stillOwnsSession()) return unblockStaleIntercept();

  try {
    const response = (await chrome.runtime.sendMessage({
      action: 'translateSubtitle',
      hostname: window.location.hostname,
      cues,
      sourceLanguage,
      targetLanguage: settings.targetLanguage,
      pageContext,
      profile: currentSubtitleProfile(),
      knobOverrides: state.subtitleKnobOverride,
      sessionId,
    })) as { success: boolean; cues?: SubtitleCue[]; error?: string; sessionId?: number };

    if (isStaleActivation() || !stillOwnsSession()) return unblockStaleIntercept();
    if (!response?.success || !response.cues) {
      console.warn('AnyLLMTranslate: Translation failed', response?.error);
      if (intercept) {
        sendTranslatedSubtitle({ requestId: intercept.requestId, vttContent: intercept.originalBody });
      }
      cleanupActiveOverlay();
      hideSubtitleToast();
      showSubtitleToast('Subtitle translation failed.');
      return false;
    }

    if (intercept) {
      sendTranslatedSubtitle({
        requestId: intercept.requestId,
        vttContent: blankNativeSubtitleBody(intercept.originalBody),
      });
    }

    if (response.sessionId !== undefined) {
      state.activeSubtitleSessionId = response.sessionId;
    }
    updateTranslatedCues(response.cues);
    hideSubtitleToast();
    showSubtitleToast('Subtitles processing...');
    return true;
  } catch (error) {
    if (isStaleActivation() || !stillOwnsSession()) return unblockStaleIntercept();
    console.warn('AnyLLMTranslate: activateOverlayWithParsedCues error', error);
    if (intercept) {
      sendTranslatedSubtitle({ requestId: intercept.requestId, vttContent: intercept.originalBody });
    }
    cleanupActiveOverlay();
    hideSubtitleToast();
    showSubtitleToast('Subtitle translation error.');
    return false;
  }
}

/**
 * Handle subtitle interception from MAIN world.
 */
async function handleIntercepted(payload: SubtitleInterceptedPayload, requestId: string): Promise<void> {
  const { url, body, contentType, platform, originalLanguage } = payload;
  const youtubeNavigationEpoch = platform === 'youtube' ? state.navigationEpoch : undefined;
  const isStaleYoutubeRequest = () =>
    youtubeNavigationEpoch !== undefined && state.navigationEpoch !== youtubeNavigationEpoch;

  // Guard: only activate on actual watch pages.
  // On listing/search/home pages (e.g. YouTube /results, /), pass the original
  // subtitle content straight back so native thumbnail preview playback is unaffected.
  if (!isOnWatchPage()) {
    console.log('AnyLLMTranslate: Skipping subtitle interception — not a watch page', { url });
    sendTranslatedSubtitle({ requestId, vttContent: body });
    return;
  }

  if (platform === 'youtube') {
    const currentVideoId = extractYoutubeVideoIdFromUrl(window.location.href);
    const interceptedVideoId = extractYoutubeVideoIdFromUrl(url);
    if (
      !currentVideoId ||
      !interceptedVideoId ||
      currentVideoId !== interceptedVideoId
    ) {
      console.log('AnyLLMTranslate: Passing through stale or unidentified YouTube subtitle interception', {
        currentVideoId,
        interceptedVideoId,
        url,
      });
      sendTranslatedSubtitle({ requestId, vttContent: body });
      return;
    }
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
    if (isStaleYoutubeRequest()) {
      sendTranslatedSubtitle({ requestId, vttContent: body });
      return;
    }
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

    // Generic handler toggle: when the generic handler intercepted this payload
    // but the user disabled "Generic subtitle detection", pass the original
    // through (always-respond pattern). Specific platforms are unaffected.
    if (platform === 'generic' && settings.subtitleSettings.enableGenericSubtitleHandler === false) {
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
      cancelBackgroundSubtitleSession();
      state.activeSubtitleSessionId = null;
      cleanupActiveOverlay();
      state.translatedCues = null;
    }
    state.activeTrackIdentity = trackIdentity;

    const rawCues = handler.transformResponse(body, contentType, url);
    if (rawCues.length === 0) {
      sendTranslatedSubtitle({ requestId, vttContent: body });
      return;
    }

    // Order: parse → ASR resegment (YouTube auto-captions only) → progressive
    // translate → adaptCueTimings on the bilingual display path. Cache keys must
    // use post-resegment source text (we pass `cues` into translateSubtitle).
    const { cues, resegmentMode, asrEnable, asrAiEnable } = await applyYoutubeAsrPipeline({
      platform,
      url,
      body,
      rawCues,
      originalLanguage,
      settings,
    });
    if (isStaleYoutubeRequest()) {
      sendTranslatedSubtitle({ requestId, vttContent: body });
      return;
    }

    if (resegmentMode !== 'off') {
      console.log('AnyLLMTranslate: YouTube ASR resegment', {
        lang: originalLanguage,
        inputCues: rawCues.length,
        outputCues: cues.length,
        mode: resegmentMode,
        enable: asrEnable,
        aiEnable: asrAiEnable,
      });
    }

    const sourceLanguage =
      settings.sourceLanguage === 'auto'
        ? originalLanguage || 'en'
        : settings.sourceLanguage;

    await activateOverlayWithParsedCues({
      cues,
      sourceLanguage,
      settings,
      platform,
      navigationEpoch: youtubeNavigationEpoch,
      intercept: { requestId, originalBody: body },
    });
  } catch (error) {
    console.warn('AnyLLMTranslate: handleIntercepted error', error);
    // Task 6.4: Restore native subtitles on error — send original body back
    sendTranslatedSubtitle({ requestId, vttContent: body });
    if (isStaleYoutubeRequest()) return;
    cleanupActiveOverlay();
    hideSubtitleToast();
    showSubtitleToast('Subtitle translation error.');
  }
}

/**
 * Fetch and parse a complete subtitle file, then activate the shared
 * full-track renderer/translation lifecycle.
 */
async function activateOverlayMode(
  subtitleUrl: string,
  options: { content?: string; sourceLanguageHint?: string } = {},
): Promise<void> {
  if (state.isOverlayMode && state.activeSource === 'manifest') return;

  const activationGeneration = nextDirectFullTrackActivationGeneration++;
  const navigationEpoch = state.navigationEpoch;
  const canCommitActivation = () =>
    navigationEpoch === state.navigationEpoch &&
    activationGeneration >= activeDirectFullTrackActivationGeneration;

  const settings = await loadSettings();
  if (!canCommitActivation()) return;
  if (!settings.subtitleSettings.enabled) {
    activeDirectFullTrackActivationGeneration = activationGeneration;
    cleanupActiveOverlay();
    return;
  }

  // Fetch subtitle content if not provided
  let subtitleContent = options.content;
  if (!subtitleContent) {
    try {
      subtitleContent = await fetchSubtitleContent(subtitleUrl);
    } catch (error) {
      if (!canCommitActivation()) return;
      console.error('AnyLLMTranslate: Failed to fetch subtitle content', error);
      return;
    }
  }
  if (!canCommitActivation()) return;

  // Parse subtitles
  const cues = parseSubtitles(subtitleContent);
  if (cues.length === 0) {
    console.warn('AnyLLMTranslate: No cues found in subtitle content');
    return;
  }
  if (!canCommitActivation()) return;

  // Only a successfully parsed replacement takes ownership. A newer failed
  // fetch/parse must not orphan an older valid translation already in flight.
  activeDirectFullTrackActivationGeneration = activationGeneration;
  const isActivationCurrent = () =>
    activationGeneration === activeDirectFullTrackActivationGeneration &&
    navigationEpoch === state.navigationEpoch;

  preemptLowerTierOverlay();
  resetActiveSource();
  state.fetchedTrackUrls.add(subtitleUrl);
  console.log('AnyLLMTranslate: Activating overlay from complete subtitle track URL');

  const sourceLanguage =
    settings.sourceLanguage === 'auto'
      ? options.sourceLanguageHint || 'en'
      : settings.sourceLanguage;

  await activateOverlayWithParsedCues({
    cues,
    sourceLanguage,
    settings,
    platform: detectCurrentHandler()?.platform,
    navigationEpoch,
    isActivationCurrent,
  });
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
  const built = state.domOriginalCues.map((cue) => ({
    startTime: cue.startTime,
    endTime: cue.endTime,
    text: state.domTranslationMap.get(cue.text) ?? cue.text,
    originalText: cue.text,
  }));
  // Sub-project 5a: adapt bilingual cue endTimes for reading speed (extend +
  // cap, never shorten). Runs on the full rebuilt array each batch.
  state.domTranslatedCues = adaptCueTimings(built);
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
  const orderedTexts = sortCueTextsByPlaybackPriority(
    newTexts,
    state.domOriginalCues,
    getPlaybackTimeForTranslation(),
  );
  const cuesToTranslate: SubtitleCue[] = orderedTexts.map((text, i) => ({
    startTime: i,
    endTime: i + 1,
    text,
  }));
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'translateSubtitle',
      hostname: window.location.hostname,
      cues: cuesToTranslate,
      sourceLanguage,
      targetLanguage,
      pageContext,
      profile: currentSubtitleProfile(),
      knobOverrides: state.subtitleKnobOverride,
      sessionId: sessionId ?? undefined,
    }) as { success: boolean; cues?: SubtitleCue[]; error?: string; sessionId?: number };

    if (!response?.success || !response.cues) {
      console.warn('AnyLLMTranslate: DOM cue delta translation failed', response?.error);
      return;
    }
    if (sessionId !== null && sessionId !== state.activeSubtitleSessionId) {
      return;
    }
    if (response.sessionId !== undefined) {
      state.activeSubtitleSessionId = response.sessionId;
    }
    // Accumulate translations in the persistent map so previous
    // batches' translations are preserved across rebuilds.
    applyTranslatedCueBatchToMap(state.domTranslationMap, response.cues);
    rebuildTranslatedCues();
    updateActiveRendererCues(state.domTranslatedCues);
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
  resetActiveSource();
}

// ── Manifest-tier (HBOMax progressive VTT capture) delta translation ─────────
// Mirrors the DOM-tier machinery above. HBO Max serves subtitles as multiple
// VTT segments fetched progressively; each appended segment's new cue texts
// are translated as a delta against this persistent map, with per-cue
// fallback to the original text until a translation arrives.

/**
 * Replace the rolling manifest original-cue buffer with the latest from MAIN
 * world. The Performance-API capture sends the FULL accumulated buffer each
 * append (deduped by startTime), so a wholesale replace keeps timing
 * authoritative — identical to the DOM tier's contract. Returns the list of
 * NEW cue texts not yet sent for translation.
 */
function mergeManifestOriginalCues(incoming: SubtitleCue[]): string[] {
  const newTexts: string[] = [];
  state.manifestOriginalCues = incoming.map((c) => ({ ...c }));
  for (const cue of incoming) {
    if (!state.manifestTranslatedTexts.has(cue.text)) {
      newTexts.push(cue.text);
      state.manifestTranslatedTexts.add(cue.text);
    }
  }
  return newTexts;
}

/**
 * Rebuild manifestTranslatedCues from manifestOriginalCues using the persistent
 * translation map. Each cue carries originalText (source) + text (translated,
 * or source if not yet translated) — graceful per-cue fallback.
 */
function rebuildManifestTranslatedCues(): void {
  const built = state.manifestOriginalCues.map((cue) => ({
    startTime: cue.startTime,
    endTime: cue.endTime,
    text: state.manifestTranslationMap.get(cue.text) ?? cue.text,
    originalText: cue.text,
  }));
  state.manifestTranslatedCues = adaptCueTimings(built);
}

/**
 * Translate the given new source cue texts and merge into the overlay.
 * Sends a translateSubtitle request for the delta only, accumulating into
 * the persistent manifestTranslationMap. Failure is graceful (log + return):
 * the overlay keeps whatever the last rebuild produced (original text
 * fallback), so a failed append delta never blanks the overlay.
 */
function applyTranslatedCueBatchToMap(
  map: Map<string, string>,
  translated: SubtitleCue[],
): void {
  for (const c of translated) {
    const src = c.originalText;
    if (src && c.text !== src) {
      map.set(src, c.text);
    }
  }
}

/** Minimum sub-batch size for progressive halving retry. */
const MANIFEST_MIN_SUBBATCH_SIZE = 5;

/**
 * Send a single batch of cue texts to the background for translation and merge
 * the result into the manifest translation map + overlay. Returns true on
 * success, false on failure. Handles session-cancellation detection by
 * comparing the response sessionId against the current active session.
 */
async function translateManifestBatch(
  batchTexts: string[],
  sourceLanguage: string,
  targetLanguage: string,
  pageContext: PageContext | undefined,
  skipFilmPreScan: boolean,
): Promise<boolean> {
  const cuesToTranslate: SubtitleCue[] = batchTexts.map((text, i) => ({
    startTime: i,
    endTime: i + 1,
    text,
  }));
  // Snapshot at send time. Prefer an already-active id; otherwise allocate so
  // progressive chunks and this response share a stable identity before seek.
  let requestSessionId = state.activeSubtitleSessionId;
  if (requestSessionId === null) {
    requestSessionId = allocateSubtitleSessionId();
    state.activeSubtitleSessionId = requestSessionId;
  }
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'translateSubtitle',
      hostname: window.location.hostname,
      cues: cuesToTranslate,
      sourceLanguage,
      targetLanguage,
      pageContext,
      profile: currentSubtitleProfile(),
      knobOverrides: state.subtitleKnobOverride,
      sessionId: requestSessionId,
      skipFilmPreScan,
    }) as { success: boolean; cues?: SubtitleCue[]; error?: string; sessionId?: number };

    if (!response?.success || !response.cues) {
      console.warn('AnyLLMTranslate: Manifest cue delta translation failed', response?.error);
      return false;
    }
    // Seek-cancellation: active id was cleared or replaced while this batch was
    // in flight — drop the stale result (do not re-adopt a cancelled session).
    if (state.activeSubtitleSessionId !== requestSessionId) {
      console.log('AnyLLMTranslate: Dropping stale manifest batch (session changed)');
      return true; // Not a failure — just stale; don't sub-batch retry
    }
    if (response.sessionId !== undefined) {
      state.activeSubtitleSessionId = response.sessionId;
    }
    applyTranslatedCueBatchToMap(state.manifestTranslationMap, response.cues);
    rebuildManifestTranslatedCues();
    updateActiveRendererCues(state.manifestTranslatedCues);
    return true;
  } catch (error) {
    console.warn('AnyLLMTranslate: Manifest cue delta translation error', error);
    return false;
  }
}

async function translateManifestCueTexts(
  newTexts: string[],
  sourceLanguage: string,
  targetLanguage: string,
  pageContext: PageContext | undefined,
  _sessionId: number | null,
): Promise<void> {
  if (newTexts.length === 0) return;
  const orderedTexts = sortCueTextsByPlaybackPriority(
    newTexts,
    state.manifestOriginalCues,
    getPlaybackTimeForTranslation(),
  );

  // Batch like the background chunk loop — a single huge delta (e.g. after seek
  // when many new lines arrive) can make the LLM return non-JSON and fail the
  // whole request; smaller batches also return faster for the first overlay update.
  for (let offset = 0; offset < orderedTexts.length; offset += SUBTITLE_CHUNK_SIZE) {
    const batchTexts = orderedTexts.slice(offset, offset + SUBTITLE_CHUNK_SIZE);
    const skipFilmPreScan = offset > 0 || state.manifestTranslationMap.size > 0;

    const ok = await translateManifestBatch(
      batchTexts,
      sourceLanguage,
      targetLanguage,
      pageContext,
      skipFilmPreScan,
    );
    if (ok) continue;

    // Progressive halving retry: when a full batch fails (typically JSON parse
    // error on a large batch after seek), split into smaller sub-batches and
    // retry each independently. Smaller batches are far more likely to get a
    // valid JSON response from the LLM, and a single bad text won't sink the
    // entire segment's translation.
    let subSize = Math.floor(SUBTITLE_CHUNK_SIZE / 2);
    let remaining = batchTexts;
    let anySubOk = false;
    while (subSize >= MANIFEST_MIN_SUBBATCH_SIZE && remaining.length > 0) {
      const subBatches: string[][] = [];
      for (let i = 0; i < remaining.length; i += subSize) {
        subBatches.push(remaining.slice(i, i + subSize));
      }
      remaining = [];
      for (const sub of subBatches) {
        const subOk = await translateManifestBatch(
          sub,
          sourceLanguage,
          targetLanguage,
          pageContext,
          true,
        );
        if (!subOk) {
          remaining.push(...sub);
        } else {
          anySubOk = true;
        }
      }
      subSize = Math.floor(subSize / 2);
    }

    // Final attempt: translate remaining failed texts one-by-one. Even a single
    // text is sometimes rejected by the LLM (e.g. empty-ish strings); skip
    // those silently rather than blocking the rest of the segment.
    if (remaining.length > 0) {
      for (const text of remaining) {
        await translateManifestBatch(
          [text],
          sourceLanguage,
          targetLanguage,
          pageContext,
          true,
        );
      }
    }

    if (!anySubOk && remaining.length === batchTexts.length) {
      // Entire batch failed even after sub-batch retry — the warning was already
      // logged by translateManifestBatch. No additional action needed.
    }
  }
}

/** Clear manifest-platform translation buffers without tearing down the overlay shell. */
function clearManifestTranslationBuffers(): void {
  state.manifestOriginalCues = [];
  state.manifestTranslatedCues = [];
  state.manifestTranslatedTexts = new Set();
  state.manifestTranslationMap = new Map();
  state.activeSubtitleSessionId = null;
  resetActiveSource();
}

/** Debounce timer for seek-initiated buffer resets (coalesces rapid scrubbing). */
let seekResetTimer: ReturnType<typeof setTimeout> | null = null;
const SEEK_RESET_DEBOUNCE_MS = 200;

/** Store the last known currentTime for each video element to filter out micro-seeks. */
const lastVideoTimes = new WeakMap<HTMLVideoElement, number>();

/**
 * Handle a video seek event. Clears the manifest and DOM cue buffers so the
 * overlay only shows cues for the new playback position, while preserving the
 * translation maps as caches (cues already translated from earlier viewing
 * show translated immediately when the new segment arrives — only truly new
 * texts need translation, minimizing the untranslated window).
 *
 * Also sends SUBTITLE_SEEK_RESET to the MAIN-world capture module so its
 * `seenUrls` and `cueBuffer` are cleared: segments re-fetched for the new
 * position are not skipped, and the next SUBTITLE_MANIFEST_CUES message
 * carries only the new position's cues.
 */
function handleVideoSeeked(event?: Event): void {
  if (!state.isOverlayMode) return;

  const video = (event?.currentTarget as HTMLVideoElement) || document.querySelector('video');
  if (!video) return;

  const lastTime = lastVideoTimes.get(video);
  const currentTime = video.currentTime;
  if (lastTime !== undefined) {
    const diff = Math.abs(currentTime - lastTime);
    if (diff < 1.5) {
      // Ignored micro-seek/small sync adjustment
      lastVideoTimes.set(video, currentTime);
      return;
    }
  }

  // Real seek: update the anchor for the next comparisons
  lastVideoTimes.set(video, currentTime);

  // If the seeked time is covered by the current full-content cue set,
  // keep the existing cues and the active translation session. Two paths can
  // hold full content: the full-file path (e.g. Youku ASS or Coursera VTT,
  // cached in state.interceptOriginalCues) and the manifest path (streaming
  // VTT, cached in state.manifestOriginalCues). This prevents startup seeks
  // or local scrubbing from clearing already loaded cues and — critically for
  // the intercept path — from cancelling the chunked-translation session
  // (which would cause every subsequent chunk to be dropped as stale).
  const fullContentCues =
    state.interceptOriginalCues.length > 0
      ? state.interceptOriginalCues
      : state.activeSource === 'manifest'
        ? state.manifestOriginalCues
        : [];
  if (fullContentCues.length > 0) {
    const firstCue = fullContentCues[0];
    const lastCue = fullContentCues[fullContentCues.length - 1];
    // Allow a small padding/grace window of 2 seconds at the boundaries
    if (currentTime >= firstCue.startTime - 2 && currentTime <= lastCue.endTime + 2) {
      console.log('AnyLLMTranslate: Seek is within current subtitle range — keeping cues');
      state.playbackAnchorTime = currentTime;
      return;
    }
  }

  if (seekResetTimer !== null) {
    clearTimeout(seekResetTimer);
  }
  seekResetTimer = setTimeout(() => {
    seekResetTimer = null;
    if (!state.isOverlayMode) return;

    console.log('AnyLLMTranslate: Video seek settled — resetting cue buffers for new position');

    const video = document.querySelector('video');
    if (video && Number.isFinite(video.currentTime)) {
      state.playbackAnchorTime = video.currentTime;
    }

    // Tell the MAIN-world capture module to reset its buffer + seenUrls.
    sendMessage('SUBTITLE_SEEK_RESET', { platform: 'hbomax' });

    // Clear manifest cue buffers but KEEP manifestTranslationMap as a cache —
    // cues already translated show translated immediately when the new segment
    // arrives. Reconcile manifestTranslatedTexts so in-flight texts cancelled
    // below can be re-queued (the set tracks "sent for translation", not cache).
    state.manifestOriginalCues = [];
    state.manifestTranslatedCues = [];
    reconcilePendingTranslatedTexts(state.manifestTranslatedTexts, state.manifestTranslationMap);

    // Also clear DOM cue buffers (DOM tier will receive fresh cues from the
    // MAIN world scraper for the new position).
    state.domOriginalCues = [];
    state.domTranslatedCues = [];
    reconcilePendingTranslatedTexts(state.domTranslatedTexts, state.domTranslationMap);
    resetActiveSource();

    // Cancel any in-flight background translation session — its results would
    // be for the old position's cues and are no longer needed.
    cancelBackgroundSubtitleSession();
    state.activeSubtitleSessionId = null;

    // Clear the overlay so stale cues from the old position don't show during
    // the brief window before the new position's segment arrives.
    updateActiveRendererCues([]);
  }, SEEK_RESET_DEBOUNCE_MS);
}

/** Release session/buffer ownership before another full-track source takes over. */
function preemptLowerTierOverlay(): void {
  if (state.activeSubtitleSessionId !== null) {
    cancelBackgroundSubtitleSession();
    state.activeSubtitleSessionId = null;
  }
  if (!state.isOverlayMode) return;
  if (state.activeSource === 'dom') {
    state.domOriginalCues = [];
    state.domTranslatedCues = [];
    state.domTranslatedTexts = new Set();
    state.domTranslationMap = new Map();
  }
  if (state.activeSource === 'manifest') {
    state.manifestOriginalCues = [];
    state.manifestTranslatedCues = [];
    state.manifestTranslatedTexts = new Set();
    state.manifestTranslationMap = new Map();
  }
  if (state.dragCleanup) {
    state.dragCleanup();
    state.dragCleanup = null;
  }
}

/**
 * Reset coordinator state when Max subtitle track changes mid-session.
 */
async function handleDomTrackChanged(_payload: SubtitleDomTrackChangedPayload): Promise<void> {
  console.log('AnyLLMTranslate: DOM subtitle track changed — clearing translation state');
  cancelBackgroundSubtitleSession();
  // Track-switch fires regardless of which tier is currently active (Max's
  // aria-checked observer doesn't know about our tier precedence), so clear
  // both DOM and manifest buffers — otherwise the manifest tier's persistent
  // translationMap/translatedTexts Set from the OLD track survive the switch.
  clearDomTranslationBuffers();
  clearManifestTranslationBuffers();
  if (state.isOverlayMode) {
    updateActiveRendererCues([]);
  }
  scheduleDomTrackDiscovery();
}

/**
 * Handle full TextTrack cues from HTML5 player (Tier 4).
 * Feeds the full cue list into the chunked translate path (same as manifest).
 * Lower precedence than manifest — Phase 5 finalizes precedence.
 */
async function handleTextTrackCues(payload: SubtitleTextTrackCuesPayload): Promise<void> {
  if (!isOnWatchPage()) return;
  if (payload.cues.length === 0) return;
  if (shouldSuppressSource('texttrack')) return; // Higher-precedence source already active
  if (state.isOverlayMode && state.activeSource === 'texttrack') return; // Already active

  console.log('AnyLLMTranslate: TextTrack full cues received', {
    language: payload.language,
    cueCount: payload.cues.length,
  });

  const settings = await loadSettings();
  if (!settings.subtitleSettings.enabled) return;

  // Use the same overlay activation + translation path as manifest-sourced cues
  state.isOverlayMode = true;
  state.activeSource = 'texttrack';
  console.log('AnyLLMTranslate: Activating overlay mode from TextTrack cues');

  const handler = detectCurrentHandler();
  const domSource = handler?.getDomCueSource?.();
  if (domSource) {
    hideNativeCaptions(domSource.captionWindowSelector, domSource.captionHideMethod ?? 'display');
  }

  let cuesToDisplay = payload.cues;
  try {
    showSubtitleToast('Translating subtitles...', true);
    const pageContext = await buildSubtitlePageContext();
    const response = await chrome.runtime.sendMessage({
      action: 'translateSubtitle',
      hostname: window.location.hostname,
      cues: payload.cues,
      sourceLanguage: settings.sourceLanguage === 'auto'
        ? (payload.language || 'en')
        : settings.sourceLanguage,
      targetLanguage: settings.targetLanguage,
      pageContext,
      profile: currentSubtitleProfile(),
      knobOverrides: state.subtitleKnobOverride,
    }) as { success: boolean; cues?: SubtitleCue[]; error?: string; sessionId?: number };

    if (response?.success && response.cues) {
      cuesToDisplay = response.cues;
      if (response.sessionId !== undefined) {
        state.activeSubtitleSessionId = response.sessionId;
      }
    }
  } catch (error) {
    console.warn('AnyLLMTranslate: TextTrack cue translation error', error);
  }

  const savedPrefs = await initializeControls();
  const overlayConfig = buildSubtitleOverlayConfig(settings.subtitleSettings, savedPrefs);
  const attached = await initializeActiveRenderer(cuesToDisplay, overlayConfig);
  if (!attached) scheduleRendererAttachmentRetry();

  hideSubtitleToast();
  showSubtitleToast('Subtitles processing...');
}

const DOM_TRACK_DISCOVER_DEBOUNCE_MS = 300;

/** Last time a SUBTITLE_CHUNK_FAILED toast was shown (ms). Idempotency guard
 *  to prevent toast-spam from a stream of failed background chunks. */
let lastChunkFailedToastAt = 0;
const CHUNK_FAILED_TOAST_COOLDOWN_MS = 5000;

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
  if (shouldSuppressSource('dom')) return; // Suppress DOM updates if higher-tier source is active

  // Max: never activate from DOM before play — wait for MPD (Tier 2) or play-time fallback.
  if (
    !state.isOverlayMode &&
    hbomaxUsesMpdSubtitlePipeline() &&
    !state.videoIsPlaying
  ) {
    return;
  }

  if (!state.isOverlayMode && shouldDeferDomForMpd()) {
    state.pendingDomCuesPayload = payload;
    scheduleMpdDomFallbackRetry();
    console.log('AnyLLMTranslate: Deferring DOM cues — Max MPD fetch/parse in progress');
    return;
  }

  if (!state.isOverlayMode) {
    await activateOverlayFromDom(payload);
    return;
  }

  if (!state.activeSource) {
    state.activeSource = 'dom';
  }

  // Already active — merge new cues (updates timing of all cues).
  const newTexts = mergeDomOriginalCues(payload.cues);

  // Always rebuild + push to overlay even when no new texts — cue timing
  // changes (endTime corrections on previous cues) must reach findActiveCue().
  rebuildTranslatedCues();
  updateActiveRendererCues(state.domTranslatedCues);

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
  if (shouldDeferDomForMpd()) {
    console.log('AnyLLMTranslate: Deferring DOM activation — Max MPD fetch/parse in progress');
    return;
  }

  // Tier precedence: DOM (Tier 5) is lowest priority — suppress if a higher-tier
  // source (manifest, texttrack, mse) has already won or is in-flight.
  if (shouldSuppressSource('dom')) {
    console.log('AnyLLMTranslate: Suppressing DOM cues — higher-precedence source already active', state.activeSource);
    return;
  }

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

  // Generic handler DOM-scraping toggle: suppress DOM activation when the
  // user disabled "Generic subtitle detection" on a site the generic handler owns.
  if (handlerForCheck?.platform === 'generic' && settings.subtitleSettings.enableGenericSubtitleHandler === false) {
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
  state.activeSource = 'dom';
  console.log('AnyLLMTranslate: Activating overlay from DOM cues (Max)');

  // Hide the platform's native caption window so only our overlay shows.
  // Method (display vs visibility) is platform-configured: Youku needs
  // visibility:hidden because its KUI player stops populating a display:none
  // #subtitle container (and #subtitle is both cue source AND hide target).
  hideNativeCaptions(domSource.captionWindowSelector, domSource.captionHideMethod ?? 'display');

  // Seed the rolling buffers with the first batch.
  mergeDomOriginalCues(payload.cues);
  rebuildTranslatedCues();

  const savedPrefs = await initializeControls();
  if (state.navigationEpoch !== epochAtStart) return; // stale
  const overlayConfig = buildSubtitleOverlayConfig(settings.subtitleSettings, savedPrefs);

  // Initialize overlay with bilingual cues (source until translated).
  const attached = await initializeActiveRenderer(state.domTranslatedCues, overlayConfig);
  if (!attached) scheduleRendererAttachmentRetry();

  // On first-ever viewing of a film, the background runs a one-time name
  // pre-scan before chunk 0 (cached thereafter). The toast copy reflects the
  // possible brief delay without leaking background internals.
  showSubtitleToast('Preparing subtitles (indexing names on first view)...', true);

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
 * Activate overlay from pre-parsed manifest cues (Tier 2).
 * Shared by MPD processor bridge messages and background manifest fetch.
 */
async function activateOverlayFromManifestCues(
  cues: SubtitleCue[],
  language: string,
  trackUrl?: string,
): Promise<boolean> {
  if (shouldSuppressSource('manifest')) return false;
  if (state.isOverlayMode && state.activeSource === 'manifest') return false;
  if (cues.length === 0) return false;

  const settings = await loadSettings();
  if (!settings.subtitleSettings.enabled) {
    cleanupActiveOverlay();
    return false;
  }

  invalidateDirectFullTrackActivations();
  preemptLowerTierOverlay();

  state.isOverlayMode = true;
  state.activeSource = 'manifest';
  state.interceptOriginalCues = [];
  state.translatedCues = null;
  if (trackUrl) state.fetchedTrackUrls.add(trackUrl);
  console.log('AnyLLMTranslate: Activating overlay mode from manifest', {
    cueCount: cues.length,
    language,
    url: trackUrl,
  });

  const handler = detectCurrentHandler();
  const domSource = handler?.getDomCueSource?.();
  if (domSource) {
    hideNativeCaptions(domSource.captionWindowSelector, domSource.captionHideMethod ?? 'display');
  }

  // Seed the rolling manifest buffers with the first segment. rebuildManifest-
  // TranslatedCues maps through the (empty) translation map, so the overlay
  // initially shows original text as fallback — identical to DOM activation.
  // The first delta translation below upgrades chunk 0 in place.
  mergeManifestOriginalCues(cues);
  rebuildManifestTranslatedCues();

  const savedPrefs = await initializeControls();
  const overlayConfig = buildSubtitleOverlayConfig(settings.subtitleSettings, savedPrefs);
  const attached = await initializeActiveRenderer(state.manifestTranslatedCues, overlayConfig);
  if (!attached) scheduleRendererAttachmentRetry();

  showSubtitleToast('Translating subtitles...', true);
  const pageContext = await buildSubtitlePageContext();
  const sourceLanguage = settings.sourceLanguage === 'auto'
    ? (language || 'en')
    : settings.sourceLanguage;

  // Pre-assign session id so progressive SUBTITLE_CHUNK_TRANSLATED messages
  // and the translateSubtitle response share one identity. Seek reset clears
  // this to null; stale chunks with a prior sessionId are then dropped.
  const sessionId = allocateSubtitleSessionId();
  state.activeSubtitleSessionId = sessionId;

  // Translate the first delta (all cue texts seen so far). On success the
  // manifestTranslationMap is populated and the overlay upgrades to
  // translated text for the initial chunk. This mirrors translateDomCueTexts.
  const newTexts = [...state.manifestTranslatedTexts];
  await translateManifestCueTexts(
    newTexts,
    sourceLanguage,
    settings.targetLanguage,
    pageContext,
    sessionId,
  );

  hideSubtitleToast();
  showSubtitleToast('Subtitles processing...');
  return true;
}

/**
 * Activate overlay mode from manifest-sourced subtitles (Tier 2).
 * Fetches the full subtitle track via FETCH_MANIFEST_SUBTITLES (background
 * fetches the HLS/DASH playlist + segments, assembles into SubtitleCue[]),
 * then feeds cues into the same chunked translation path.
 */
async function activateOverlayModeFromManifest(playlistUrl: string): Promise<void> {
  if (shouldSuppressSource('manifest')) return;
  if (state.isOverlayMode && state.activeSource === 'manifest') return;

  const settings = await loadSettings();
  if (!settings.subtitleSettings.enabled) {
    cleanupActiveOverlay();
    return;
  }

  showSubtitleToast('Fetching subtitle track from manifest...', true);

  const preferredLanguage = settings.subtitleSettings.preferredSubtitleLanguage;
  let cues: SubtitleCue[];
  let resolvedLanguage: string;
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'FETCH_MANIFEST_SUBTITLES',
      playlistUrl,
      preferredLanguage: preferredLanguage && preferredLanguage !== 'auto' ? preferredLanguage : undefined,
    }) as { success: boolean; cues?: SubtitleCue[]; error?: string; language?: string };

    if (!response?.success || !response.cues || response.cues.length === 0) {
      console.warn('AnyLLMTranslate: Manifest subtitle fetch failed', response?.error);
      hideSubtitleToast();
      showSubtitleToast('Failed to fetch manifest subtitles.');
      return;
    }
    cues = response.cues;
    resolvedLanguage = response.language ?? '';
  } catch (error) {
    console.error('AnyLLMTranslate: Manifest subtitle fetch error', error);
    hideSubtitleToast();
    showSubtitleToast('Manifest subtitle fetch error.');
    return;
  }

  hideSubtitleToast();
  await activateOverlayFromManifestCues(cues, resolvedLanguage, playlistUrl);
}

/**
 * Handle full manifest-parsed cues from MAIN world MPD processor (Tier 2).
 */
async function handleManifestCues(payload: SubtitleManifestCuesPayload): Promise<void> {
  if (!isOnWatchPage()) return;
  if (payload.cues.length === 0) return;
  if (shouldSuppressSource('manifest')) return;

  const settings = await loadSettings();
  if (!settings.subtitleSettings.enabled) return;

  const preferred = settings.subtitleSettings.preferredSubtitleLanguage;
  if (
    preferred &&
    preferred !== 'auto' &&
    payload.language &&
    !subtitleLanguagesMatch(payload.language, preferred)
  ) {
    return;
  }

  state.mpdProcessingInFlight = false;
  state.mpdGraceUntil = 0;

  const canReuseManifestShell =
    state.activeSource === 'manifest' ||
    (
      !state.activeSource &&
      payload.append &&
      state.interceptOriginalCues.length === 0
    );
  if (state.isOverlayMode && canReuseManifestShell) {
    state.activeSource = 'manifest';
    if (payload.append) {
      // Progressive VTT capture (HBOMax): a new segment arrived. Merge into the
      // rolling original buffer, rebuild + push to the overlay immediately so
      // new cues show (with original-text fallback), then translate the delta.
      // Mirrors handleDomCues steady-state (delta-only translation against a
      // persistent map). Previously this branch called updateCues(payload.cues)
      // directly, which overwrote the overlay with raw untranslated source text.
      const newTexts = mergeManifestOriginalCues(payload.cues);
      // Always rebuild + push, even when no new texts — timing corrections on
      // prior cues must reach findActiveCue().
      rebuildManifestTranslatedCues();
      updateActiveRendererCues(state.manifestTranslatedCues);
      state.playbackAnchorTime = null;
      if (newTexts.length === 0) return;

      // Use cached settings in the hot path (consistent with DOM tier).
      const appendSettings = state.cachedSettings ?? settings;
      if (!state.cachedSettings) state.cachedSettings = settings;
      const sourceLanguage = appendSettings.sourceLanguage === 'auto'
        ? (payload.language || 'en')
        : appendSettings.sourceLanguage;
      const pageContext = await buildSubtitlePageContext();
      await translateManifestCueTexts(
        newTexts,
        sourceLanguage,
        appendSettings.targetLanguage,
        pageContext,
        state.activeSubtitleSessionId,
      );
      return;
    }

    // Fresh non-append emission while manifest tier is still active (VTT capture
    // restart after BFCache restore, or track switch before activeSource reset).
    // Re-seed the rolling buffer without tearing down the overlay shell.
    const newTexts = mergeManifestOriginalCues(payload.cues);
    rebuildManifestTranslatedCues();
    updateActiveRendererCues(state.manifestTranslatedCues);
    state.playbackAnchorTime = null;
    if (newTexts.length === 0) return;

    const reseedSettings = state.cachedSettings ?? settings;
    if (!state.cachedSettings) state.cachedSettings = settings;
    const sourceLanguage = reseedSettings.sourceLanguage === 'auto'
      ? (payload.language || 'en')
      : reseedSettings.sourceLanguage;
    const pageContext = await buildSubtitlePageContext();
    await translateManifestCueTexts(
      newTexts,
      sourceLanguage,
      reseedSettings.targetLanguage,
      pageContext,
      state.activeSubtitleSessionId,
    );
    return;
  }

  const activated = await activateOverlayFromManifestCues(
    payload.cues,
    payload.language,
    payload.url,
  );
  if (activated) {
    state.videoIsPlaying = true;
  }
}

/**
 * Handle MSE SourceBuffer cues (Tier 3 — progressive, delta-based).
 * Feeds new cues into the chunked translate path, mirroring DOM-cue delta handling.
 * Lowest precedence tier — Phase 5 finalizes precedence.
 */
async function handleMseCues(payload: SubtitleMseCuesPayload): Promise<void> {
  if (!isOnWatchPage()) return;
  if (payload.cues.length === 0) return;
  if (shouldSuppressSource('mse')) return; // Higher-precedence source already active
  if (state.isOverlayMode && state.activeSource === 'mse') return; // Already active

  console.log('AnyLLMTranslate: MSE cues received', {
    cueCount: payload.cues.length,
  });

  const settings = await loadSettings();
  if (!settings.subtitleSettings.enabled) return;

  // Use the same overlay activation + translation path
  state.isOverlayMode = true;
  state.activeSource = 'mse';
  console.log('AnyLLMTranslate: Activating overlay mode from MSE cues');

  const handler = detectCurrentHandler();
  const domSource = handler?.getDomCueSource?.();
  if (domSource) {
    hideNativeCaptions(domSource.captionWindowSelector, domSource.captionHideMethod ?? 'display');
  }

  let cuesToDisplay = payload.cues;
  try {
    showSubtitleToast('Translating subtitles...', true);
    const pageContext = await buildSubtitlePageContext();
    const response = await chrome.runtime.sendMessage({
      action: 'translateSubtitle',
      hostname: window.location.hostname,
      cues: payload.cues,
      sourceLanguage: settings.sourceLanguage === 'auto'
        ? (payload.language || 'en')
        : settings.sourceLanguage,
      targetLanguage: settings.targetLanguage,
      pageContext,
      profile: currentSubtitleProfile(),
      knobOverrides: state.subtitleKnobOverride,
    }) as { success: boolean; cues?: SubtitleCue[]; error?: string; sessionId?: number };

    if (response?.success && response.cues) {
      cuesToDisplay = response.cues;
      if (response.sessionId !== undefined) {
        state.activeSubtitleSessionId = response.sessionId;
      }
    }
  } catch (error) {
    console.warn('AnyLLMTranslate: MSE cue translation error', error);
  }

  const savedPrefs = await initializeControls();
  const overlayConfig = buildSubtitleOverlayConfig(settings.subtitleSettings, savedPrefs);
  const attached = await initializeActiveRenderer(cuesToDisplay, overlayConfig);
  if (!attached) scheduleRendererAttachmentRetry();

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
  // Prefer promise form so MV3 service worker + unit tests both work.
  const response = (await chrome.runtime.sendMessage({
    action: 'FETCH_SUBTITLE',
    url,
  })) as { content?: string; error?: string } | undefined;

  if (!response) {
    throw new Error('No response from background');
  }
  if (response.error) {
    throw new Error(response.error);
  }
  if (typeof response.content !== 'string') {
    throw new Error('No content from background');
  }
  return response.content;
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
  updateActiveRendererCues(cues);
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
  // Sub-project 5a: adapt bilingual cue endTimes for reading speed (extend +
  // cap, never shorten). Safe to re-run on the whole merged array after each
  // progressive chunk — the helper filters sparse slots and is idempotent.
  const adapted = adaptCueTimings(currentCues);
  state.translatedCues = adapted;
  updateActiveRendererCues(adapted);
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

function requestYoutubeCaptionFallback(track: AvailableSubtitleTrack): void {
  if (!track.url || state.youtubeCaptionFallbackUrls.has(track.url)) return;
  state.youtubeCaptionFallbackUrls.add(track.url);
  sendMessage('YOUTUBE_REQUEST_CAPTIONS', {
    url: track.url,
    language: track.language,
  });
}

function restoreYoutubeCaptionFallback(): void {
  sendMessage('YOUTUBE_RESTORE_CAPTIONS', {});
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
      const settings = await loadSettings().catch(() => null);
      if (!settings) return;
      if (!settings.enableContextAwareTranslation) return;
      if (!settings.enableLLMPageCategoryDetection) return;
      // state.categoryOverride and the singleton are checked inside the helper.
      invalidateCategoryIfUrlChanged();
      await triggerAutoCategoryDetection(settings, state.categoryOverride, () => {
        broadcastCategoryInfo(settings, state.categoryOverride);
      });
    })();
  }, 1500);
}

/**
 * Start the subtitle coordinator.
 * Returns a cleanup function.
 */
/** Push subtitle settings to MAIN world (interceptors + MPD processor). */
function pushSubtitleConfigToMainWorld(
  settings: Awaited<ReturnType<typeof loadSettings>>,
): void {
  try {
    window.postMessage({
      type: 'SUBTITLE_CONFIG',
      channel: 'anyllm-translate',
      requestId: `config-${Date.now()}`,
      payload: {
        translationTimeoutMs: (settings.subtitleSettings.translationTimeout ?? 30) * 1000,
        preferredSubtitleLanguage: settings.subtitleSettings.preferredSubtitleLanguage,
      },
    }, window.location.origin);
  } catch { /* ignore */ }
}

export function startCoordinator(): () => void {
  console.log('AnyLLMTranslate: Starting subtitle coordinator');

  // Task 6.1: Settings are cached lazily in hot paths (handleIntercepted, handleDomCues).
  // Refresh cache on settings changes.
  const settingsChangeListener = () => {
    loadSettings().then((s) => {
      state.cachedSettings = s;
      pushSubtitleConfigToMainWorld(s);
    }).catch(() => {});
  };
  try { chrome.storage.onChanged.addListener(settingsChangeListener); } catch { /* tests may not mock */ }

  // Send SUBTITLE_CONFIG to MAIN world interceptors (timeout + preferred language)
  loadSettings().then((s) => {
    pushSubtitleConfigToMainWorld(s);
  }).catch(() => {});


  // Proactive LLM category detection on watch pages: fire once, debounced, so
  // the popup shows a detected category before the user presses play. The
  // trigger helper no-ops when not applicable, so this is safe to schedule always.
  scheduleProactiveCategoryDetection();

  // Listen for intercepted subtitles
  const cleanupBridge = onSubtitleIntercepted(handleIntercepted);

  // Listen for track discovery from MAIN world
  const cleanupDiscovery = onTracksDiscovered(handleTracksDiscovered);

  // MAIN inject may have queued timedtext before document_end — flush now.
  try {
    window.postMessage(
      {
        type: 'COORDINATOR_READY',
        channel: 'anyllm-translate',
        requestId: `ready-${Date.now()}`,
        payload: {},
      },
      window.location.origin,
    );
  } catch {
    /* ignore */
  }

  // Listen for DOM-scraped cues from MAIN world (Max)
  const cleanupDomCues = onDomCues(handleDomCues);

  const cleanupDomTrackChanged = onDomTrackChanged(handleDomTrackChanged);
  // Listen for full TextTrack cues from MAIN world (Tier 4)
  const cleanupTextTrackCues = onTextTrackCues(handleTextTrackCues);
  // Listen for MSE SourceBuffer cues from MAIN world (Tier 3)
  const cleanupMseCues = onMseCues(handleMseCues);
  // Listen for MPD-parsed manifest cues from MAIN world (Tier 2)
  const cleanupManifestCues = onManifestCues(handleManifestCues);
  const cleanupMpdProcessing = onMpdProcessing(handleMpdProcessing);

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
      // Drop stale chunks from cancelled/old subtitle sessions.
      // After seek/SPA reset, activeSubtitleSessionId is null — any chunk still
      // carrying a sessionId is from the cancelled session and must be dropped.
      // Adopting a sessionId while active is null used to re-apply stale cues
      // (e.g. pre-seek translations) onto the cleared overlay.
      // Chunks without sessionId remain accepted for backward compatibility.
      const chunkSessionId = (message as { sessionId?: number }).sessionId;
      if (chunkSessionId !== undefined) {
        if (
          state.activeSubtitleSessionId === null ||
          chunkSessionId !== state.activeSubtitleSessionId
        ) {
          console.log('AnyLLMTranslate: Dropping stale subtitle chunk', {
            expected: state.activeSubtitleSessionId,
            received: chunkSessionId,
          });
          return;
        }
      }
      // Handle chunk delta format (chunkStart + chunkCues)
      const useManifestChunkPath =
        state.activeSource === 'manifest' ||
        (state.isOverlayMode && state.manifestOriginalCues.length > 0);

      if (msg.chunkCues && msg.chunkStart !== undefined) {
        // Manifest tier (HBOMax progressive VTT) uses the text-keyed map
        // model — route chunk deltas through it so appended segments are
        // translated incrementally. Other tiers keep the offset-based merge.
        if (useManifestChunkPath) {
          applyTranslatedCueBatchToMap(state.manifestTranslationMap, msg.chunkCues);
          rebuildManifestTranslatedCues();
          updateActiveRendererCues(state.manifestTranslatedCues);
        } else {
          mergeTranslatedChunk(msg.chunkStart, msg.chunkCues);
        }
      } else if (msg.cues) {
        // Fallback: full array format (backward compat)
        if (useManifestChunkPath) {
          applyTranslatedCueBatchToMap(state.manifestTranslationMap, msg.cues);
          rebuildManifestTranslatedCues();
          updateActiveRendererCues(state.manifestTranslatedCues);
        } else {
          updateTranslatedCues(msg.cues);
        }
      }
    }
    // Sub-project 6: a background chunk failed all retries. Surface a
    // non-blocking toast so the user knows a section wasn't translated
    // (instead of silently swallowing). Idempotent within a cooldown window to
    // avoid toast-spam from a stream of failed chunks.
    if (msg.action === 'SUBTITLE_CHUNK_FAILED') {
      const now = Date.now();
      if (now - lastChunkFailedToastAt > CHUNK_FAILED_TOAST_COOLDOWN_MS) {
        lastChunkFailedToastAt = now;
        showSubtitleToast('A section of subtitles couldn\'t be translated — showing original.');
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
    // Handle per-tab subtitle knob override from popup (set/clear)
    if (msg.action === 'setSubtitleKnobOverride') {
      const o = (message as { knobOverrides?: Partial<ProfileKnobs> | null }).knobOverrides;
      applySubtitleKnobOverride(o);
    }
    // Popup queries the current tab override on open
    if (msg.action === 'getSubtitleKnobOverride') {
      _sendResponse({ knobOverrides: getSubtitleKnobOverride() });
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
    cleanupTextTrackCues();
    cleanupMseCues();
    cleanupManifestCues();
    cleanupMpdProcessing();
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
    cleanupRendererAttachmentRetry();
    if (state.isOverlayMode || state.activeRenderer) {
      destroyRenderer();
    }
    state.rendererCues = null;
    state.rendererConfig = null;
    restoreHtml5TextTracks();
    if (state.youtubeCaptionFallbackUrls.size > 0) {
      restoreYoutubeCaptionFallback();
      state.youtubeCaptionFallbackUrls.clear();
    }
    restoreNativeCaptions();
  };
}

/**
 * Manually trigger overlay mode (for testing or user preference).
 */
export async function forceOverlayMode(subtitleUrl: string, content?: string): Promise<void> {
  await activateOverlayMode(subtitleUrl, { content });
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
  cleanupRendererAttachmentRetry();
  if (state.isOverlayMode || state.activeRenderer) {
    destroyRenderer();
  }
  state.rendererCues = null;
  state.rendererConfig = null;
  restoreHtml5TextTracks();
  state.isOverlayMode = false;
  state.availableTracks = [];
  state.navigationEpoch++;
  state.videoIsPlaying = false;
  state.categoryOverride = undefined;
  // SPA navigation must not keep the previous page's auto category.
  _resetCategoryState();
  state.subtitleKnobOverride = undefined;
  state.activeSubtitleSessionId = null;
  resetActiveSource();
  state.activeTrackIdentity = null;
  state.fetchedTrackUrls.clear();
  if (state.youtubeCaptionFallbackUrls.size > 0) {
    restoreYoutubeCaptionFallback();
  }
  state.youtubeCaptionFallbackUrls.clear();
  state.mpdProcessingInFlight = false;
  state.mpdGraceUntil = 0;
  state.mpdProcessingStartedAt = 0;
  state.pendingDomCuesPayload = null;
  state.playbackAnchorTime = null;
  clearMpdDomFallbackTimer();
  if (seekResetTimer !== null) {
    clearTimeout(seekResetTimer);
    seekResetTimer = null;
  }
  state.translatedCues = null;
  state.interceptOriginalCues = [];
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
  clearManifestTranslationBuffers();
}

/**
 * Detect if current page is a video watch page (not a listing/home page).
 * Guards against auto-activate firing on YouTube home, search, etc.
 * Delegates to the current handler's isWatchPage() when available.
 */
export function isOnWatchPage(): boolean {
  if (typeof window === 'undefined') return false;
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

  // If tracks are already pre-parsed/discovered (e.g. from manifest or textTrack), use them directly
  if (payload.tracks && Array.isArray(payload.tracks)) {
    tracks = payload.tracks;
  } else if (handler?.extractAvailableTracks) {
    const rawPayload = payload as unknown as { body?: string; contentType?: string; url?: string };
    tracks = handler.extractAvailableTracks(
      rawPayload.body || JSON.stringify(payload),
      rawPayload.contentType || 'application/json',
      rawPayload.url || '',
    );
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

  // HBO Max: manifest tracks from MPD imply MPD processor may still be fetching TTML/VTT.
  // Arm grace before DOM captions can auto-activate (pre-play preview cues).
  if (
    payload.platform === 'hbomax' &&
    hbomaxUsesMpdSubtitlePipeline() &&
    state.activeSource !== 'manifest'
  ) {
    armMpdDomGraceWindow();
  }

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
async function tryAutoActivate(epochAtStart: number): Promise<{ activated: boolean; reason: string }> {
  if (state.isOverlayMode && state.activeSource === 'manifest') {
    return { activated: true, reason: 'manifest already active' };
  }
  if (
    state.isOverlayMode &&
    state.activeSource !== 'manifest' &&
    state.interceptOriginalCues.length > 0
  ) {
    return { activated: true, reason: 'full track already active' };
  }
  if (shouldSuppressSource('manifest')) {
    return { activated: false, reason: 'manifest suppressed' };
  }
  if (!isOnWatchPage()) return { activated: false, reason: 'not a watch page' };

  // Only activate if all known tracks belong to a single video
  const knownVideoIds = new Set(
    state.availableTracks.map((t) => t.videoId).filter((id): id is string => !!id),
  );
  if (knownVideoIds.size > 1) {
    console.log('AnyLLMTranslate: Skipping auto-activate — tracks from multiple videos', {
      videoIds: [...knownVideoIds],
    });
    return { activated: false, reason: 'multiple videos' };
  }

  const settings = await loadSettings();
  if (state.navigationEpoch !== epochAtStart) return { activated: false, reason: 'stale navigation' };

  // Per-site toggle: skip auto-activate for disabled platforms
  const currentHandler = detectCurrentHandler();
  if (currentHandler && isSiteDisabled(currentHandler.platform, settings.subtitleSettings.disabledSubtitleSites ?? [])) {
    return { activated: false, reason: 'site disabled' };
  }

  const preferredLang = settings.subtitleSettings?.preferredSubtitleLanguage;
  const autoActivate = settings.subtitleSettings?.autoActivateSubtitles;

  if (settings.subtitleSettings?.enabled && autoActivate && preferredLang) {
    const preferredMatches = state.availableTracks.filter(
      (t) => subtitleLanguagesMatch(t.language, preferredLang),
    );
    const preferred = preferredMatches.find((t) => t.url) ?? preferredMatches[0];
    if (preferred?.url) {
      if (isRootDashManifestUrl(preferred.url)) {
        console.log('AnyLLMTranslate: Skipping auto-activate on root DASH manifest — waiting for MPD processor');
        return { activated: false, reason: 'root mpd — use MPD processor' };
      }
      console.log('AnyLLMTranslate: Auto-activating preferred subtitle track on play', preferredLang);
      await selectSubtitleTrack(preferred.language);
      if (state.activeSource === 'manifest' || state.isOverlayMode || state.activeSubtitleSessionId !== null) {
        return { activated: true, reason: `manifest track ${preferredLang}` };
      }
      return { activated: false, reason: 'manifest track selection failed' };
    }
  }

  // YouTube first-load safety net: CC may already be on and timedtext may have
  // been served before intercept was handled. Fetch preferred/ASR timedtext and
  // run the same ASR+translate pipeline without requiring autoActivateSubtitles.
  if (settings.subtitleSettings?.enabled) {
    const proactive = await tryYoutubeProactiveTimedtext(epochAtStart, settings);
    if (proactive) {
      return { activated: true, reason: 'youtube proactive timedtext' };
    }
  }

  return { activated: false, reason: 'no manifest track with URL' };
}

/**
 * YouTube: if play started, tracks are known, and no intercept session is active,
 * proactively fetch preferred (or ASR) timedtext through the unified pipeline.
 */
async function tryYoutubeProactiveTimedtext(
  epochAtStart: number,
  settings: Awaited<ReturnType<typeof loadSettings>>,
): Promise<boolean> {
  if (state.isOverlayMode || state.activeSubtitleSessionId !== null) return false;
  if (state.interceptOriginalCues.length > 0) return false;
  if (!isOnWatchPage()) return false;

  const handler = detectCurrentHandler();
  if (!handler || handler.platform !== 'youtube') return false;
  if (state.navigationEpoch !== epochAtStart) return false;

  const preferredLang = settings.subtitleSettings?.preferredSubtitleLanguage || 'auto';
  const withUrl = state.availableTracks.filter((t) => !!t.url && t.platform === 'youtube');
  if (withUrl.length === 0) return false;

  let track: AvailableSubtitleTrack | undefined;
  if (preferredLang && preferredLang !== 'auto') {
    const matches = withUrl.filter((t) => subtitleLanguagesMatch(t.language, preferredLang));
    track =
      matches.find((t) => t.isAutoGenerated) ??
      matches[0] ??
      withUrl.find((t) => t.isAutoGenerated) ??
      withUrl[0];
  } else {
    track = withUrl.find((t) => t.isAutoGenerated) ?? withUrl[0];
  }

  if (!track?.url || !track.language) return false;
  if (isRootDashManifestUrl(track.url)) return false;

  console.log('AnyLLMTranslate: YouTube proactive timedtext fetch', {
    language: track.language,
    asr: track.isAutoGenerated,
    url: track.url,
  });
  await selectSubtitleTrack(track.language);
  return state.isOverlayMode || state.activeSubtitleSessionId !== null;
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

  // Generic handler toggle: skip auto-activate when "Generic subtitle detection" is off.
  if (handler.platform === 'generic' && settings.subtitleSettings.enableGenericSubtitleHandler === false) {
    return { activated: false, reason: 'generic handler disabled' };
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
    !subtitleLanguagesMatch(activeLang, preferred)
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
  const listenerMap = new Map<
    HTMLVideoElement,
    { play: () => void; pause: () => void; timeupdate: () => void }
  >();

  const runPlayActivation = () => {
    if (state.videoIsPlaying) return;
    state.videoIsPlaying = true;

    const epoch = state.navigationEpoch;
    // Yield to the event loop (200ms macrotask delay) so any in-flight postMessage events
    // (like manifest discovery or MPD started status) can register in the coordinator first.
    setTimeout(async () => {
      if (state.navigationEpoch !== epoch) return; // User navigated away

      console.log('AnyLLMTranslate: Video play detected — attempting auto-activate');
      const currentHandler = detectCurrentHandler();
      // Handlers with manifest patterns (e.g. HBO Max) get a chance at Tier 2
      // first. If manifest tracks were already discovered, tryAutoActivate will
      // select one; otherwise it no-ops and DOM cue flow handles activation
      // naturally when the first SUBTITLE_DOM_CUES message arrives.
      // Handlers without manifest patterns (pure DOM-only) go straight to
      // tryAutoActivateForDom (e.g. Youku).
      if (currentHandler?.getDomCueSource) {
        const hasManifestPatterns =
          typeof currentHandler.getManifestPatterns === 'function' &&
          currentHandler.getManifestPatterns().length > 0;
        if (hasManifestPatterns) {
          // Manifest first (Tier 2), then DOM fallback (Tier 5) if manifest misses.
          try {
            const manifestResult = await tryAutoActivate(epoch);
            if (!manifestResult.activated && state.activeSource !== 'manifest') {
              await waitForMpdGraceIfNeeded();
              if (!state.isOverlayMode) {
                await tryAutoActivateForDom();
              }
            }
          } catch (err) {
            console.warn('AnyLLMTranslate: Auto-activate on play failed', err);
            await tryAutoActivateForDom().catch(() => {});
          }
          return;
        }
        tryAutoActivateForDom().catch((err) => {
          console.warn('AnyLLMTranslate: DOM auto-activate on play failed', err);
        });
        return;
      }
      tryAutoActivate(epoch).catch((err) => {
        console.warn('AnyLLMTranslate: Auto-activate on play failed', err);
      });
    }, 200);
  };

  const attachPlayListener = (video: HTMLVideoElement) => {
    if (watchedVideos.has(video)) return;
    watchedVideos.add(video);

    const playHandler = () => {
      runPlayActivation();
    };

    const pauseHandler = () => {
      // Don't reset here — a brief pause shouldn't lose the "playing" state.
      // Only SPA navigation (resetCoordinatorState) should clear it.
    };

    const timeupdateHandler = () => {
      const lastTime = lastVideoTimes.get(video) ?? video.currentTime;
      const diff = Math.abs(video.currentTime - lastTime);
      if (diff < 1.5) {
        lastVideoTimes.set(video, video.currentTime);
      }
    };

    video.addEventListener('play', playHandler);
    video.addEventListener('pause', pauseHandler);
    video.addEventListener('seeked', handleVideoSeeked);
    video.addEventListener('timeupdate', timeupdateHandler);

    // Initialize the last known time
    lastVideoTimes.set(video, video.currentTime);

    // Already playing when watcher attaches (autoplay / late mount).
    if (!video.paused && !state.videoIsPlaying) {
      runPlayActivation();
    }

    listenerMap.set(video, {
      play: playHandler,
      pause: pauseHandler,
      timeupdate: timeupdateHandler,
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

  // Capture-phase document listener: play can fire on a video before
  // MutationObserver attaches per-element listeners (late-mounted players).
  // AbortController singleton avoids stacking handlers across module reloads/tests.
  type PlayCaptureWindow = Window & { __anyllmPlayCaptureAbort?: AbortController };
  const playWin = window as PlayCaptureWindow;
  playWin.__anyllmPlayCaptureAbort?.abort();
  const playCaptureAbort = new AbortController();
  playWin.__anyllmPlayCaptureAbort = playCaptureAbort;

  let disposed = false;
  const documentPlayCapture = (event: Event) => {
    if (disposed) return;
    const target = event.target;
    if (!(target instanceof HTMLVideoElement)) return;
    attachPlayListener(target);
    // Element listener is added after this capture tick may already have run;
    // activate once if nothing has claimed play yet.
    if (!state.videoIsPlaying) {
      runPlayActivation();
    }
  };
  document.addEventListener('play', documentPlayCapture, {
    capture: true,
    signal: playCaptureAbort.signal,
  });

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
    disposed = true;
    observer.disconnect();
    playCaptureAbort.abort();
    if (playWin.__anyllmPlayCaptureAbort === playCaptureAbort) {
      delete playWin.__anyllmPlayCaptureAbort;
    }
    // Remove all play/pause/seeked/timeupdate listeners on cleanup
    for (const [video, handlers] of listenerMap) {
      video.removeEventListener('play', handlers.play);
      video.removeEventListener('pause', handlers.pause);
      video.removeEventListener('seeked', handleVideoSeeked);
      video.removeEventListener('timeupdate', handlers.timeupdate);
    }
    listenerMap.clear();
    if (seekResetTimer !== null) {
      clearTimeout(seekResetTimer);
      seekResetTimer = null;
    }
  };
}

/**
 * Proactively fetch and translate a specific subtitle track by language.
 */
export async function selectSubtitleTrack(language: string): Promise<void> {
  const matchingTracks = state.availableTracks.filter((t) => subtitleLanguagesMatch(t.language, language));
  const track = matchingTracks.find((t) => t.url) ?? matchingTracks[0];
  const handler = detectCurrentHandler();
  if (handler?.getDomCueSource && !track?.url) {
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

  // Manifest-sourced tracks (HLS/DASH) use FETCH_MANIFEST_SUBTITLES to
  // fetch + assemble the full subtitle track upfront (Tier 2).
  const lowerUrl = track.url.toLowerCase().split('?')[0];
  if (lowerUrl.endsWith('.m3u8') || lowerUrl.endsWith('.mpd')) {
    console.log('AnyLLMTranslate: Manifest-sourced subtitle track detected', { url: track.url });
    state.fetchedTrackUrls.add(track.url);
    await activateOverlayModeFromManifest(track.url);
    return;
  }

  // YouTube timedtext: use the same ASR/cache/progress → translate path as intercept
  // so auto/proactive fetch is not a second-class overlay-only path.
  if (track.platform === 'youtube' || handler?.platform === 'youtube') {
    await activateYoutubeTrackViaPipeline(track);
    return;
  }

  // Task 6.3: Record fetched URL to deduplicate with interceptor flow
  state.fetchedTrackUrls.add(track.url);
  await activateOverlayMode(track.url, { sourceLanguageHint: track.language });
}

/** Coalesce concurrent proactive YouTube timedtext activations per URL. */
const youtubePipelineInflight = new Set<string>();

/**
 * Fetch a YouTube caption track and run parse → ASR/AI → overlay translate.
 */
async function activateYoutubeTrackViaPipeline(track: AvailableSubtitleTrack): Promise<void> {
  if (!track.url) return;
  if (youtubePipelineInflight.has(track.url)) return;
  if (state.fetchedTrackUrls.has(track.url) && (state.isOverlayMode || state.activeSubtitleSessionId !== null)) {
    return;
  }

  youtubePipelineInflight.add(track.url);
  try {
    await activateYoutubeTrackViaPipelineInner(track);
  } finally {
    youtubePipelineInflight.delete(track.url);
  }
}

async function activateYoutubeTrackViaPipelineInner(track: AvailableSubtitleTrack): Promise<void> {
  if (!track.url) return;
  const epochAtStart = state.navigationEpoch;

  const settings = state.cachedSettings ?? (await loadSettings());
  if (state.navigationEpoch !== epochAtStart) return;
  if (!state.cachedSettings) state.cachedSettings = settings;
  if (!settings.subtitleSettings.enabled) {
    cleanupActiveOverlay();
    return;
  }

  let body: string;
  try {
    // Canonicalize the proactive fetch on fmt=json3 (word-level) so this path
    // produces the same units + contentHash as the Settings pre-align flow
    // (cache-key parity, FR-9). Track identity/fallback keep the original URL;
    // the intercept path stays passive (it serves whatever the player asked).
    body = await fetchSubtitleContent(buildJson3TimedtextUrl(track.url));
  } catch (error) {
    console.error('AnyLLMTranslate: Failed to fetch YouTube timedtext', error);
    if (state.navigationEpoch !== epochAtStart) return;
    requestYoutubeCaptionFallback(track);
    return;
  }
  if (state.navigationEpoch !== epochAtStart) return;

  const platform = 'youtube';
  const ytHandler = getHandlerByPlatform(platform) ?? detectCurrentHandler();
  if (!ytHandler) {
    console.warn('AnyLLMTranslate: No YouTube handler for proactive timedtext');
    return;
  }

  const contentType =
    /[?&]fmt=json3(?:&|$)/i.test(track.url) || body.trimStart().startsWith('{')
      ? 'application/json'
      : 'text/xml';

  let rawCues = ytHandler.transformResponse(body, contentType, track.url);
  if (rawCues.length === 0) {
    // Fallback parser for non-handler formats (e.g. plain VTT fixtures in tests)
    const parsed = parseSubtitles(body);
    if (parsed.length === 0) {
      console.warn('AnyLLMTranslate: No cues in YouTube timedtext');
      requestYoutubeCaptionFallback(track);
      return;
    }
    rawCues = parsed;
  }

  const originalLanguage = track.language || 'en';

  const trackIdentity = `${originalLanguage}:${track.url}`;
  if (state.activeTrackIdentity !== null && state.activeTrackIdentity !== trackIdentity) {
    cancelBackgroundSubtitleSession();
    state.activeSubtitleSessionId = null;
    cleanupActiveOverlay();
    state.translatedCues = null;
  }
  state.activeTrackIdentity = trackIdentity;
  state.fetchedTrackUrls.add(track.url);

  const { cues, resegmentMode, asrEnable, asrAiEnable } = await applyYoutubeAsrPipeline({
    platform,
    url: track.url,
    body,
    rawCues,
    originalLanguage,
    settings,
  });
  if (state.navigationEpoch !== epochAtStart) return;

  if (resegmentMode !== 'off') {
    console.log('AnyLLMTranslate: YouTube ASR resegment (proactive)', {
      lang: originalLanguage,
      inputCues: rawCues.length,
      outputCues: cues.length,
      mode: resegmentMode,
      enable: asrEnable,
      aiEnable: asrAiEnable,
    });
  }

  const sourceLanguage =
    settings.sourceLanguage === 'auto' ? originalLanguage || 'en' : settings.sourceLanguage;

  await activateOverlayWithParsedCues({
    cues,
    sourceLanguage,
    settings,
    platform,
    navigationEpoch: epochAtStart,
  });
}

/**
 * Manual subtitle activation (Alt+S, context menu). Uses DOM path when the
 * current handler has no VTT URL.
 */
export async function manualActivateSubtitles(): Promise<void> {
  const handler = detectCurrentHandler();
  const tracks = getAvailableTracks();
  const settings = await loadSettings();
  const preferredLang = settings.subtitleSettings?.preferredSubtitleLanguage;

  const urlTrack = tracks.find(
    (t) => t.url && (
      !preferredLang ||
      preferredLang === 'auto' ||
      subtitleLanguagesMatch(t.language, preferredLang)
    ),
  );
  if (urlTrack) {
    await selectSubtitleTrack(urlTrack.language);
    if (state.activeSource === 'manifest') return;
  }

  if (handler?.getDomCueSource) {
    await tryAutoActivateForDom({ manual: true });
    return;
  }

  if (tracks.length === 0) {
    console.warn('AnyLLMTranslate: No subtitle tracks available for manual activation');
    return;
  }

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

/** Apply per-tab subtitle style knob overrides (popup + in-player mini studio). */
export function applySubtitleKnobOverride(
  knobs: Partial<ProfileKnobs> | null | undefined,
): void {
  state.subtitleKnobOverride = knobs ?? undefined;
}

/** Read current per-tab knob overrides. */
export function getSubtitleKnobOverride(): Partial<ProfileKnobs> {
  return state.subtitleKnobOverride ?? {};
}
