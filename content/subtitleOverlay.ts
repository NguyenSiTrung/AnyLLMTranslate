/**
 * Subtitle Overlay Renderer — Custom fallback subtitle display.
 * Renders bilingual subtitles over video elements when interception fails.
 *
 * Features:
 * - Auto-detect video element on page
 * - Create overlay DOM positioned over video
 * - Sync displayed cue with video.currentTime via timeupdate event
 * - Handle video resize and fullscreen mode (ResizeObserver + fullscreenchange)
 * - Smooth fade-in/out transitions between cues
 */

import { findPrimaryVideo } from '@/lib/findPrimaryVideo';
import type { SubtitleCue } from '@/types/subtitle';
import type { SubtitleFontSizeMode } from '@/types/config';

/** Overlay configuration options */
export interface OverlayConfig {
  fontSize: number; // 12-36px (used when fontSizeMode is 'fixed')
  fontSizeMode: SubtitleFontSizeMode; // 'fixed' or 'auto'
  position: 'top' | 'bottom'; // Position relative to video
  backgroundOpacity: number; // 0-1
  offsetX: number; // Drag offset X
  offsetY: number; // Drag offset Y
  /** Font family for subtitle text (CSS value) */
  fontFamily: string;
  /** Whether to show original + translated, or translated only */
  displayMode: 'bilingual' | 'translation-only';
}

/** Default overlay configuration */
const DEFAULT_CONFIG: OverlayConfig = {
  fontSize: 20,
  fontSizeMode: 'fixed',
  position: 'bottom',
  backgroundOpacity: 0.75,
  offsetX: 0,
  offsetY: 0,
  fontFamily: 'system-ui, sans-serif',
  displayMode: 'bilingual',
};

/** Overlay state */
interface OverlayState {
  video: HTMLVideoElement | null;
  overlay: HTMLElement | null;
  cues: SubtitleCue[];
  currentCueIndex: number;
  config: OverlayConfig;
  isAttached: boolean;
  resizeObserver: ResizeObserver | null;
}

const overlayState: OverlayState = {
  video: null,
  overlay: null,
  cues: [],
  currentCueIndex: -1,
  config: { ...DEFAULT_CONFIG },
  isAttached: false,
  resizeObserver: null,
};

/** Tracked fullscreen reposition timeouts — cleared on cleanup to prevent leaks. */
const fullscreenRepositionTimeouts = new Set<ReturnType<typeof setTimeout>>();

type PopoverElement = HTMLElement & {
  showPopover?: () => void;
  hidePopover?: () => void;
};

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  mozFullScreenElement?: Element | null;
  msFullscreenElement?: Element | null;
};

function showManualPopover(overlay: HTMLElement): boolean {
  const popoverOverlay = overlay as PopoverElement;
  if (!('popover' in overlay) || typeof popoverOverlay.showPopover !== 'function') {
    return false;
  }

  overlay.setAttribute('popover', 'manual');
  try {
    popoverOverlay.showPopover();
    return true;
  } catch {
    return overlay.hasAttribute('popover');
  }
}

function hideManualPopover(overlay: HTMLElement): void {
  if (!overlay.hasAttribute('popover')) return;

  const popoverOverlay = overlay as PopoverElement;
  try {
    popoverOverlay.hidePopover?.();
  } catch {
    // ignore popover state errors
  }
  overlay.removeAttribute('popover');
}

function getActiveFullscreenElement(): Element | null {
  const fullscreenDocument = document as FullscreenDocument;
  return (
    document.fullscreenElement ??
    fullscreenDocument.webkitFullscreenElement ??
    fullscreenDocument.mozFullScreenElement ??
    fullscreenDocument.msFullscreenElement ??
    null
  );
}

