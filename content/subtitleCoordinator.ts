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

import { onSubtitleIntercepted, sendTranslatedSubtitle } from '@/content/messageBridge';
import { initializeOverlay, updateCues, cleanup as cleanupOverlay, getOverlayTextContainer } from '@/content/subtitleOverlay';
import { showSubtitleToast, hideSubtitleToast } from '@/content/subtitleToast';
import { initializeControls, enableDragReposition } from '@/content/subtitleControls';
import { parseSubtitles } from '@/lib/subtitleParser';
import { getHandlerByPlatform } from '@/inject/subtitleHandlers/registry';
import { loadSettings } from '@/lib/config';
import type { SubtitleCue, SubtitleInterceptedPayload } from '@/types/subtitle';

/** Coordinator state */
interface CoordinatorState {
  isOverlayMode: boolean;
  pendingRequests: Map<string, ReturnType<typeof setTimeout>>;
  interceptTimeout: number;
  dragCleanup: (() => void) | null;
}

const state: CoordinatorState = {
  isOverlayMode: false,
  pendingRequests: new Map(),
  interceptTimeout: 30000, // Default; overridden by loadSettings() on each interception
  dragCleanup: null,
};

/**
 * Handle subtitle interception from MAIN world.
 */
async function handleIntercepted(payload: SubtitleInterceptedPayload, requestId: string): Promise<void> {
  const { url, body, contentType, platform, originalLanguage } = payload;

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

    const response = await chrome.runtime.sendMessage({
      action: 'translateSubtitle',
      cues,
      sourceLanguage,
      targetLanguage: settings.targetLanguage,
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
    const response = await chrome.runtime.sendMessage({
      action: 'translateSubtitle',
      cues,
      sourceLanguage: settings.sourceLanguage,
      targetLanguage: settings.targetLanguage,
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

  // Pass subtitle appearance settings to the overlay
  const overlaySettings = await loadSettings().catch(() => null);
  const subtitleCfg = overlaySettings?.subtitleSettings;
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
 * Start the subtitle coordinator.
 * Returns a cleanup function.
 */
export function startCoordinator(): () => void {
  console.log('AnyLLMTranslate: Starting subtitle coordinator');

  // Listen for intercepted subtitles
  const cleanupBridge = onSubtitleIntercepted(handleIntercepted);

  // Listen for progressive chunk updates from background
  const handleExtensionMessage = (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    _sendResponse: () => void
  ) => {
    const msg = message as { action?: string; cues?: SubtitleCue[] };
    if (msg.action === 'SUBTITLE_CHUNK_TRANSLATED' && msg.cues) {
      updateTranslatedCues(msg.cues);
    }
  };
  chrome.runtime.onMessage.addListener(handleExtensionMessage);

  // Return cleanup function
  return () => {
    console.log('AnyLLMTranslate: Stopping subtitle coordinator');
    cleanupBridge();
    chrome.runtime.onMessage.removeListener(handleExtensionMessage);

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
 * Reset coordinator state (for testing).
 */
export function resetCoordinatorState(): void {
  state.isOverlayMode = false;
  if (state.dragCleanup) {
    state.dragCleanup();
    state.dragCleanup = null;
  }
  for (const timeoutId of state.pendingRequests.values()) {
    clearTimeout(timeoutId);
  }
  state.pendingRequests.clear();
}
