/**
 * Mouse Hover Translate — translates paragraph-level elements on hover
 * with configurable delay, using existing translationDisplay for injection.
 */

import { loadSettings } from '@/lib/config';
import { applyTranslation } from '@/content/translationDisplay';
import { DATA_ATTRS } from '@/lib/constants';

/** Paragraph-level elements eligible for hover translate */
const HOVER_TARGETS = new Set([
  'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TD',
  'BLOCKQUOTE', 'FIGCAPTION', 'DT', 'DD', 'SUMMARY',
]);

/** State management */
let isEnabled = false;
let hoverDelay = 300;
let hoverTimer: ReturnType<typeof setTimeout> | null = null;
let currentHoverTarget: Element | null = null;

/** Cache of already-translated elements (element → translatedText) */
const hoverCache = new Map<Element, string>();

/** Generate a unique piece ID for hover translations */
function generateHoverId(element: Element): string {
  const text = element.textContent?.slice(0, 50) ?? '';
  const hash = Array.from(text).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
  return `hover-${Math.abs(hash).toString(36)}`;
}

/** Check if element should be skipped */
function shouldSkip(element: Element): boolean {
  // Skip non-target elements
  if (!HOVER_TARGETS.has(element.tagName)) return true;

  // Skip elements already translated by page translation
  if (element.hasAttribute(DATA_ATTRS.TRANSLATED)) return true;

  // Skip elements with lingua role (our elements)
  const role = element.getAttribute(DATA_ATTRS.ROLE);
  if (role) return true;

  // Skip elements with no meaningful text content
  const text = element.textContent?.trim() ?? '';
  if (text.length < 2) return true;

  return false;
}

/** Handle mouseover event */
async function onMouseOver(event: MouseEvent): Promise<void> {
  if (!isEnabled) return;

  const target = event.target as HTMLElement;

  // Find closest paragraph-level parent
  const hoverTarget = findHoverTarget(target);
  if (!hoverTarget) return;

  // Skip if already hovered or should be skipped
  if (hoverTarget === currentHoverTarget) return;
  if (shouldSkip(hoverTarget)) return;

  // Clear any pending timer
  cancelHoverTimer();
  currentHoverTarget = hoverTarget;

  // Check if already translated via hover
  if (hoverCache.has(hoverTarget)) return;

  // Start hover delay timer
  hoverTimer = setTimeout(async () => {
    await translateHoverTarget(hoverTarget);
  }, hoverDelay);
}

/** Handle mouseout event */
function onMouseOut(event: MouseEvent): void {
  const relatedTarget = event.relatedTarget as HTMLElement | null;

  // Only cancel if we've left the current hover target entirely
  if (currentHoverTarget && relatedTarget && currentHoverTarget.contains(relatedTarget)) {
    return;
  }

  cancelHoverTimer();
  currentHoverTarget = null;
}

/** Find the closest paragraph-level element */
function findHoverTarget(element: HTMLElement): Element | null {
  let current: HTMLElement | null = element;
  while (current && current !== document.body) {
    if (HOVER_TARGETS.has(current.tagName)) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

/** Cancel the pending hover timer */
function cancelHoverTimer(): void {
  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
}

/** Translate the hovered element */
async function translateHoverTarget(element: Element): Promise<void> {
  if (!isEnabled) return;

  // Check cache first
  if (hoverCache.has(element)) return;

  const text = element.textContent?.trim() ?? '';
  if (text.length < 2) return;

  const pieceId = generateHoverId(element);

  // Check if already injected
  if (document.querySelector(`[${DATA_ATTRS.PIECE_ID}="${pieceId}"]`)) {
    return;
  }

  try {
    const settings = await loadSettings();

    const response = await chrome.runtime.sendMessage({
      action: 'translateSelection',
      text,
      sourceLanguage: settings.sourceLanguage,
      targetLanguage: settings.targetLanguage,
    });

    if (response?.success && response.translatedText) {
      // Use existing translationDisplay for consistent theming
      applyTranslation(element, pieceId, response.translatedText);
      hoverCache.set(element, response.translatedText);
    }
  } catch (error) {
    console.warn('[LinguaLens] Hover translate failed:', error);
  }
}

/** Initialize hover translate feature */
export function initHoverTranslate(): () => void {
  document.addEventListener('mouseover', onMouseOver);
  document.addEventListener('mouseout', onMouseOut);

  return () => {
    document.removeEventListener('mouseover', onMouseOver);
    document.removeEventListener('mouseout', onMouseOut);
    cancelHoverTimer();
    currentHoverTarget = null;
  };
}

/** Enable/disable hover translate */
export function setHoverTranslateEnabled(enabled: boolean): void {
  isEnabled = enabled;
  if (!enabled) {
    cancelHoverTimer();
    currentHoverTarget = null;
  }
}

/** Update the hover delay */
export function setHoverDelay(delay: number): void {
  hoverDelay = Math.max(200, Math.min(500, delay));
}

/** Get current enabled state */
export function isHoverTranslateEnabled(): boolean {
  return isEnabled;
}

/** Clear hover translation cache */
export function clearHoverCache(): void {
  hoverCache.clear();
}

export { HOVER_TARGETS, hoverCache };