function isViewportSized(rect: DOMRect): boolean {
  const width = window.innerWidth || document.documentElement.clientWidth;
  const height = window.innerHeight || document.documentElement.clientHeight;
  if (width <= 0 || height <= 0) return false;

  return (
    rect.width >= width * 0.9 &&
    rect.height >= height * 0.9 &&
    rect.left <= width * 0.1 &&
    rect.top <= height * 0.1
  );
}

function findFullscreenSizedPlayerContainer(video: HTMLVideoElement): HTMLElement | null {
  const container = video.closest<HTMLElement>('[data-testid="playerContainer"]');
  if (!container) return null;

  const videoRect = video.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  if (!isViewportSized(videoRect) && !isViewportSized(containerRect)) {
    return null;
  }

  return container;
}

function ensureContainerPositioning(container: HTMLElement): void {
  const containerPosition = getComputedStyle(container).position;
  if (containerPosition === 'static') {
    container.style.position = 'relative';
  }
}

function syncOverlayHost(overlay: HTMLElement, video: HTMLVideoElement): HTMLElement | null {
  const fullscreenEl = getActiveFullscreenElement();

  if (fullscreenEl) {
    if (fullscreenEl === video) {
      if (overlay.parentElement !== document.body) {
        document.body.appendChild(overlay);
      }
      showManualPopover(overlay);
      return null;
    }

    hideManualPopover(overlay);
    if (fullscreenEl instanceof HTMLElement) {
      if (overlay.parentElement !== fullscreenEl) {
        fullscreenEl.appendChild(overlay);
      }
      ensureContainerPositioning(fullscreenEl);
      return fullscreenEl;
    }
  }

  hideManualPopover(overlay);
  const fullscreenSizedContainer = findFullscreenSizedPlayerContainer(video);
  if (fullscreenSizedContainer) {
    if (overlay.parentElement !== fullscreenSizedContainer) {
      fullscreenSizedContainer.appendChild(overlay);
    }
    ensureContainerPositioning(fullscreenSizedContainer);
    return fullscreenSizedContainer;
  }

  if (overlay.parentElement !== document.body) {
    document.body.appendChild(overlay);
  }
  return null;
}

/**
 * Find the primary video element on the page (largest by layout area).
 * Returns null if no video is found.
 */
function findVideoElement(): HTMLVideoElement | null {
  return findPrimaryVideo();
}

/**
 * Create the overlay DOM structure.
 */
function createOverlay(): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'anyllm-translate-subtitle-overlay';
  overlay.setAttribute('data-anyllm-role', 'subtitle-overlay');
  overlay.setAttribute('role', 'caption');
  overlay.setAttribute('aria-label', 'Translated subtitles overlay');
  overlay.setAttribute('aria-live', 'polite');

  // Container for subtitle text
  const textContainer = document.createElement('div');
  textContainer.className = 'anyllm-translate-subtitle-text';
  textContainer.setAttribute('aria-live', 'polite');
  overlay.appendChild(textContainer);

  // Original text (smaller, dimmer)
  const originalText = document.createElement('div');
  originalText.className = 'anyllm-translate-subtitle-original';
  textContainer.appendChild(originalText);

  // Translated text (larger, brighter)
  const translatedText = document.createElement('div');
  translatedText.className = 'anyllm-translate-subtitle-translated';
  textContainer.appendChild(translatedText);

  return overlay;
}

/**
 * Position the overlay over the video element.
 * When inside a fullscreen container, the overlay should fill the container
 * using position:absolute instead of fixed viewport coordinates.
 */
