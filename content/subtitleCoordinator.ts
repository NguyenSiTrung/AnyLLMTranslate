/**
 * Subtitle Coordinator — Orchestrates subtitle translation flow.
 * Detects interception failure and auto-activates overlay fallback.
 *
 * Features:
 * - Detect when interception fails (timeout, error, no handler matched)
 * - Automatically activate overlay renderer
 * - Fetch subtitles directly via background worker (CORS bypass)
 * - Coordinate between bridge, translation, and overlay
 */

import { onSubtitleIntercepted } from '@/content/messageBridge';
import { onMessage } from '@/inject/messageBridge';
import { initializeOverlay, updateCues, cleanup as cleanupOverlay } from '@/content/subtitleOverlay';
import { initializeControls } from '@/content/subtitleControls';
import { parseSubtitles } from '@/lib/subtitleParser';
import type { SubtitleCue, SubtitleInterceptedPayload } from '@/types/subtitle';

/** Coordinator state */
interface CoordinatorState {
  isOverlayMode: boolean;
  pendingRequests: Map<string, ReturnType<typeof setTimeout>>;
  interceptTimeout: number;
}

const state: CoordinatorState = {
  isOverlayMode: false,
  pendingRequests: new Map(),
  interceptTimeout: 5000, // 5 seconds timeout for interception
};

/**
 * Handle subtitle interception from MAIN world.
 */
async function handleIntercepted(payload: SubtitleInterceptedPayload, requestId: string): Promise<void> {
  const { url, body } = payload;

  // Set up timeout for interception response
  const timeoutId = setTimeout(() => {
    // If no response received within timeout, switch to overlay mode
    if (!state.isOverlayMode) {
      console.warn('LinguaLens: Subtitle interception timeout, switching to overlay mode');
      activateOverlayMode(url, body);
    }
    state.pendingRequests.delete(requestId);
  }, state.interceptTimeout);

  state.pendingRequests.set(requestId, timeoutId);
}

/**
 * Activate overlay mode with fetched subtitles.
 */
async function activateOverlayMode(subtitleUrl: string, content?: string): Promise<void> {
  if (state.isOverlayMode) return;

  state.isOverlayMode = true;
  console.log('LinguaLens: Activating overlay fallback mode');

  // Fetch subtitle content if not provided
  let subtitleContent = content;
  if (!subtitleContent) {
    try {
      subtitleContent = await fetchSubtitleContent(subtitleUrl);
    } catch (error) {
      console.error('LinguaLens: Failed to fetch subtitle content', error);
      return;
    }
  }

  // Parse subtitles
  const cues = parseSubtitles(subtitleContent);
  if (cues.length === 0) {
    console.warn('LinguaLens: No cues found in subtitle content');
    return;
  }

  // Initialize overlay with controls
  await initializeControls();
  initializeOverlay(cues);

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
    console.warn('LinguaLens: Direct fetch failed, trying background worker', error);
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
    console.warn('LinguaLens: Cannot update cues - not in overlay mode');
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
 * Start the subtitle coordinator.
 * Returns a cleanup function.
 */
export function startCoordinator(): () => void {
  console.log('LinguaLens: Starting subtitle coordinator');

  // Listen for intercepted subtitles
  const cleanupBridge = onSubtitleIntercepted(handleIntercepted);

  // Listen for successful subtitle translations to cancel overlay fallback
  const cleanupTranslated = onMessage('SUBTITLE_TRANSLATED', (_payload, requestId) => {
    clearPendingRequest(requestId);
  });

  // Return cleanup function
  return () => {
    console.log('LinguaLens: Stopping subtitle coordinator');
    cleanupBridge();
    cleanupTranslated();

    // Clear all pending timeouts
    for (const timeoutId of state.pendingRequests.values()) {
      clearTimeout(timeoutId);
    }
    state.pendingRequests.clear();

    // Cleanup overlay if active
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
 * Reset coordinator state (for testing).
 */
export function resetCoordinatorState(): void {
  state.isOverlayMode = false;
  for (const timeoutId of state.pendingRequests.values()) {
    clearTimeout(timeoutId);
  }
  state.pendingRequests.clear();
}
