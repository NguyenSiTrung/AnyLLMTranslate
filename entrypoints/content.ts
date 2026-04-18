/**
 * WXT Content Script entrypoint.
 * Orchestrates: domWalker → viewportObserver → background message → translationDisplay
 * Plus: text selection translate, hover translate
 */

import type { TranslationPiece } from '@/types/translation';
import type { TranslationResultMessage } from '@/types/messages';
import { extractPieces } from '@/content/domWalker';
import { ViewportObserver } from '@/content/viewportObserver';
import { applyTranslation, setPageState, removeAllTranslations, getPageState, applyTheme, applyPosition, applyDarkMode, showLoadingPlaceholder, setErrorState } from '@/content/translationDisplay';
import { loadSettings } from '@/lib/config';
import { startCoordinator } from '@/content/subtitleCoordinator';
import { initTextSelection, setTextSelectionEnabled } from '@/content/textSelection';
import { initHoverTranslate, setHoverTranslateEnabled, setHoverDelay } from '@/content/hoverTranslate';
import { initKeyboardShortcuts } from '@/content/keyboardShortcuts';
import { initInlineTranslate, setInlineTranslateEnabled, updateInlineTranslateConfig } from '@/content/inlineTranslate';
import { registerSubtitleHandlers } from '@/inject/subtitleHandlers/registry';
import { YouTubeHandler } from '@/inject/subtitleHandlers/youtube';
import { UdemyHandler } from '@/inject/subtitleHandlers/udemy';
import { CourseraHandler } from '@/inject/subtitleHandlers/coursera';
import '@/styles/inject.css';
import '@/styles/subtitle.css';
import '@/styles/tooltip.css';

let viewportObserver: ViewportObserver | null = null;
let allPieces: TranslationPiece[] = [];
let coordinatorCleanup: (() => void) | null = null;
let activeRequests = 0;
let _textSelectionCleanup: (() => void) | null = null;
let _hoverTranslateCleanup: (() => void) | null = null;
let _keyboardShortcutsCleanup: (() => void) | null = null;
let _inlineTranslateCleanup: (() => void) | null = null;

