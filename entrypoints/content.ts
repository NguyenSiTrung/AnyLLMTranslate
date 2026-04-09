/**
 * WXT Content Script entrypoint.
 * Orchestrates: domWalker → viewportObserver → background message → translationDisplay
 */

import type { TranslationPiece } from '@/types/translation';
import type { TranslationResultMessage } from '@/types/messages';
import { extractPieces } from '@/content/domWalker';
import { ViewportObserver } from '@/content/viewportObserver';
import { applyTranslation, setPageState, removeAllTranslations, getPageState } from '@/content/translationDisplay';
import { loadSettings } from '@/lib/config';
import '@/styles/inject.css';

let viewportObserver: ViewportObserver | null = null;
let allPieces: TranslationPiece[] = [];

/** Send translation request to background and apply results */
async function translatePieces(pieces: TranslationPiece[]): Promise<void> {
  if (pieces.length === 0) return;

  const settings = await loadSettings();

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
  }
}

/** Start translation on the current page */
export async function startTranslation(): Promise<void> {
  // Extract translatable pieces from the DOM
  allPieces = extractPieces(document.body);

  if (allPieces.length === 0) return;

  // Set page state to dual
  setPageState('dual');

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
  if (viewportObserver) {
    viewportObserver.disconnect();
    viewportObserver = null;
  }
  removeAllTranslations();
  allPieces = [];

  chrome.runtime.sendMessage({ action: 'restore' });
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

/** Listen for messages from popup/background */
function setupMessageListener(): void {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'startTranslation') {
      startTranslation();
    } else if (message.action === 'stopTranslation') {
      stopTranslation();
    } else if (message.action === 'toggleTranslation') {
      toggleTranslation();
    }
  });
}

// Content script definition for WXT
export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',
  async main() {
    setupMessageListener();
    console.log('[LinguaLens] Content script loaded');
  },
});