function positionOverlay(overlay: HTMLElement, video: HTMLVideoElement, config: OverlayConfig): void {
  const fullscreenContainer = syncOverlayHost(overlay, video);

  if (fullscreenContainer && overlay.parentElement === fullscreenContainer) {
    // Inside a fullscreen container: use absolute positioning to fill the container.
    // The video fills the fullscreen container, so we cover the whole area.
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.zIndex = '2147483647';
    overlay.style.transform = `translate(${config.offsetX}px, ${config.offsetY}px)`;
    return;
  }

  // Normal (non-fullscreen) mode, or Popover fullscreen mode:
  // Position fixed over video using viewport coords.
  const videoRect = video.getBoundingClientRect();
  overlay.style.width = `${videoRect.width}px`;
  overlay.style.height = `${videoRect.height}px`;
  overlay.style.position = 'fixed';
  overlay.style.top = `${videoRect.top}px`;
  overlay.style.left = `${videoRect.left}px`;
  overlay.style.zIndex = '2147483647';

  // Apply user offsets (drag-to-reposition)
  overlay.style.transform = `translate(${config.offsetX}px, ${config.offsetY}px)`;
}

/**
 * Calculate font size automatically based on video dimensions.
 * Uses ~3.5% of video height, clamped to 14–48px.
 * This ensures subtitles look proportional whether the video is a small
 * embedded player (e.g. Udemy ~400px tall) or fullscreen (1080p+).
 */
export function calculateAutoFontSize(videoHeight: number): number {
  const AUTO_FONT_RATIO = 0.035;
  const AUTO_FONT_MIN = 14;
  const AUTO_FONT_MAX = 48;
  return Math.round(
    Math.max(AUTO_FONT_MIN, Math.min(AUTO_FONT_MAX, videoHeight * AUTO_FONT_RATIO)),
  );
}

/**
 * Resolve the effective font size based on config and video dimensions.
 */
function resolveEffectiveFontSize(config: OverlayConfig, videoHeight: number): number {
  if (config.fontSizeMode === 'auto') {
    return calculateAutoFontSize(videoHeight);
  }
  return config.fontSize;
}

/**
 * Update overlay styling based on configuration.
 */
function updateOverlayStyle(config: OverlayConfig): void {
  if (!overlayState.overlay) return;

  const overlay = overlayState.overlay;

  // Resolve font size — auto mode needs video dimensions
  const videoHeight = overlayState.video?.getBoundingClientRect().height ?? 0;
  const effectiveFontSize = resolveEffectiveFontSize(config, videoHeight);
  overlay.style.fontSize = `${effectiveFontSize}px`;

  // Set position class
  overlay.classList.remove('anyllm-translate-position-top', 'anyllm-translate-position-bottom');
  overlay.classList.add(`anyllm-translate-position-${config.position}`);

  // Set background opacity
  overlay.style.setProperty('--anyllm-subtitle-bg-opacity', config.backgroundOpacity.toString());

  // Set font family via CSS custom property
  overlay.style.setProperty('--anyllm-subtitle-font-family', config.fontFamily);

  // Set display mode via data attribute (CSS handles show/hide of original text)
  overlay.setAttribute('data-display-mode', config.displayMode);
}

/**
 * Find the active cue for the current video time using binary search.
 * Returns the index of the last cue whose [startTime, endTime) contains currentTime.
 * O(log n) instead of O(n) per timeupdate event.
 */
function findActiveCue(currentTime: number): number {
  const cues = overlayState.cues;
  if (cues.length === 0) return -1;

  let lo = 0;
  let hi = cues.length - 1;
  let result = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const cue = cues[mid];

    if (currentTime < cue.startTime) {
      hi = mid - 1;
    } else if (currentTime >= cue.endTime) {
      lo = mid + 1;
    } else {
      // Found a matching cue — but there may be multiple overlapping cues.
      // Task 6.6: Return the LAST (most recent) matching cue after seeks.
      result = mid;
      lo = mid + 1;
    }
  }

  return result;
}

/**
 * Update the displayed subtitle text.
 */
