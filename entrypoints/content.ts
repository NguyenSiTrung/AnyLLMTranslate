/**
 * WXT Content Script entrypoint.
 * Orchestrates: domWalker → viewportObserver → background message → translationDisplay
 * Plus: text selection translate, hover translate
 */

import type { TranslationPiece } from '@/types/translation';
import type { TranslationResultMessage } from '@/types/messages';
import { extractPieces } from '@/content/domWalker';
import { MutationWatcher } from '@/content/mutationWatcher';
import { ViewportObserver } from '@/content/viewportObserver';
import { applyTranslation, applyInlineTranslation, setPageState, removeAllTranslations, getPageState, applyTheme, applyPosition, applyDarkMode, showLoadingPlaceholder, showInlineLoadingPlaceholder, setErrorState, setInlineErrorState, applyCustomTheme, clearCustomTheme } from '@/content/translationDisplay';
import { loadSettings, updateSettings } from '@/lib/config';
import { extractPageContext, resolveCategory, detectLLMCategoryIfNeeded, triggerAutoCategoryDetection } from '@/content/utils/pageContext';
import {
  getAutoDetectedCategory,
  setAutoDetectedCategory,
  buildCategoryInfo,
  broadcastCategoryInfo,
} from '@/content/categoryState';
import { startCoordinator } from '@/content/subtitleCoordinator';
import { initTextSelection, setTextSelectionEnabled, translateSelectedTextViaContextMenu } from '@/content/textSelection';
import { initHoverTranslate, setHoverTranslateEnabled, setHoverDelay } from '@/content/hoverTranslate';
import { initKeyboardShortcuts } from '@/content/keyboardShortcuts';
import { initInlineTranslate, setInlineTranslateEnabled, updateInlineTranslateConfig } from '@/content/inlineTranslate';
import { registerSubtitleHandlers } from '@/inject/subtitleHandlers/registry';
import { flushLruUpdates } from '@/services/cacheManager';
import { showAutoTranslateNotification, hideAutoTranslateNotification } from '@/content/autoTranslateNotification';
import { findMatchingRule, findEffectiveRule, mergeExcludeSelectors } from '@/lib/siteRules';
import { SHORT_PIECE_THRESHOLD } from '@/lib/constants';
import { enterPickerMode } from '@/content/sectionPicker';
import { translateSection, removeAllSectionTranslations } from '@/content/sectionTranslate';
import { YouTubeHandler } from '@/inject/subtitleHandlers/youtube';
import { UdemyHandler } from '@/inject/subtitleHandlers/udemy';
import { CourseraHandler } from '@/inject/subtitleHandlers/coursera';
import { LinkedInHandler } from '@/inject/subtitleHandlers/linkedin';
import { HboMaxHandler } from '@/inject/subtitleHandlers/hbomax';
import '@/styles/inject.css';
import '@/styles/subtitle.css';
import '@/styles/tooltip.css';

let viewportObserver: ViewportObserver | null = null;
let mutationWatcher: MutationWatcher | null = null;
let allPieces: TranslationPiece[] = [];
let coordinatorCleanup: (() => void) | null = null;
let activeRequests = 0;
/** Monotonically increasing translation session id.
 *  Bumped on startTranslation and stopTranslation so that in-flight
 *  responses from previous sessions are recognized as stale and
 *  silently dropped (no late DOM writes after restore / re-start). */
