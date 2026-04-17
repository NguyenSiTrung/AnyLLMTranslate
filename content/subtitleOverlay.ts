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

import type { SubtitleCue } from '@/types/subtitle';

/** Overlay configuration options */
export interface OverlayConfig {
  fontSize: number; // 12-36px
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

/**
 * Find the first video element on the page.
 * Returns null if no video is found.
 */
function findVideoElement(): HTMLVideoElement | null {
  const videos = document.querySelectorAll('video');
  return videos.length > 0 ? videos[0] : null;
}

/**
 * Create the overlay DOM structure.
 */
function createOverlay(): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'anyllm-translate-subtitle-overlay';
  overlay.setAttribute('data-anyllm-role', 'subtitle-overlay');

  // Container for subtitle text
  const textContainer = document.createElement('div');
  textContainer.className = 'anyllm-translate-subtitle-text';
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
 */
function positionOverlay(overlay: HTMLElement, video: HTMLVideoElement, config: OverlayConfig): void {
  const videoRect = video.getBoundingClientRect();

  // Set overlay size to match video
  overlay.style.width = `${videoRect.width}px`;
  overlay.style.height = `${videoRect.height}px`;

  // Position overlay over video
  overlay.style.position = 'absolute';
  overlay.style.top = `${videoRect.top + window.scrollY}px`;
  overlay.style.left = `${videoRect.left + window.scrollX}px`;
  overlay.style.zIndex = '2147483647'; // Maximum z-index

  // Apply user offsets (drag-to-reposition)
  overlay.style.transform = `translate(${config.offsetX}px, ${config.offsetY}px)`;
}

/**
 * Update overlay styling based on configuration.
 */
function updateOverlayStyle(config: OverlayConfig): void {
  if (!overlayState.overlay) return;

  const overlay = overlayState.overlay;
  overlay.style.fontSize = `${config.fontSize}px`;

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
 * Find the active cue for the current video time.
 */
function findActiveCue(currentTime: number): number {
  for (let i = 0; i < overlayState.cues.length; i++) {
    const cue = overlayState.cues[i];
    if (currentTime >= cue.startTime && currentTime < cue.endTime) {
      return i;
    }
  }
  return -1;
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
 * Handle video resize using ResizeObserver.
 */
function handleResize(entries: ResizeObserverEntry[]): void {
  if (!overlayState.overlay || !overlayState.video) return;

  for (const entry of entries) {
    if (entry.target === overlayState.video) {
      positionOverlay(overlayState.overlay, overlayState.video, overlayState.config);
    }
  }
}

/**
 * Handle fullscreen change.
 */
function handleFullscreenChange(): void {
  const overlay = overlayState.overlay;
  const video = overlayState.video;
  if (!overlay || !video) return;

  // Re-position after fullscreen transition
  setTimeout(() => {
    positionOverlay(overlay, video, overlayState.config);
  }, 100);
}

/**
 * Attach event listeners to the video element.
 */
function attachVideoListeners(video: HTMLVideoElement): void {
  video.addEventListener('timeupdate', handleTimeUpdate);
  document.addEventListener('fullscreenchange', handleFullscreenChange);
}

/**
 * Detach event listeners from the video element.
 */
function detachVideoListeners(video: HTMLVideoElement): void {
  video.removeEventListener('timeupdate', handleTimeUpdate);
  document.removeEventListener('fullscreenchange', handleFullscreenChange);
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

  // Import CSS (will be handled by content script entrypoint)
}

/**
 * Update the subtitle cues (e.g., after translation).
 */
export function updateCues(cues: SubtitleCue[]): void {
  overlayState.cues = cues;
  overlayState.currentCueIndex = -1; // Force re-evaluation

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
 * Clean up and remove the overlay.
 */
export function cleanup(): void {
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
