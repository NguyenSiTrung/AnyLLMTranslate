/**
 * Subtitle Controls — User controls for subtitle overlay.
 * Provides font size slider, position toggle, background opacity slider, and drag-to-reposition.
 *
 * Features:
 * - Font size slider (12px–36px range)
 * - Position toggle (top/bottom of video)
 * - Background opacity slider (0%–100%)
 * - Drag-to-reposition functionality
 * - Persist user preferences in chrome.storage.local
 */

import type { OverlayConfig } from '@/content/subtitleOverlay';
import { updateConfig, getConfig } from '@/content/subtitleOverlay';
import { isContextInvalidated } from '@/lib/utils';

/** Storage key for subtitle style preferences (shared across sites). */
const STORAGE_KEY = 'anyllm-translate-subtitle-prefs';

/**
 * Storage key for per-host drag offsets: `{ [hostname]: { offsetX, offsetY } }`.
 * Drag offsets are position-on-video, which differs per player size/layout —
 * an offset tuned on one site's large player can park the overlay entirely off
 * the video on another site (reported on Udemy). Style prefs stay global.
 */
const OFFSET_STORAGE_KEY = 'anyllm-translate-subtitle-offsets';

/** Default preferences */
const DEFAULT_PREFS: OverlayConfig = {
  fontSize: 16,
  fontSizeMode: 'fixed',
  position: 'bottom',
  backgroundOpacity: 0.7,
  offsetX: 0,
  offsetY: 0,
  fontFamily: 'system',
  textColor: 'rgba(255,255,255,1)',
  originalTextColor: 'rgba(255,255,255,0.6)',
  backgroundColor: '0,0,0',
  borderRadius: 8,
  textShadow: '0 1px 3px rgba(0,0,0,0.5)',
  displayMode: 'bilingual',
};

/** Drag state */
interface DragState {
  isDragging: boolean;
  startX: number;
  startY: number;
  startOffsetX: number;
  startOffsetY: number;
}

let dragState: DragState = {
  isDragging: false,
  startX: 0,
  startY: 0,
  startOffsetX: 0,
  startOffsetY: 0,
};

interface StoredOffsets {
  offsetX: number;
  offsetY: number;
}

type OffsetMap = Record<string, StoredOffsets>;

/** Read the per-host offset map from storage. Empty map on any failure. */
async function loadOffsetMap(): Promise<OffsetMap> {
  if (isContextInvalidated()) return {};
  try {
    const result = await chrome.storage.local.get(OFFSET_STORAGE_KEY);
    const map = result[OFFSET_STORAGE_KEY];
    return map && typeof map === 'object' ? (map as OffsetMap) : {};
  } catch (error) {
    if (!isContextInvalidated()) {
      console.warn('AnyLLMTranslate: Failed to load subtitle drag offsets', error);
    }
    return {};
  }
}

/**
 * Load preferences from chrome.storage.local.
 * Style fields come from the shared blob; drag offsets come from this
 * hostname's entry (legacy offsets embedded in the shared blob are ignored).
 */
export async function loadPreferences(): Promise<OverlayConfig> {
  let prefs: OverlayConfig = { ...DEFAULT_PREFS };
  const offsets = await loadOffsetMap();
  if (isContextInvalidated()) {
    return prefs;
  }
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const stored = result[STORAGE_KEY];
    if (stored) prefs = { ...DEFAULT_PREFS, ...stored };
  } catch (error) {
    if (!isContextInvalidated()) {
      console.warn('AnyLLMTranslate: Failed to load subtitle preferences', error);
    }
  }
  const host = offsets[window.location.hostname];
  prefs.offsetX = host?.offsetX ?? 0;
  prefs.offsetY = host?.offsetY ?? 0;
  return prefs;
}

/**
 * Save style preferences to chrome.storage.local.
 * Drag offsets are deliberately NOT persisted here — they are per-host (see
 * saveOffsetForHost) and must not leak back into the shared blob.
 */
export async function savePreferences(config: OverlayConfig): Promise<void> {
  if (isContextInvalidated()) return;
  try {
    const { offsetX: _offsetX, offsetY: _offsetY, ...stylePrefs } = config;
    await chrome.storage.local.set({ [STORAGE_KEY]: stylePrefs });
  } catch (error) {
    if (!isContextInvalidated()) {
      console.warn('AnyLLMTranslate: Failed to save subtitle preferences', error);
    }
  }
}

