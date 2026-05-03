/**
 * WXT Content Script entrypoint.
 * Orchestrates: domWalker → viewportObserver → background message → translationDisplay
 * Plus: text selection translate, hover translate
 */

import type { TranslationPiece } from '@/types/translation';
import type { TranslationResultMessage } from '@/types/messages';
import { extractPieces } from '@/content/domWalker';
import { ViewportObserver } from '@/content/viewportObserver';
import { applyTranslation, setPageState, removeAllTranslations, getPageState, applyTheme, applyPosition, applyDarkMode, showLoadingPlaceholder, setErrorState, applyCustomTheme, clearCustomTheme } from '@/content/translationDisplay';
import { loadSettings, updateSettings } from '@/lib/config';
import { extractPageContext, resolveCategory, detectLLMCategoryIfNeeded } from '@/content/utils/pageContext';
import { startCoordinator } from '@/content/subtitleCoordinator';
import { initTextSelection, setTextSelectionEnabled, translateSelectedTextViaContextMenu } from '@/content/textSelection';
import { initHoverTranslate, setHoverTranslateEnabled, setHoverDelay } from '@/content/hoverTranslate';
import { initKeyboardShortcuts } from '@/content/keyboardShortcuts';
import { initInlineTranslate, setInlineTranslateEnabled, updateInlineTranslateConfig } from '@/content/inlineTranslate';
import { registerSubtitleHandlers } from '@/inject/subtitleHandlers/registry';
import { flushLruUpdates } from '@/services/cacheManager';
import { showAutoTranslateNotification, hideAutoTranslateNotification } from '@/content/autoTranslateNotification';
import { findMatchingRule, findEffectiveRule } from '@/lib/siteRules';
import { enterPickerMode } from '@/content/sectionPicker';
import { translateSection, removeAllSectionTranslations } from '@/content/sectionTranslate';
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
let _storageChangeListener: ((changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void) | null = null;
let categoryOverride: string | undefined;

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

    // Extract page context for context-aware translation (only when enabled)
    const pageContext = settings.enableContextAwareTranslation
      ? extractPageContext(document, settings.enableLLMPageCategoryDetection)
      : undefined;

    if (pageContext) {
      await detectLLMCategoryIfNeeded(pageContext, settings, categoryOverride);
    }

    // Apply category override if present (FR-4: temp > siteRule > autoDetect)
    if (pageContext) {
      const hostname = window.location.hostname;
      const matchingRule = findMatchingRule(hostname, settings.siteRules);
      const resolved = resolveCategory(
        pageContext.category,
        matchingRule?.category,
        categoryOverride,
      );
      if (resolved) {
        pageContext.category = resolved;
      }
    }

    const response: TranslationResultMessage = await chrome.runtime.sendMessage({
      action: 'translate',
      pieces: pieces.map((p) => ({ id: p.id, text: p.text })),
      sourceLanguage: settings.sourceLanguage,
      targetLanguage: settings.targetLanguage,
      pageContext,
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
  if (settings.theme === 'custom' && settings.customTheme) {
    applyCustomTheme(settings.customTheme);
  } else {
    clearCustomTheme();
  }
  applyPosition(settings.translationPosition);
  applyDarkMode(settings.darkMode);

  // Extract translatable pieces from the DOM, respecting site rules
  const hostname = window.location.hostname;
  const matchingRule = findEffectiveRule(hostname, settings.siteRules);
  allPieces = extractPieces(document.body, {
    includeSelectors: matchingRule?.includeSelectors,
    excludeSelectors: matchingRule?.excludeSelectors,
  });

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
  clearCustomTheme();
  document.documentElement.removeAttribute('data-anyllm-position');
  document.documentElement.classList.remove('anyllm-dark');

  if (viewportObserver) {
    viewportObserver.disconnect();
    viewportObserver = null;
  }
  removeAllTranslations();
  removeAllSectionTranslations();
  hideAutoTranslateNotification();
  allPieces = [];

  chrome.runtime.sendMessage({ action: 'restore' }).catch(() => {});
  sendStatusUpdate(); // Broadcast idle state

  // Cleanup subtitle coordinator
  if (coordinatorCleanup) {
    coordinatorCleanup();
    coordinatorCleanup = null;
  }

  // Cleanup storage change listener
  if (_storageChangeListener) {
    chrome.storage.onChanged.removeListener(_storageChangeListener);
    _storageChangeListener = null;
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
  _storageChangeListener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
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
        if (newSettings.theme === 'custom' && newSettings.customTheme) {
          applyCustomTheme(newSettings.customTheme);
        } else {
          clearCustomTheme();
        }
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
      // Apply custom theme CSS variables when customTheme changes even if theme stays 'custom'
      if (newSettings.customTheme && settings.theme === 'custom' && getPageState() !== 'off') {
        applyCustomTheme(newSettings.customTheme);
      }
      // Inline translate settings
      if (newSettings.inlineTranslate) {
        setInlineTranslateEnabled(newSettings.inlineTranslate.enabled);
        updateInlineTranslateConfig(newSettings.inlineTranslate);
      }
    }
  };
  chrome.storage.onChanged.addListener(_storageChangeListener);
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
    } else if (message.action === 'translateSelectedText') {
      if (message.text) {
        translateSelectedTextViaContextMenu(message.text);
      }
    } else if (message.action === 'enterSectionPicker') {
      enterPickerMode((el) => translateSection(el));
    } else if (message.action === 'categoryChanged') {
      // Update module-level category override from background
      categoryOverride = message.category ?? undefined;
    } else if (message.action === 'getPageCategory') {
      // Return full category info to popup
      (async () => {
        const catSettings = await loadSettings();
        const autoDetected = catSettings.enableLLMPageCategoryDetection
          ? extractPageContext(document, true).category
          : undefined;
        const hostname = window.location.hostname;
        const catRule = findMatchingRule(hostname, catSettings.siteRules);
        const siteRuleCat = catRule?.category;
        const effective = resolveCategory(autoDetected, siteRuleCat, categoryOverride);
        sendResponse({
          autoDetected,
          siteRule: siteRuleCat,
          override: categoryOverride,
          effective,
        });
      })();
      return true; // async response
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
    // Guard against re-injection on SPA re-routes or WXT reloads
    if ((window as unknown as Record<string, unknown>).__anyllmTranslateInitialized) return;
    (window as unknown as Record<string, unknown>).__anyllmTranslateInitialized = true;

    // Register platform handlers for isolated world
    registerSubtitleHandlers([
      new YouTubeHandler(),
      new UdemyHandler(),
      new CourseraHandler(),
    ]);

    setupMessageListener();
    coordinatorCleanup = startCoordinator();
    await initInteractionFeatures();

    // Auto-translate: check site rules for matching hostname
    const autoTranslateSettings = await loadSettings();
    const hostname = window.location.hostname;
    const isExtensionPage = !hostname || location.protocol === 'chrome-extension:' || location.protocol === 'chrome:' || location.protocol === 'about:';
    if (!isExtensionPage) {
      const matchingRule = findMatchingRule(hostname, autoTranslateSettings.siteRules);
      if (matchingRule?.alwaysTranslate && !matchingRule.neverTranslate) {
        startTranslation();
        showAutoTranslateNotification(async () => {
          // Disable auto-translate for this site
          const currentSettings = await loadSettings();
          const ruleIndex = currentSettings.siteRules.findIndex(r => r.hostname === matchingRule.hostname);
          if (ruleIndex >= 0) {
            const updatedRules = [...currentSettings.siteRules];
            updatedRules[ruleIndex] = { ...updatedRules[ruleIndex], alwaysTranslate: false };
            await updateSettings({ siteRules: updatedRules });
          }
          stopTranslation();
        });
      }
    }

    // Flush pending cache LRU updates on page unload
    window.addEventListener('beforeunload', () => {
      flushLruUpdates().catch(() => {});
      chrome.runtime.sendMessage({ action: 'FLUSH_LRU' }).catch(() => {});
    });
    console.log('[AnyLLMTranslate] Content script loaded');
  },
});