let translationSession = 0;
let _textSelectionCleanup: (() => void) | null = null;
let _hoverTranslateCleanup: (() => void) | null = null;
let _keyboardShortcutsCleanup: (() => void) | null = null;
let _inlineTranslateCleanup: (() => void) | null = null;
let _storageChangeListener: ((changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void) | null = null;
let categoryOverride: string | undefined;

function selectorAppliesToElementOrAncestor(element: Element, selector: string): boolean {
  if (!selector) return false;
  try {
    return element.matches(selector) || element.closest(selector) !== null;
  } catch {
    return false;
  }
}

function extractDynamicPieces(
  element: Element,
  includeSelectors: string[] | undefined,
  excludeSelectors: string[],
): TranslationPiece[] {
  if (excludeSelectors.some((selector) => selectorAppliesToElementOrAncestor(element, selector))) {
    return [];
  }

  const rootIsIncluded = includeSelectors?.some((selector) =>
    selectorAppliesToElementOrAncestor(element, selector),
  ) ?? false;

  return extractPieces(element, {
    includeSelectors: rootIsIncluded ? undefined : includeSelectors,
    excludeSelectors,
  });
}

/** Send translation request to background and apply results */
async function translatePieces(pieces: TranslationPiece[]): Promise<void> {
  if (pieces.length === 0) return;

  // Capture session at request start; if the page is restored or
  // re-translated before the response arrives, the session will have
  // advanced and this response must be ignored to prevent stale DOM writes.
  const requestSession = translationSession;

  // Show spinner placeholder for each piece immediately (before async call)
  // Short pieces get compact inline spinner, long pieces get block spinner
  for (const piece of pieces) {
    if (piece.text.length <= SHORT_PIECE_THRESHOLD) {
      showInlineLoadingPlaceholder(piece.parentElement, piece.id);
    } else {
      showLoadingPlaceholder(piece.parentElement, piece.id);
    }
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
      await detectLLMCategoryIfNeeded(
        pageContext,
        settings,
        categoryOverride,
        getAutoDetectedCategory(),
        (cat) => {
          setAutoDetectedCategory(cat);
          broadcastCategoryInfo(settings, categoryOverride);
        },
      );
    }

    // Apply category override if present (FR-4: temp > siteRule > autoDetect)
    if (pageContext) {
      const hostname = window.location.hostname;
      const matchingRule = findMatchingRule(hostname, settings.siteRules);
      const resolved = resolveCategory(
        getAutoDetectedCategory() ?? pageContext.category,
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

    // Session guard: if the page has been restored or re-translated
    // since this request was issued, drop the response without touching
    // the DOM. This prevents the classic "ghost translation" race where
    // a late LLM reply re-injects translations onto an already-restored page.
    if (requestSession !== translationSession) {
      return;
    }

    if (response.success && response.results) {
      for (const result of response.results) {
        const piece = pieces.find((p) => p.id === result.id);
        if (piece) {
          piece.isTranslated = true;
          piece.translatedText = result.translatedText;
          // Short pieces → inline parenthetical, long pieces → block themed display
          if (piece.text.length <= SHORT_PIECE_THRESHOLD) {
            applyInlineTranslation(piece.parentElement, piece.id, result.translatedText, settings.targetLanguage);
          } else {
            applyTranslation(piece.parentElement, piece.id, result.translatedText, settings.targetLanguage);
          }
        }
      }
    } else if (!response.success && response.error) {
      // Batch-level failure: mark all pieces as error with retry
      for (const piece of pieces) {
        const retryPiece = () => translatePieces([piece]);
        if (piece.text.length <= SHORT_PIECE_THRESHOLD) {
          setInlineErrorState(piece.parentElement, piece.id, response.error ?? 'Unknown error', retryPiece);
        } else {
          setErrorState(piece.parentElement, piece.id, response.error ?? 'Unknown error', retryPiece);
        }
      }
    }
  } catch (err) {
    if (requestSession !== translationSession) {
      // Stale rejection — ignore.
      return;
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    for (const piece of pieces) {
      const retryPiece = () => translatePieces([piece]);
      if (piece.text.length <= SHORT_PIECE_THRESHOLD) {
        setInlineErrorState(piece.parentElement, piece.id, message, retryPiece);
      } else {
        setErrorState(piece.parentElement, piece.id, message, retryPiece);
      }
    }
  } finally {
    activeRequests = Math.max(0, activeRequests - 1);
    sendStatusUpdate();
  }
}

/** Compute current popup-facing status. Treats lazy/off-screen
 *  pending pieces as "still translating" so progress never reports
 *  100% complete while observed pieces remain untranslated. */
function computeStatus(): 'idle' | 'translating' | 'done' | 'error' {
  const pageState = getPageState();
  if (pageState === 'off') return 'idle';

  const translatedCount = allPieces.filter((p) => p.isTranslated).length;
  const hasUntranslated = translatedCount < allPieces.length;

  // Active in-flight LLM call always means translating.
  if (activeRequests > 0) return 'translating';

  // No in-flight requests, but lazy pieces still pending observation/translation.
  // The viewport observer (or mutation watcher for SPA pages) will pick them up
  // as the user scrolls or new content arrives — surface this as "translating".
  if (hasUntranslated) return 'translating';

  return 'done';
}

/** Broadcast current status to popup */
function sendStatusUpdate(): void {
  chrome.runtime.sendMessage({
    action: 'statusUpdate',
    tabId: 0, // Tab ID is handled implicitly by the popup not filtering, or fallback
    status: {
      status: computeStatus(),
      translatedCount: allPieces.filter((p) => p.isTranslated).length,
      totalCount: allPieces.length,
    },
  }).catch(() => { /* Popup likely closed */ });
}

/** Start translation on the current page */
export async function startTranslation(): Promise<void> {
  // Bump the session id so any in-flight translations from a previous
  // start/stop cycle are recognized as stale and dropped on response.
  translationSession++;

  // Tear down any existing viewport observer / mutation watcher from a
  // prior start. Repeated startTranslation calls (e.g. via popup spam,
  // SPA re-routes, or auto-translate firing twice) must not leak observers.
  if (viewportObserver) {
    viewportObserver.disconnect();
    viewportObserver = null;
  }
  if (mutationWatcher) {
    mutationWatcher.stop();
    mutationWatcher = null;
  }
  // Reset accounting so progress reflects this session's pieces only.
  allPieces = [];
  activeRequests = 0;

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

  // Extract translatable pieces from the DOM, respecting site rules + global excludes
  const hostname = window.location.hostname;
  const matchingRule = findEffectiveRule(hostname, settings.siteRules);

  // Merge smart excludes (structural elements) when enabled
  let baseExcludes = settings.globalExcludeSelectors ?? [];
  if (settings.enableSmartExcludes) {
    const { SMART_EXCLUDE_SELECTORS } = await import('@/types/config');
    const smartSet = new Set([...baseExcludes, ...SMART_EXCLUDE_SELECTORS]);
    baseExcludes = Array.from(smartSet);
  }

  const effectiveExcludes = mergeExcludeSelectors(
    baseExcludes,
    matchingRule?.excludeSelectors,
  );
  allPieces = extractPieces(document.body, {
    includeSelectors: matchingRule?.includeSelectors,
    excludeSelectors: effectiveExcludes,
  });

  // Set page state based on displayMode setting
  setPageState(settings.displayMode === 'translation-only' ? 'translation-only' : 'dual');

  // Create viewport observer for lazy translation
  viewportObserver = new ViewportObserver(
    (visiblePieces) => translatePieces(visiblePieces),
    100,
  );

  // Observe all pieces
  if (allPieces.length > 0) {
    viewportObserver.observeAll([...allPieces]);
  }

  mutationWatcher = new MutationWatcher((addedElements) => {
    if (!viewportObserver || getPageState() === 'off') return;

    const newPieces = addedElements.flatMap((element) =>
      extractDynamicPieces(element, matchingRule?.includeSelectors, effectiveExcludes),
    );
    if (newPieces.length === 0) return;

    allPieces.push(...newPieces);
    viewportObserver.observeAll(newPieces);
    sendStatusUpdate();
  });
  mutationWatcher.start(document.body);
}

/** Stop translation and restore the page */
export function stopTranslation(): void {
  // Bump session FIRST so any in-flight translation responses are
  // dropped before they can reinsert text into the now-restored DOM.
  translationSession++;

  // Clean up visual settings
  document.documentElement.removeAttribute('data-anyllm-theme');
  clearCustomTheme();
  document.documentElement.removeAttribute('data-anyllm-position');
  document.documentElement.classList.remove('anyllm-dark');

  if (viewportObserver) {
    viewportObserver.disconnect();
    viewportObserver = null;
  }
  if (mutationWatcher) {
    mutationWatcher.stop();
    mutationWatcher = null;
  }
  removeAllTranslations();
  removeAllSectionTranslations();
  hideAutoTranslateNotification();
  allPieces = [];
  activeRequests = 0;

  chrome.runtime.sendMessage({ action: 'restore' }).catch(() => {});
  try {
    chrome.runtime.sendMessage({ action: 'CANCEL_SUBTITLE_SESSION' }).catch(() => {});
  } catch { /* best-effort */ }
  sendStatusUpdate(); // Broadcast idle state
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

/** Listen for messages from popup/background.
 *  Exported for unit testing (normally invoked by the content script's main()). */
export function setupMessageListener(): void {
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
      // Refresh popup so manual override reflects immediately
      loadSettings().then((s) => broadcastCategoryInfo(s, categoryOverride)).catch(() => {});
    } else if (message.action === 'getPageCategory') {
      // Return full category info to popup
      (async () => {
        const catSettings = await loadSettings();
        // Singleton holds only LLM-detected results; fall back to heuristic for display
        const llmDetected = getAutoDetectedCategory();
        const heuristic = catSettings.enableLLMPageCategoryDetection
          ? extractPageContext(document, true).category
          : undefined;
        const info = buildCategoryInfo(catSettings, categoryOverride);
        sendResponse({ ...info, autoDetected: llmDetected ?? heuristic });

        // Lazy LLM detection: when nothing is detected yet, detection is enabled,
        // and no manual override is set, kick off an async detection so the popup's
        // pageCategoryUpdate listener fills in the category shortly after open.
        // The helper's in-flight guard prevents duplicate calls across repeated
        // popup opens while one detection is pending.
        if (!llmDetected && !heuristic && catSettings.enableLLMPageCategoryDetection && !categoryOverride) {
          triggerAutoCategoryDetection(catSettings, categoryOverride, (cat) => {
            setAutoDetectedCategory(cat);
            broadcastCategoryInfo(catSettings, categoryOverride);
          }).catch(() => {});
        }
      })();
      return true; // async response
    } else if (message.action === 'startSubtitleTranslation') {
      // Manual subtitle activation — select preferred track from coordinator
      import('@/content/subtitleCoordinator').then(({ selectSubtitleTrack, getAvailableTracks }) => {
        const tracks = getAvailableTracks();
        if (tracks.length > 0) {
          // Try to find preferred language track, fall back to first available
          loadSettings().then((settings) => {
            const preferredLang = settings.subtitleSettings?.preferredSubtitleLanguage;
            const preferred = tracks.find((t) => t.language === preferredLang);
            const trackToSelect = preferred || tracks[0];
            if (trackToSelect?.url) {
              selectSubtitleTrack(trackToSelect.language);
            }
          });
        }
      });
    } else if (message.action === 'getStatus') {
      sendResponse({
        status: computeStatus(),
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
      new LinkedInHandler(),
      new HboMaxHandler(),
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
      chrome.runtime.sendMessage({ action: 'CANCEL_SUBTITLE_SESSION' }).catch(() => {});
      if (coordinatorCleanup) {
        coordinatorCleanup();
        coordinatorCleanup = null;
      }
    });
    console.log('[AnyLLMTranslate] Content script loaded');
  },
});