/** Persist this hostname's drag offset entry. */
async function saveOffsetForHost(offsetX: number, offsetY: number): Promise<void> {
  // Capture the host before any await: an in-flight save must not land on a
  // different host if navigation changes location mid-save.
  const host = window.location.hostname;
  if (isContextInvalidated()) return;
  try {
    const map = await loadOffsetMap();
    map[host] = { offsetX, offsetY };
    await chrome.storage.local.set({ [OFFSET_STORAGE_KEY]: map });
  } catch (error) {
    if (!isContextInvalidated()) {
      console.warn('AnyLLMTranslate: Failed to save subtitle drag offsets', error);
    }
  }
}

/**
 * Initialize controls with saved preferences.
 */
export async function initializeControls(): Promise<OverlayConfig> {
  const prefs = await loadPreferences();
  updateConfig(prefs);
  return prefs;
}

/**
 * Update font size.
 */
export function setFontSize(fontSize: number): void {
  const clampedSize = Math.max(12, Math.min(36, fontSize));
  const config = getConfig();
  const newConfig = { ...config, fontSize: clampedSize };
  updateConfig(newConfig);
  savePreferences(newConfig).catch(() => {});
}

/**
 * Toggle position between top and bottom.
 */
export function togglePosition(): void {
  const config = getConfig();
  const newPosition: 'top' | 'bottom' = config.position === 'top' ? 'bottom' : 'top';
  const newConfig = { ...config, position: newPosition };
  updateConfig(newConfig);
  savePreferences(newConfig).catch(() => {});
}

/**
 * Update background opacity.
 */
export function setBackgroundOpacity(opacity: number): void {
  const clampedOpacity = Math.max(0, Math.min(1, opacity));
  const config = getConfig();
  const newConfig = { ...config, backgroundOpacity: clampedOpacity };
  updateConfig(newConfig);
  savePreferences(newConfig).catch(() => {});
}

/**
 * Update offset position (for drag-to-reposition).
 * Offsets persist per hostname so each site's player keeps its own position.
 */
export function setOffset(offsetX: number, offsetY: number): void {
  const config = getConfig();
  const newConfig = { ...config, offsetX, offsetY };
  updateConfig(newConfig);
  saveOffsetForHost(offsetX, offsetY).catch(() => {});
}

/**
 * Reset preferences to defaults.
 */
export async function resetPreferences(): Promise<void> {
  const defaultConfig = { ...DEFAULT_PREFS };
  updateConfig(defaultConfig);
  await Promise.all([
    savePreferences(defaultConfig),
    saveOffsetForHost(0, 0),
  ]);
}

/**
 * Enable drag-to-reposition on an element.
 */
export function enableDragReposition(element: HTMLElement): () => void {
  const handleMouseDown = (e: MouseEvent): void => {
    dragState.isDragging = true;
    dragState.startX = e.clientX;
    dragState.startY = e.clientY;
    dragState.startOffsetX = getConfig().offsetX;
    dragState.startOffsetY = getConfig().offsetY;
    element.style.cursor = 'grabbing';
  };

  const handleMouseMove = (e: MouseEvent): void => {
    if (!dragState.isDragging) return;

    const deltaX = e.clientX - dragState.startX;
    const deltaY = e.clientY - dragState.startY;

    const newOffsetX = dragState.startOffsetX + deltaX;
    const newOffsetY = dragState.startOffsetY + deltaY;

    setOffset(newOffsetX, newOffsetY);
  };

  const handleMouseUp = (): void => {
    if (dragState.isDragging) {
      dragState.isDragging = false;
      element.style.cursor = 'grab';
    }
  };

  element.style.cursor = 'grab';
  element.addEventListener('mousedown', handleMouseDown);
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);

  // Return cleanup function
  return () => {
    element.removeEventListener('mousedown', handleMouseDown);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    element.style.cursor = '';
  };
}

/**
 * Reset drag state (for testing).
 */
export function resetDragState(): void {
  dragState = {
    isDragging: false,
    startX: 0,
    startY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
  };
}
