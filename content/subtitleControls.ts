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

/** Storage key for subtitle preferences */
const STORAGE_KEY = 'anyllm-translate-subtitle-prefs';

/** Default preferences */
const DEFAULT_PREFS: OverlayConfig = {
  fontSize: 20,
  position: 'bottom',
  backgroundOpacity: 0.75,
  offsetX: 0,
  offsetY: 0,
  fontFamily: 'system',
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

/**
 * Load preferences from chrome.storage.local.
 */
export async function loadPreferences(): Promise<OverlayConfig> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const prefs = result[STORAGE_KEY];
    return prefs ? { ...DEFAULT_PREFS, ...prefs } : { ...DEFAULT_PREFS };
  } catch (error) {
    console.warn('AnyLLMTranslate: Failed to load subtitle preferences', error);
    return { ...DEFAULT_PREFS };
  }
}

/**
 * Save preferences to chrome.storage.local.
 */
export async function savePreferences(config: OverlayConfig): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: config });
  } catch (error) {
    console.warn('AnyLLMTranslate: Failed to save subtitle preferences', error);
  }
}

/**
 * Initialize controls with saved preferences.
 */
export async function initializeControls(): Promise<void> {
  const prefs = await loadPreferences();
  updateConfig(prefs);
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
 */
export function setOffset(offsetX: number, offsetY: number): void {
  const config = getConfig();
  const newConfig = { ...config, offsetX, offsetY };
  updateConfig(newConfig);
  savePreferences(newConfig).catch(() => {});
}

/**
 * Reset preferences to defaults.
 */
export async function resetPreferences(): Promise<void> {
  const defaultConfig = { ...DEFAULT_PREFS };
  updateConfig(defaultConfig);
  await savePreferences(defaultConfig);
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
 * Create a controls UI element (optional, for popup or options page).
 */
export function createControlsUI(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'anyllm-translate-subtitle-controls';
  container.setAttribute('data-anyllm-role', 'subtitle-controls');

  // Font size slider
  const fontSizeGroup = createSliderGroup(
    'Font Size',
    12,
    36,
    getConfig().fontSize,
    (value) => setFontSize(value),
  );
  container.appendChild(fontSizeGroup);

  // Position toggle
  const positionGroup = createToggleGroup(
    'Position',
    getConfig().position === 'top' ? 'Top' : 'Bottom',
    () => togglePosition(),
  );
  container.appendChild(positionGroup);

  // Background opacity slider
  const opacityGroup = createSliderGroup(
    'Background Opacity',
    0,
    100,
    Math.round(getConfig().backgroundOpacity * 100),
    (value) => setBackgroundOpacity(value / 100),
  );
  container.appendChild(opacityGroup);

  // Reset button
  const resetButton = document.createElement('button');
  resetButton.textContent = 'Reset to Defaults';
  resetButton.className = 'anyllm-translate-reset-button';
  resetButton.addEventListener('click', () => resetPreferences());
  container.appendChild(resetButton);

  return container;
}

/**
 * Create a slider group control.
 */
function createSliderGroup(
  label: string,
  min: number,
  max: number,
  value: number,
  onChange: (value: number) => void,
): HTMLElement {
  const group = document.createElement('div');
  group.className = 'anyllm-translate-control-group';

  const labelEl = document.createElement('label');
  labelEl.textContent = label;
  group.appendChild(labelEl);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = min.toString();
  slider.max = max.toString();
  slider.value = value.toString();
  slider.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;
    onChange(Number.parseInt(target.value, 10));
  });
  group.appendChild(slider);

  const valueDisplay = document.createElement('span');
  valueDisplay.textContent = value.toString();
  valueDisplay.className = 'anyllm-translate-value-display';
  slider.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;
    valueDisplay.textContent = target.value;
  });
  group.appendChild(valueDisplay);

  return group;
}

/**
 * Create a toggle group control.
 */
function createToggleGroup(label: string, currentValue: string, onToggle: () => void): HTMLElement {
  const group = document.createElement('div');
  group.className = 'anyllm-translate-control-group';

  const labelEl = document.createElement('label');
  labelEl.textContent = label;
  group.appendChild(labelEl);

  const button = document.createElement('button');
  button.textContent = currentValue;
  button.className = 'anyllm-translate-toggle-button';
  button.addEventListener('click', () => {
    onToggle();
    button.textContent = button.textContent === 'Top' ? 'Bottom' : 'Top';
  });
  group.appendChild(button);

  return group;
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