function updateDisplayedText(cueIndex: number): void {
  if (!overlayState.overlay) return;

  const originalEl = overlayState.overlay.querySelector('.anyllm-translate-subtitle-original') as HTMLElement;
  const translatedEl = overlayState.overlay.querySelector('.anyllm-translate-subtitle-translated') as HTMLElement;

  if (cueIndex >= 0 && cueIndex < overlayState.cues.length) {
    const cue = overlayState.cues[cueIndex];
    originalEl.textContent = cue.originalText || cue.text;
    translatedEl.textContent = cue.text;
    overlayState.overlay.classList.add('anyllm-translate-subtitle-visible');
  } else {
    originalEl.textContent = '';
    translatedEl.textContent = '';
    overlayState.overlay.classList.remove('anyllm-translate-subtitle-visible');
  }
}

/**
 * Handle video timeupdate event to sync subtitles.
 */
function handleTimeUpdate(): void {
  if (!overlayState.video) return;

  const currentTime = overlayState.video.currentTime;
  const activeCueIndex = findActiveCue(currentTime);

  // Only update if the cue changed
  if (activeCueIndex !== overlayState.currentCueIndex) {
    overlayState.currentCueIndex = activeCueIndex;
    updateDisplayedText(activeCueIndex);
  }
}

/**
 * Handle video seeked event to prioritize translation of the target chunk.
 */
function handleSeeked(): void {
  if (!overlayState.video) return;
  if (overlayState.cues.length === 0) return;

  const currentTime = overlayState.video.currentTime;
  const activeCueIndex = findActiveCue(currentTime);

  if (activeCueIndex !== -1) {
    chrome.runtime.sendMessage({
      action: 'PRIORITIZE_SUBTITLE_CHUNK',
      cueIndex: activeCueIndex,
    }).catch(() => {
      // Ignore background script not listening errors
    });
  }
}

/**
 * Handle video resize using ResizeObserver.
 */
function handleResize(entries: ResizeObserverEntry[]): void {
  if (!overlayState.overlay || !overlayState.video) return;

  for (const entry of entries) {
    if (entry.target === overlayState.video) {
      positionOverlay(overlayState.overlay, overlayState.video, overlayState.config);
      // Recalculate font size on resize (important for auto mode)
      updateOverlayStyle(overlayState.config);
    }
  }
}

/**
 * Handle fullscreen change.
 * HBO Max (and similar custom players) fullscreen a container element,
 * not the <video> itself. The overlay must be reparented into that container
 * and re-positioned with absolute coordinates to remain visible.
 */
function handleFullscreenChange(): void {
  const overlay = overlayState.overlay;
  const video = overlayState.video;
  if (!overlay || !video) return;

  syncOverlayHost(overlay, video);

  // Re-position and recalculate font size after fullscreen transition.
  // Use two timeouts: an immediate one to cover fast transitions and
  // a delayed one for slow animation completions (HBO Max player has
  // ~300ms fullscreen animation).
  const reposition = () => {
    if (!overlayState.overlay || !overlayState.video) return;
    positionOverlay(overlayState.overlay, overlayState.video, overlayState.config);
    updateOverlayStyle(overlayState.config);
  };
  const scheduleReposition = (delay: number): void => {
    const id = setTimeout(() => {
      fullscreenRepositionTimeouts.delete(id);
      reposition();
    }, delay);
    fullscreenRepositionTimeouts.add(id);
  };
  scheduleReposition(50);
  scheduleReposition(350);
}

/**
 * Attach event listeners to the video element.
 */
function attachVideoListeners(video: HTMLVideoElement): void {
  video.addEventListener('timeupdate', handleTimeUpdate);
  video.addEventListener('seeked', handleSeeked);
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
}

/**
 * Detach event listeners from the video element.
 */
function detachVideoListeners(video: HTMLVideoElement): void {
  video.removeEventListener('timeupdate', handleTimeUpdate);
  video.removeEventListener('seeked', handleSeeked);
  document.removeEventListener('fullscreenchange', handleFullscreenChange);
  document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
}

/**
 * Set up ResizeObserver for video element.
 */
function setupResizeObserver(video: HTMLVideoElement): void {
  overlayState.resizeObserver = new ResizeObserver(handleResize);
  overlayState.resizeObserver.observe(video);
}