/** Send translation request to background and apply results */
async function translatePieces(pieces: TranslationPiece[]): Promise<void> {
  if (pieces.length === 0) return;

  // Show spinner placeholder for each piece immediately (before async call)
  for (const piece of pieces) {
    showLoadingPlaceholder(piece.parentElement, piece.id);
  }

  const settings = await loadSettings();

  try {
    activeRequests++;
    // Broadcast translating status immediately
    sendStatusUpdate();

    const response: TranslationResultMessage = await chrome.runtime.sendMessage({
      action: 'translate',
      pieces: pieces.map((p) => ({ id: p.id, text: p.text })),
      sourceLanguage: settings.sourceLanguage,
      targetLanguage: settings.targetLanguage,
    });

    if (response.success && response.results) {
      for (const result of response.results) {
        const piece = pieces.find((p) => p.id === result.id);
        if (piece) {
          piece.isTranslated = true;
          piece.translatedText = result.translatedText;
          applyTranslation(piece.parentElement, piece.id, result.translatedText);
        }
      }
    } else if (!response.success && response.error) {
      // Batch-level failure: mark all pieces as error
      for (const piece of pieces) {
        setErrorState(piece.parentElement, piece.id, response.error ?? 'Unknown error');
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    for (const piece of pieces) {
      setErrorState(piece.parentElement, piece.id, message);
    }
  } finally {
    activeRequests = Math.max(0, activeRequests - 1);
    sendStatusUpdate();
  }
}

/** Broadcast current status to popup */
function sendStatusUpdate(): void {
  const pageState = getPageState();
  let status: 'idle' | 'translating' | 'done' | 'error' = 'idle';
  
  if (pageState !== 'off') {
    status = activeRequests > 0 ? 'translating' : 'done';
  }

  chrome.runtime.sendMessage({
    action: 'statusUpdate',
    tabId: 0, // Tab ID is handled implicitly by the popup not filtering, or fallback
    status: {
      status,
      translatedCount: allPieces.filter((p) => p.isTranslated).length,
      totalCount: allPieces.length,
    },
  }).catch(() => { /* Popup likely closed */ });
}

/** Start translation on the current page */
export async function startTranslation(): Promise<void> {
  // Load settings to apply visual settings
  const settings = await loadSettings();

  // Apply visual settings to DOM
  applyTheme(settings.theme);
  applyPosition(settings.translationPosition);
  applyDarkMode(settings.darkMode);

  // Extract translatable pieces from the DOM
  allPieces = extractPieces(document.body);

  if (allPieces.length === 0) return;

  // Set page state based on displayMode setting
  setPageState(settings.displayMode === 'translation-only' ? 'translation-only' : 'dual');

  // Create viewport observer for lazy translation
  viewportObserver = new ViewportObserver(
    (visiblePieces) => translatePieces(visiblePieces),
    100,
  );

  // Observe all pieces
  viewportObserver.observeAll(allPieces);
}

/** Stop translation and restore the page */
export function stopTranslation(): void {
  // Clean up visual settings
  document.documentElement.removeAttribute('data-anyllm-theme');
  document.documentElement.removeAttribute('data-anyllm-position');
  document.documentElement.classList.remove('anyllm-dark');

  if (viewportObserver) {
    viewportObserver.disconnect();
    viewportObserver = null;
  }
  removeAllTranslations();
  allPieces = [];

  chrome.runtime.sendMessage({ action: 'restore' });
  sendStatusUpdate(); // Broadcast idle state

  // Cleanup subtitle coordinator
  if (coordinatorCleanup) {
    coordinatorCleanup();
    coordinatorCleanup = null;
  }
}

/** Toggle translation on/off */
export async function toggleTranslation(): Promise<void> {
  const state = getPageState();
  if (state === 'off') {
    await startTranslation();
  } else {
    stopTranslation();
  }
}

/** Initialize interaction features based on settings */
async function initInteractionFeatures(): Promise<void> {
  const settings = await loadSettings();

  // Text selection translate
  _textSelectionCleanup = initTextSelection();
  setTextSelectionEnabled(settings.textSelectionEnabled);

  // Hover translate
  _hoverTranslateCleanup = initHoverTranslate();
  setHoverTranslateEnabled(settings.hoverTranslateEnabled);
  setHoverDelay(settings.hoverDelay);

  // Keyboard shortcuts (page-specific)
  _keyboardShortcutsCleanup = initKeyboardShortcuts();

  // Inline translate (key-gesture)
  _inlineTranslateCleanup = initInlineTranslate();
  // Always apply inline translate settings (defaults are guaranteed by loadSettings)
  if (settings.inlineTranslate?.enabled !== undefined) {
    setInlineTranslateEnabled(settings.inlineTranslate.enabled);
    updateInlineTranslateConfig(settings.inlineTranslate);
  }

  // Listen for settings changes to toggle features dynamically
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    const settingsKey = 'anyllm-translate-settings';
    if (changes[settingsKey]?.newValue) {
      const newSettings = changes[settingsKey].newValue;
      if (typeof newSettings.textSelectionEnabled === 'boolean') {
        setTextSelectionEnabled(newSettings.textSelectionEnabled);
      }
      if (typeof newSettings.hoverTranslateEnabled === 'boolean') {
        setHoverTranslateEnabled(newSettings.hoverTranslateEnabled);
      }
      if (typeof newSettings.hoverDelay === 'number') {
        setHoverDelay(newSettings.hoverDelay);
      }
      // Apply visual settings when they change (only if translation is active)
      if (newSettings.theme && getPageState() !== 'off') {
        applyTheme(newSettings.theme);
      }
      if (newSettings.translationPosition && getPageState() !== 'off') {
        applyPosition(newSettings.translationPosition);
      }
      if (newSettings.darkMode && getPageState() !== 'off') {
        applyDarkMode(newSettings.darkMode);
      }
      if (newSettings.displayMode && getPageState() !== 'off') {
        const next = newSettings.displayMode === 'translation-only' ? 'translation-only' : 'dual';
        setPageState(next);
      }
      // Inline translate settings
      if (newSettings.inlineTranslate) {
        setInlineTranslateEnabled(newSettings.inlineTranslate.enabled);
        updateInlineTranslateConfig(newSettings.inlineTranslate);
      }
    }
  });
}

/** Listen for messages from popup/background */
function setupMessageListener(): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'startTranslation') {
      startTranslation();
    } else if (message.action === 'stopTranslation') {
      stopTranslation();
    } else if (message.action === 'toggleTranslation') {
      toggleTranslation();
    } else if (message.action === 'getStatus') {
      const pageState = getPageState();
      let status: 'idle' | 'translating' | 'done' | 'error' = 'idle';
      if (pageState !== 'off') {
        status = activeRequests > 0 ? 'translating' : 'done';
      }
      sendResponse({
        status,
        translatedCount: allPieces.filter((p) => p.isTranslated).length,
        totalCount: allPieces.length,
      });
      return false; // synchronous
    }
  });
}

// Content script definition for WXT
export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'manifest',
  async main() {
    // Register platform handlers for isolated world
    registerSubtitleHandlers([
      new YouTubeHandler(),
      new UdemyHandler(),
      new CourseraHandler(),
    ]);

    setupMessageListener();
    coordinatorCleanup = startCoordinator();
    await initInteractionFeatures();
    console.log('[AnyLLMTranslate] Content script loaded');
  },
});
