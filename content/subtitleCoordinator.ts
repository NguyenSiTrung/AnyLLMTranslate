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

import { onSubtitleIntercepted, sendTranslatedSubtitle, onTracksDiscovered } from '@/content/messageBridge';
import { initializeOverlay, updateCues, cleanup as cleanupOverlay, getOverlayTextContainer } from '@/content/subtitleOverlay';
import { showSubtitleToast, hideSubtitleToast } from '@/content/subtitleToast';
import { initializeControls, enableDragReposition } from '@/content/subtitleControls';
import { parseSubtitles } from '@/lib/subtitleParser';
import { getHandlerByPlatform, detectCurrentHandler } from '@/inject/subtitleHandlers/registry';
import { loadSettings } from '@/lib/config';
import type { SubtitleCue, SubtitleInterceptedPayload, AvailableSubtitleTrack, SubtitleTracksDiscoveredPayload } from '@/types/subtitle';

/** Coordinator state */
interface CoordinatorState {
  isOverlayMode: boolean;
  pendingRequests: Map<string, ReturnType<typeof setTimeout>>;
  interceptTimeout: number;
  dragCleanup: (() => void) | null;
  availableTracks: AvailableSubtitleTrack[];
}

const state: CoordinatorState = {
  isOverlayMode: false,
  pendingRequests: new Map(),
  interceptTimeout: 30000, // Default; overridden by loadSettings() on each interception
  dragCleanup: null,
  availableTracks: [],
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

  // Listen for track discovery from MAIN world
  const cleanupDiscovery = onTracksDiscovered(handleTracksDiscovered);

  // Listen for progressive chunk updates from background
  const handleExtensionMessage = (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    _sendResponse: () => void
  ) => {
    const msg = message as { action?: string; cues?: SubtitleCue[]; language?: string };
    if (msg.action === 'SUBTITLE_CHUNK_TRANSLATED' && msg.cues) {
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
  };
  chrome.runtime.onMessage.addListener(handleExtensionMessage);

  // Return cleanup function
  return () => {
    console.log('AnyLLMTranslate: Stopping subtitle coordinator');
    cleanupBridge();
    cleanupDiscovery();
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
  state.availableTracks = [];
  if (state.dragCleanup) {
    state.dragCleanup();
    state.dragCleanup = null;
  }
  for (const timeoutId of state.pendingRequests.values()) {
    clearTimeout(timeoutId);
  }
  state.pendingRequests.clear();
}

/**
 * Handle discovered subtitle tracks from MAIN world bridge.
 * Deduplicates, stores, notifies popup, and auto-activates if configured.
 */
async function handleTracksDiscovered(payload: SubtitleTracksDiscoveredPayload): Promise<void> {
  const handler = detectCurrentHandler();
  let tracks: AvailableSubtitleTrack[];

  // If the current handler can extract structured tracks, use it
  if (handler?.extractAvailableTracks) {
    const rawPayload = payload as unknown as { body?: string; contentType?: string; url?: string };
    tracks = handler.extractAvailableTracks(
      rawPayload.body || JSON.stringify(payload),
      rawPayload.contentType || 'application/json',
      rawPayload.url || '',
    );
  } else if (payload.tracks && Array.isArray(payload.tracks)) {
    // Direct tracks from TextTrack discovery (html5 fallback)
    tracks = payload.tracks;
  } else {
    return;
  }

  if (tracks.length === 0) return;

  // Merge with existing tracks (deduplicate by language+platform)
  for (const track of tracks) {
    const existing = state.availableTracks.find(
      (t) => t.language === track.language && t.platform === track.platform,
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
  });

  // Notify popup/UI about available tracks
  try {
    chrome.runtime.sendMessage({
      action: 'SUBTITLE_TRACKS_AVAILABLE',
      tracks: state.availableTracks,
    });
  } catch { /* popup may not be open */ }

  // Auto-activate if configured
  const settings = await loadSettings();
  const preferredLang = settings.subtitleSettings?.preferredSubtitleLanguage;
  const autoActivate = settings.subtitleSettings?.autoActivateSubtitles;

  if (autoActivate && preferredLang && !state.isOverlayMode) {
    const preferred = state.availableTracks.find((t) => t.language === preferredLang);
    if (preferred?.url) {
      console.log('AnyLLMTranslate: Auto-activating preferred subtitle track', preferredLang);
      await selectSubtitleTrack(preferredLang);
    }
  }
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