/**
 * Clean up ResizeObserver.
 */
function cleanupResizeObserver(): void {
  if (overlayState.resizeObserver) {
    overlayState.resizeObserver.disconnect();
    overlayState.resizeObserver = null;
  }
}

/**
 * Initialize the subtitle overlay with subtitle cues.
 */
export function initializeOverlay(cues: SubtitleCue[], config?: Partial<OverlayConfig>, videoNode?: HTMLVideoElement): void {
  // Use provided video element or find one
  const video = videoNode || findVideoElement();
  if (!video) {
    console.warn('AnyLLMTranslate: No video element found for subtitle overlay');
    return;
  }

  // Clean up existing overlay if any
  cleanup();

  // Store state
  overlayState.video = video;
  overlayState.cues = cues;
  overlayState.config = { ...DEFAULT_CONFIG, ...config };
  overlayState.currentCueIndex = -1;

  // Create and position overlay
  overlayState.overlay = createOverlay();
  document.body.appendChild(overlayState.overlay);
  positionOverlay(overlayState.overlay, video, overlayState.config);
  updateOverlayStyle(overlayState.config);

  // Attach listeners
  attachVideoListeners(video);
  setupResizeObserver(video);

  overlayState.isAttached = true;

  // Apply fullscreen logic immediately if already in fullscreen
  if (getActiveFullscreenElement()) {
    handleFullscreenChange();
  }

  // Import CSS (will be handled by content script entrypoint)
}

/**
 * Update the subtitle cues (e.g., after translation).
 * Task 6.5: Only reset currentCueIndex if the cue array reference actually changed.
 * If the same array is updated in place, keep currentCueIndex and let handleTimeUpdate
 * check if the active cue content changed.
 */
export function updateCues(cues: SubtitleCue[]): void {
  const wasSameRef = overlayState.cues === cues;
  overlayState.cues = cues;

  if (!wasSameRef) {
    // New array reference — force re-evaluation
    overlayState.currentCueIndex = -1;
  }

  // Update display immediately if video is playing
  if (overlayState.video) {
    handleTimeUpdate();
  }
}

/**
 * Update overlay configuration.
 */
export function updateConfig(config: Partial<OverlayConfig>): void {
  overlayState.config = { ...overlayState.config, ...config };
  updateOverlayStyle(overlayState.config);

  if (overlayState.overlay && overlayState.video) {
    positionOverlay(overlayState.overlay, overlayState.video, overlayState.config);
  }
}

/**
 * Get current overlay configuration.
 */
export function getConfig(): OverlayConfig {
  return { ...overlayState.config };
}

/**
 * Check if overlay is currently active.
 */
export function isOverlayActive(): boolean {
  return overlayState.isAttached;
}

/**
 * Get the overlay's interactive text container element.
 * Used by subtitleControls to attach drag-to-reposition listeners.
 * Returns null if overlay is not attached.
 */
export function getOverlayTextContainer(): HTMLElement | null {
  return overlayState.overlay?.querySelector('.anyllm-translate-subtitle-text') ?? null;
}

/**
 * Clean up and remove the overlay.
 */
export function cleanup(): void {
  // Clear any pending fullscreen reposition timeouts
  for (const id of fullscreenRepositionTimeouts) {
    clearTimeout(id);
  }
  fullscreenRepositionTimeouts.clear();

  if (overlayState.video) {
    detachVideoListeners(overlayState.video);
  }

  cleanupResizeObserver();

  if (overlayState.overlay) {
    overlayState.overlay.remove();
    overlayState.overlay = null;
  }

  overlayState.video = null;
  overlayState.cues = [];
  overlayState.currentCueIndex = -1;
  overlayState.isAttached = false;
}

/**
 * Reset overlay state (for testing).
 */
export function resetOverlayState(): void {
  cleanup();
  overlayState.config = { ...DEFAULT_CONFIG };
}
