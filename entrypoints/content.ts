/**
 * WXT Content Script entrypoint.
 * Orchestrates: domWalker → viewportObserver → background message → translationDisplay
 * Plus: text selection translate, hover translate
 */

import type { TranslationPiece } from '@/types/translation';
import type { PageContext } from '@/types/config';
import { extractPieces } from '@/content/domWalker';
import { MutationWatcher } from '@/content/mutationWatcher';
import { ViewportObserver } from '@/content/viewportObserver';
import { applyTranslation, applyInlineTranslation, setPageState, removeAllTranslations, getPageState, applyTheme, applyPosition, applyDarkMode, showLoadingPlaceholder, showInlineLoadingPlaceholder, setErrorState, setInlineErrorState, applyCustomTheme, clearCustomTheme } from '@/content/translationDisplay';
import { loadSettings, updateSettings } from '@/lib/config';
import { loadSettingsCached, invalidateSessionSettingsCache } from '@/lib/sessionSettingsCache';
import {
  extractPageContext,
  resolveCategory,
  triggerAutoCategoryDetection,
  persistHeuristicCategory,
} from '@/content/utils/pageContext';
import { getDomOutlineFromDocument } from '@/content/utils/getDomOutline';
import {
  getAutoDetectedCategory,
  buildCategoryInfo,
  broadcastCategoryInfo,
  invalidateCategoryIfUrlChanged,
  isAutoCategoryLocked,
} from '@/content/categoryState';
import { startCoordinator } from '@/content/subtitleCoordinator';
import { startPlayerChrome } from '@/content/playerChrome';
import { initTextSelection, setTextSelectionEnabled, translateSelectedTextViaContextMenu } from '@/content/textSelection';
import { initHoverTranslate, setHoverTranslateEnabled, setHoverDelay, clearHoverCache } from '@/content/hoverTranslate';
import { initKeyboardShortcuts } from '@/content/keyboardShortcuts';
import {
  initInlineTranslate,
  setInlineTranslateEnabled,
  updateInlineTranslateConfig,
  translateFocusedInput,
} from '@/content/inlineTranslate';
import { registerSubtitleHandlers } from '@/inject/subtitleHandlers/registry';
import { flushLruUpdates } from '@/services/cacheManager';
import {
  showAutoTranslateNotification,
  hideAutoTranslateNotification,
  showTranslationErrorNotification,
  hideTranslationErrorNotification,
  showSystemicPauseBanner,
  hideSystemicPauseBanner,
} from '@/content/autoTranslateNotification';
import { updateMiniProgress, hideMiniProgress } from '@/content/miniProgress';
import { detectPdfAndNotify } from '@/content/pdfDetect';
import { findMatchingRule, findEffectiveRule, mergeExcludeSelectors } from '@/lib/siteRules';
import { SHORT_PIECE_THRESHOLD, DATA_ATTRS, MUTATION_DEBOUNCE_MS } from '@/lib/constants';
import { enterPickerMode } from '@/content/sectionPicker';
import { translateSection, removeAllSectionTranslations } from '@/content/sectionTranslate';
import { YouTubeHandler } from '@/inject/subtitleHandlers/youtube';
import { UdemyHandler } from '@/inject/subtitleHandlers/udemy';
import { CourseraHandler } from '@/inject/subtitleHandlers/coursera';
import { LinkedInHandler } from '@/inject/subtitleHandlers/linkedin';
import { HboMaxHandler } from '@/inject/subtitleHandlers/hbomax';
import { YoukuHandler } from '@/inject/subtitleHandlers/youku';
import { WetvHandler } from '@/inject/subtitleHandlers/wetv';
import { GenericSubtitleHandler } from '@/inject/subtitleHandlers/generic';
import '@/styles/inject.css';
import '@/styles/subtitle.css';
import '@/styles/tooltip.css';
import { isContextInvalidated } from '@/lib/utils';
import { detectLanguage, isSameLanguage, SAME_LANG_SKIP_CONFIDENCE } from '@/lib/langDetect';
import { isTransientTranslationError } from '@/lib/translationErrors';
import {
  deriveContentHash,
  type ResumePiece,
  type WebResumeSnapshot,
} from '@/lib/webResume';
import { WEB_STREAM_PORT } from '@/types/messages';
import type { StatusResponse, TranslationResultMessage, TranslationResultItem } from '@/types/messages';

/**
 * Resume snapshots live in extension-origin IndexedDB (background).
 * Content must not open that IDB — page-origin isolation would make
 * Settings → Clear cache miss these entries.
 */
async function loadSnapshotViaBackground(
  url: string,
  contentHash: string,
): Promise<WebResumeSnapshot | null> {
  try {
    const res = await chrome.runtime.sendMessage({
      action: 'WEB_RESUME_LOAD',
      url,
      contentHash,
    }) as { success?: boolean; snapshot?: WebResumeSnapshot | null } | undefined;
    return res?.snapshot ?? null;
  } catch {
    return null;
  }
}

async function saveSnapshotViaBackground(snapshot: WebResumeSnapshot): Promise<void> {
  try {
    await chrome.runtime.sendMessage({
      action: 'WEB_RESUME_SAVE',
      snapshot,
    });
  } catch {
    // Best-effort — resume is non-critical (pagehide may race SW teardown).
  }
}
import {
  collectNearViewportPieceIds,
  computeTranslationStatus,
} from '@/lib/webTranslateStatus';
import {
  isHeadingElement,
  sortByReadingStripPriority,
} from '@/lib/readingStripPriority';
import {
  selectLookaheadCandidates,
  shouldRunLookahead,
} from '@/lib/lookaheadPrefetch';
import {
  extractTerms,
  formatTermMemoryBlock,
  mergeTermMemory,
} from '@/lib/termMemory';
import {
  matchResumeTranslations,
  parentPathFromElement,
} from '@/lib/resumeIdentity';
import {
  TranslationSessionRegistry,
  LifecycleMutex,
} from '@/lib/translationSession';

let viewportObserver: ViewportObserver | null = null;
let mutationWatcher: MutationWatcher | null = null;
let allPieces: TranslationPiece[] = [];
/** FR-7: the target language of the active session, captured so the
 *  pagehide snapshot writer can record it without re-reading settings. */
let currentTargetLanguage = 'vi';
let coordinatorCleanup: (() => void) | null = null;
let playerChromeCleanup: (() => void) | null = null;
let _beforeUnloadCleanup: (() => void) | null = null;
let activeRequests = 0;
/**
 * Piece ids currently being translated. Prevents concurrent batches (viewport
 * flush + mutation re-extract race) from double-applying the same piece.
 */
const inFlightPieceIds = new Set<string>();
/**
 * Parent+text keys already handled (success, failure, or same-lang skip).
 * Stops mutation re-extraction during SPA scroll/virtualization from creating
 * a second piece id for the same paragraph content.
 */
const handledContentKeys = new Set<string>();
/**
 * After a systemic provider-pool failure, stop issuing new LLM batches while
 * the user scrolls. Cleared on explicit retry or a successful batch.
 */
let systemicPause = false;
/** FR-11: per-session document terms for subsequent batch prompts. */
let sessionTermMemory: string[] = [];
/**
 * Thin session contract (FR-1): monotonically increasing id + registry of
 * live stream ports/AbortControllers. Bumped on start/stop/body-swap so
 * in-flight responses (including stream piece events) are dropped.
 */
const sessionRegistry = new TranslationSessionRegistry();
/** @deprecated Prefer sessionRegistry.current — kept as a live alias for tests. */
let translationSession = 0;
/** Serializes start/stop/body-swap so concurrent commands cannot dual-observe (FR-3). */
const lifecycleMutex = new LifecycleMutex();
/** True while a resume restore is in flight — gates viewport LLM dispatch (FR-4). */
let resumeRestorePending = false;
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

function isInsideTranslatedRegion(element: Element): boolean {
  return (
    element.closest(
      `[${DATA_ATTRS.TRANSLATED}], [${DATA_ATTRS.PIECE_ID}], ` +
        `[${DATA_ATTRS.ROLE}="translation"], [${DATA_ATTRS.ROLE}="original"]`,
    ) !== null
  );
}

/** Per-element identity for content keys (WeakMap survives only while nodes live). */
const parentIdentity = new WeakMap<Element, number>();
let parentIdentitySeq = 0;

function parentId(parent: Element): number {
  let id = parentIdentity.get(parent);
  if (id === undefined) {
    id = ++parentIdentitySeq;
    parentIdentity.set(parent, id);
  }
  return id;
}

/** Stable key for parent+text so re-extracted SPA nodes can be deduped. */
function contentKey(parent: Element, text: string): string {
  return `${parentId(parent)}::${text}`;
}

function contentKeyForPiece(piece: TranslationPiece): string {
  return contentKey(piece.parentElement, piece.text);
}

function markContentHandled(piece: TranslationPiece): void {
  handledContentKeys.add(contentKeyForPiece(piece));
}

function isContentHandled(piece: TranslationPiece): boolean {
  return handledContentKeys.has(contentKeyForPiece(piece));
}

/** Pool/rate-limit style failures that should pause further scroll batches. */
function isSystemicFailureMessage(message: string): boolean {
  return /provider pool|all .* (failed|open)|rate.?limit|pool is empty|no providers/i.test(
    message,
  );
}

function openProvidersSettings(): void {
  try {
    // Prefer a dedicated providers deep-link when the options page supports it.
    const url = chrome.runtime.getURL('options.html?section=providers');
    chrome.runtime.sendMessage({ action: 'OPEN_OPTIONS', url }).catch(() => {
      // Fallback: open options page directly from the content script context.
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  } catch {
    /* ignore */
  }
}

function enterSystemicPause(error: string): void {
  systemicPause = true;
  viewportObserver?.setPaused(true);
  // Sticky banner: Retry resumes scroll translation; Dismiss only hides chrome
  // (pause stays so further scroll does not storm a dead pool).
  showSystemicPauseBanner({
    message: error || 'Translation paused — all providers unavailable.',
    onRetry: () => {
      clearSystemicPause();
    },
    onDismiss: () => {
      // Banner already removed by the button handler; keep systemicPause so
      // translatePieces short-circuits until the user explicitly retries.
    },
    onOpenSettings: openProvidersSettings,
  });
}

function clearSystemicPause(): void {
  if (!systemicPause && !viewportObserver?.isPaused) return;
  systemicPause = false;
  hideSystemicPauseBanner();
  viewportObserver?.setPaused(false);
  // Re-observe unfinished pieces so scrolling/resume can continue after recovery.
  if (viewportObserver) {
    const pending = allPieces.filter((p) => !p.isTranslated && !inFlightPieceIds.has(p.id));
    viewportObserver.releaseAll(pending.map((p) => p.id));
    viewportObserver.observeAll(pending);
  }
}

/** FR-7: piece-id registry + parent/text identity index (O(1) dup checks). */
const piecesById = new Map<string, TranslationPiece>();
/** parentElement → (text → piece) for identity-based dedup without O(N×M) scans. */
const piecesByParentText = new WeakMap<Element, Map<string, TranslationPiece>>();

function registerPiece(piece: TranslationPiece): void {
  piecesById.set(piece.id, piece);
  let byText = piecesByParentText.get(piece.parentElement);
  if (!byText) {
    byText = new Map();
    piecesByParentText.set(piece.parentElement, byText);
  }
  byText.set(piece.text, piece);
}

function unregisterPiece(piece: TranslationPiece): void {
  piecesById.delete(piece.id);
  const byText = piecesByParentText.get(piece.parentElement);
  if (byText) {
    byText.delete(piece.text);
  }
}

function replaceAllPieces(next: TranslationPiece[]): void {
  piecesById.clear();
  // WeakMap entries drop with GC when parents detach; rebuild from next list.
  allPieces = next;
  for (const piece of next) {
    registerPiece(piece);
  }
}

function appendPieces(next: TranslationPiece[]): void {
  for (const piece of next) {
    allPieces.push(piece);
    registerPiece(piece);
  }
}

/** FR-7: drop pieces whose parent is no longer in the document. */
function pruneDetachedPieces(): number {
  let removed = 0;
  const kept: TranslationPiece[] = [];
  for (const piece of allPieces) {
    if (!piece.parentElement.isConnected) {
      unregisterPiece(piece);
      inFlightPieceIds.delete(piece.id);
      handledContentKeys.delete(contentKeyForPiece(piece));
      removed++;
    } else {
      kept.push(piece);
    }
  }
  if (removed > 0) {
    allPieces = kept;
  }
  return removed;
}

function extractDynamicPieces(
  element: Element,
  includeSelectors: string[] | undefined,
  excludeSelectors: string[],
  enableRichTranslate?: boolean,
  enableAsideCaps?: boolean,
): TranslationPiece[] {
  // Never re-walk regions that already have translations / original markers.
  if (isInsideTranslatedRegion(element)) {
    return [];
  }

  if (excludeSelectors.some((selector) => selectorAppliesToElementOrAncestor(element, selector))) {
    return [];
  }

  const rootIsIncluded = includeSelectors?.some((selector) =>
    selectorAppliesToElementOrAncestor(element, selector),
  ) ?? false;

  const extracted = extractPieces(element, {
    includeSelectors: rootIsIncluded ? undefined : includeSelectors,
    excludeSelectors,
    enableRichTranslate,
    enableAsideCaps,
  });

  // Drop pieces we already tracked (same parent + same text) — FR-7 index, not O(N×M).
  return extracted.filter((piece) => {
    if (isContentHandled(piece)) return false;
    const byText = piecesByParentText.get(piece.parentElement);
    if (byText?.has(piece.text)) return false;
    return true;
  });
}

/** Should this piece use compact inline (parenthetical) display?
 *  Disabled when "Compact inline for short text" is off — all pieces then use
 *  uniform block display that matches the active theme. */
function shouldUseInlineDisplay(piece: TranslationPiece, compactInlineEnabled: boolean): boolean {
  return compactInlineEnabled && piece.text.length <= SHORT_PIECE_THRESHOLD;
}

/**
 * FR-6: stream a translation request via a chrome.runtime port. Emits per-piece
 * deltas (incremental spinner→text swaps) and resolves to a result message
 * shaped like the non-streaming path. On error, the caller falls back to the
 * non-streaming path (re-issued in translatePieces' catch block).
 */
function streamTranslate(
  pieces: TranslationPiece[],
  sourceLanguage: string,
  targetLanguage: string,
  compactInlineEnabled: boolean,
  extras?: {
    pageContext?: PageContext;
    termMemoryBlock?: string;
    /** Session captured at request start — piece events must match (FR-1). */
    requestSession: number;
  },
): Promise<TranslationResultMessage> {
  const requestSession = extras?.requestSession ?? sessionRegistry.current;
  return new Promise((resolve) => {
    const pieceById = new Map(pieces.map((p) => [p.id, p]));
    const results: TranslationResultItem[] = [];
    let settled = false;

    const port = chrome.runtime.connect({ name: WEB_STREAM_PORT });
    sessionRegistry.registerPort(requestSession, port);

    const cleanupPort = () => {
      sessionRegistry.unregisterPort(requestSession, port);
      try {
        port.disconnect();
      } catch {
        /* already disconnected */
      }
    };

    // FR-21: include pageContext + term memory so streaming matches non-stream.
    port.postMessage({
      type: 'request',
      pieces: pieces.map((p) => ({ id: p.id, text: p.text, inArticleContext: p.inArticleContext })),
      sourceLanguage,
      targetLanguage,
      pageContext: extras?.pageContext,
      termMemoryBlock: extras?.termMemoryBlock,
    });

    port.onMessage.addListener((msg: {
      type: string;
      id?: string;
      text?: string;
      results?: TranslationResultItem[];
      error?: string;
      partial?: boolean;
    }) => {
      // FR-1: drop every stream event (including piece) when session advanced.
      if (!sessionRegistry.isCurrent(requestSession)) {
        if (!settled) {
          settled = true;
          cleanupPort();
          resolve({ success: false, error: 'Session superseded' });
        }
        return;
      }
      if (msg.type === 'piece' && msg.id && msg.text) {
        // Incremental in-place update: find the piece + swap its spinner.
        const piece = pieceById.get(msg.id);
        if (piece) {
          piece.isTranslated = true;
          piece.translatedText = msg.text;
          markContentHandled(piece);
          if (shouldUseInlineDisplay(piece, compactInlineEnabled)) {
            applyInlineTranslation(piece.parentElement, piece.id, msg.text, targetLanguage, piece.variables);
          } else {
            applyTranslation(piece.parentElement, piece.id, msg.text, targetLanguage, piece.variables);
          }
        }
      } else if (msg.type === 'done') {
        settled = true;
        cleanupPort();
        resolve({
          success: true,
          results: msg.results ?? results,
          ...(msg.partial ? { partial: true } : {}),
        });
      } else if (msg.type === 'error') {
        settled = true;
        cleanupPort();
        // Surface as a failure so translatePieces' error branch + non-streaming
        // fallback can handle it.
        resolve({ success: false, error: msg.error ?? 'Streaming failed' });
      }
    });

    port.onDisconnect.addListener(() => {
      sessionRegistry.unregisterPort(requestSession, port);
      if (!settled) {
        settled = true;
        // Port closed unexpectedly — fall back to non-streaming.
        resolve({ success: false, error: 'Streaming port disconnected' });
      }
    });
  });
}

/** Apply a compact per-piece error without overwriting a successful translation. */
function applyPieceError(
  piece: TranslationPiece,
  errorMessage: string,
  compactInlineEnabled: boolean,
): void {
  if (piece.isTranslated) return;
  markContentHandled(piece);
  const retryPiece = () => {
    // User-initiated retry: allow this piece (and the page) to try again.
    handledContentKeys.delete(contentKeyForPiece(piece));
    viewportObserver?.release(piece.id);
    clearSystemicPause();
    void translatePieces([piece], { skipFailureCache: true });
  };
  if (shouldUseInlineDisplay(piece, compactInlineEnabled)) {
    setInlineErrorState(piece.parentElement, piece.id, errorMessage, retryPiece);
  } else {
    setErrorState(piece.parentElement, piece.id, errorMessage, retryPiece);
  }
}

/** Send translation request to background and apply results.
 *  When `options.skipFailureCache` is set (user-initiated retry), the background
 *  bypasses the FR-4 negative cache so the retry actually re-calls the LLM.
 *  `autoRetriedOnce` is set after a silent one-shot retry for transient failures
 *  so we don't loop forever when the pool is truly down. */
async function translatePieces(
  pieces: TranslationPiece[],
  options: {
    skipFailureCache?: boolean;
    autoRetriedOnce?: boolean;
    /** Look-ahead flush — do not chain further prefetch. */
    isLookahead?: boolean;
  } = {},
): Promise<void> {
  if (pieces.length === 0) return;
  const { skipFailureCache = false, autoRetriedOnce = false, isLookahead = false } = options;

  // User retry clears the scroll-pause so further content can translate again.
  if (skipFailureCache) {
    clearSystemicPause();
  }

  // While the provider pool is exhausted, do not issue more LLM calls as the
  // user scrolls — that only multiplies identical failures. Pieces stay
  // unobserved-until-resume via ViewportObserver.setPaused.
  if (systemicPause && !skipFailureCache) {
    return;
  }

  // Drop pieces already done or already mid-request (viewport + mutation races).
  const workPieces = pieces.filter((p) => !p.isTranslated && !inFlightPieceIds.has(p.id));
  if (workPieces.length === 0) return;

  for (const piece of workPieces) {
    inFlightPieceIds.add(piece.id);
  }

  // Capture session at request start; if the page is restored or
  // re-translated before the response arrives, the session will have
  // advanced and this response must be ignored to prevent stale DOM writes.
  const requestSession = sessionRegistry.current;
  translationSession = requestSession;

  // FR-4: while resume restore is applying snapshot, do not dispatch LLM work.
  if (resumeRestorePending && !skipFailureCache) {
    for (const piece of workPieces) {
      inFlightPieceIds.delete(piece.id);
    }
    return;
  }

  // Load settings before the placeholder loop so the compact-inline flag
  // gates which spinner style each piece gets (short → inline, long → block).
  // FR-5: session-scoped cache avoids repeated chrome.storage reads per batch.
  const settings = await loadSettingsCached();
  const compactInlineEnabled = settings.enableCompactInlineForShortText;

  // Show spinner placeholder for each piece immediately (before async call)
  // Short pieces get compact inline spinner, long pieces get block spinner
  for (const piece of workPieces) {
    if (shouldUseInlineDisplay(piece, compactInlineEnabled)) {
      showInlineLoadingPlaceholder(piece.parentElement, piece.id);
    } else {
      showLoadingPlaceholder(piece.parentElement, piece.id);
    }
  }

  /** Pieces to silently re-attempt once after this call fully cleans up. */
  let pendingAutoRetry: TranslationPiece[] | null = null;

  try {
    activeRequests++;
    // Broadcast translating status immediately
    sendStatusUpdate();

    // Extract page context for context-aware translation (only when enabled).
    // Pass enableContextAwareTranslation (not the LLM toggle) so the cheap
    // heuristic domain-map detection runs whenever context-aware translation is
    // on, regardless of whether LLM-based detection is enabled. The expensive
    // LLM detection is gated separately via triggerAutoCategoryDetection.
    const pageContext = settings.enableContextAwareTranslation
      ? extractPageContext(document, settings.enableContextAwareTranslation)
      : undefined;

    invalidateCategoryIfUrlChanged();

    // Persist heuristic category (domain locks; weak heuristics stay refinable)
    if (pageContext?.category) {
      persistHeuristicCategory(pageContext.category, pageContext.domain);
      broadcastCategoryInfo(settings, categoryOverride);
    }

    if (pageContext && !isAutoCategoryLocked()) {
      await triggerAutoCategoryDetection(settings, categoryOverride, (cat) => {
        broadcastCategoryInfo(settings, categoryOverride);
        pageContext.category = cat;
      });
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

    // FR-3 / FR-13: source-language gate. When detection is on and sourceLanguage
    // is 'auto', skip pieces already in the target language. Prefer translating
    // unnecessarily over silent skip of valid foreign text (higher confidence bar).
    let translatablePieces = workPieces;
    if (settings.enableSourceLanguageDetection && settings.sourceLanguage === 'auto') {
      translatablePieces = workPieces.filter((piece) => {
        const detected = detectLanguage(piece.text);
        if (
          detected.lang &&
          isSameLanguage(detected.lang, settings.targetLanguage) &&
          detected.confidence >= SAME_LANG_SKIP_CONFIDENCE
        ) {
          // Already in the target language — mark translated (source = target),
          // clear the loading spinner, and skip injection entirely.
          piece.isTranslated = true;
          piece.translatedText = piece.text;
          markContentHandled(piece);
          const el = document.querySelector(`[${DATA_ATTRS.PIECE_ID}="${piece.id}"]`);
          if (el) el.remove();
          return false;
        }
        return true;
      });
      // All pieces already in the target language — nothing to send.
      if (translatablePieces.length === 0) {
        return;
      }
    }

    // FR-11: seed term memory from page title once, pass capped block on later batches.
    if (sessionTermMemory.length === 0 && typeof document !== 'undefined') {
      sessionTermMemory = mergeTermMemory(sessionTermMemory, extractTerms(document.title ?? ''));
    }
    const termMemoryBlock = formatTermMemoryBlock(sessionTermMemory) || undefined;

    let response: TranslationResultMessage;
    if (settings.enableStreamingTranslation) {
      // FR-6: try streaming first; fall back to non-streaming on failure.
      // FR-14: on stream error, re-request only unfinished piece ids.
      const streamed = await streamTranslate(
        translatablePieces,
        settings.sourceLanguage,
        settings.targetLanguage,
        settings.enableCompactInlineForShortText,
        { pageContext, termMemoryBlock, requestSession },
      );
      if (streamed.success) {
        response = streamed;
      } else {
        const unfinished = translatablePieces.filter((p) => !p.isTranslated);
        if (unfinished.length === 0) {
          // All pieces already applied via stream deltas — treat as success.
          response = {
            success: true,
            results: translatablePieces
              .filter((p): p is typeof p & { translatedText: string } =>
                p.translatedText !== undefined,
              )
              .map((p) => ({ id: p.id, translatedText: p.translatedText })),
          };
        } else {
          response = await chrome.runtime.sendMessage({
            action: 'translate',
            pieces: unfinished.map((p) => ({
              id: p.id,
              text: p.text,
              inArticleContext: p.inArticleContext,
            })),
            sourceLanguage: settings.sourceLanguage,
            targetLanguage: settings.targetLanguage,
            pageContext,
            skipFailureCache,
            termMemoryBlock,
          });
        }
      }
    } else {
      response = await chrome.runtime.sendMessage({
        action: 'translate',
        pieces: translatablePieces.map((p) => ({ id: p.id, text: p.text, inArticleContext: p.inArticleContext })),
        sourceLanguage: settings.sourceLanguage,
        targetLanguage: settings.targetLanguage,
        pageContext,
        skipFailureCache,
        termMemoryBlock,
      });
    }

    // Session guard: if the page has been restored or re-translated
    // since this request was issued, drop the response without touching
    // the DOM. This prevents the classic "ghost translation" race where
    // a late LLM reply re-injects translations onto an already-restored page.
    if (!sessionRegistry.isCurrent(requestSession)) {
      return;
    }

    if (response.success && response.results) {
      // FR-11: accumulate terms from successful translations for later batches.
      for (const result of response.results) {
        if (result.translatedText) {
          sessionTermMemory = mergeTermMemory(
            sessionTermMemory,
            extractTerms(result.translatedText),
          );
        }
      }
      for (const result of response.results) {
        const piece = workPieces.find((p) => p.id === result.id);
        if (!piece) continue;

        // Partial LLM responses back-fill missing ids with the source text.
        // Injecting that as a bilingual line looks like duplicate content.
        // Leave a retryable error instead of echoing the original below itself.
        if (response.partial === true && result.translatedText === piece.text) {
          applyPieceError(piece, 'Incomplete translation — click to retry', compactInlineEnabled);
          continue;
        }

        piece.isTranslated = true;
        piece.translatedText = result.translatedText;
        markContentHandled(piece);
        // Short pieces → inline parenthetical, long pieces → block themed display
        if (shouldUseInlineDisplay(piece, compactInlineEnabled)) {
          applyInlineTranslation(piece.parentElement, piece.id, result.translatedText, settings.targetLanguage, piece.variables);
        } else {
          applyTranslation(piece.parentElement, piece.id, result.translatedText, settings.targetLanguage, piece.variables);
        }
      }
      // A successful batch means the pool is healthy again — allow scroll work.
      if (response.results.length > 0) {
        clearSystemicPause();
      }
      // FR-4: per-piece failures — auto-retry transient ones once (often a
      // sibling batch already wrote the success cache); otherwise show error.
      if (response.failed && response.failed.length > 0) {
        const failedPieces: TranslationPiece[] = [];
        let anyTransient = false;
        for (const failure of response.failed) {
          const piece = workPieces.find((p) => p.id === failure.id);
          if (!piece || piece.isTranslated) continue;
          failedPieces.push(piece);
          if (isTransientTranslationError(failure.error)) {
            anyTransient = true;
          }
        }
        if (failedPieces.length > 0 && !autoRetriedOnce && anyTransient) {
          pendingAutoRetry = failedPieces;
        } else {
          for (const failure of response.failed) {
            const piece = workPieces.find((p) => p.id === failure.id);
            if (!piece || piece.isTranslated) continue;
            applyPieceError(piece, failure.error, compactInlineEnabled);
            if (isSystemicFailureMessage(failure.error)) {
              enterSystemicPause(failure.error);
            }
          }
        }
      }
    } else if (!response.success && response.error) {
      // Silent one-shot auto-retry for transient pool/network failures so a
      // concurrent success-cache fill or brief blip doesn't force a manual click.
      if (!autoRetriedOnce && isTransientTranslationError(response.error)) {
        pendingAutoRetry = workPieces.filter((p) => !p.isTranslated);
      } else {
        showTranslationErrorNotification(response.error);
        for (const piece of workPieces) {
          applyPieceError(piece, response.error, compactInlineEnabled);
        }
        if (isSystemicFailureMessage(response.error)) {
          enterSystemicPause(response.error);
        }
      }
    }
  } catch (err) {
    if (!sessionRegistry.isCurrent(requestSession)) {
      return;
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (!autoRetriedOnce && isTransientTranslationError(message)) {
      pendingAutoRetry = workPieces.filter((p) => !p.isTranslated);
    } else {
      showTranslationErrorNotification(message);
      for (const piece of workPieces) {
        applyPieceError(piece, message, compactInlineEnabled);
      }
      if (isSystemicFailureMessage(message)) {
        enterSystemicPause(message);
      }
    }
  } finally {
    for (const piece of workPieces) {
      inFlightPieceIds.delete(piece.id);
    }
    activeRequests = Math.max(0, activeRequests - 1);
    sendStatusUpdate();
  }

  if (
    pendingAutoRetry &&
    pendingAutoRetry.length > 0 &&
    sessionRegistry.isCurrent(requestSession)
  ) {
    await translatePieces(pendingAutoRetry, {
      skipFailureCache: true,
      autoRetriedOnce: true,
    });
  } else if (
    !isLookahead &&
    sessionRegistry.isCurrent(requestSession) &&
    !systemicPause
  ) {
    // FR-8: one hop of look-ahead after a primary (viewport) flush.
    scheduleLookaheadPrefetch();
  }
}

/** Max concurrent in-flight translatePieces before look-ahead is skipped. */
const LOOKAHEAD_ACTIVE_THRESHOLD = 1;
/** Prefetch window below the fold (px), beyond VIEWPORT_MARGIN. */
const LOOKAHEAD_BELOW_PX = 900;
/** Cap pieces per look-ahead flush to avoid request storms. */
const LOOKAHEAD_MAX_PIECES = 4;

/**
 * Prefetch next-screen pieces at lower priority when the pipeline is quiet.
 * Skips systemic pause and when activeRequests is already busy.
 */
function scheduleLookaheadPrefetch(): void {
  if (
    !shouldRunLookahead({
      systemicPause,
      pageOff: getPageState() === 'off',
      activeRequests,
      activeThreshold: LOOKAHEAD_ACTIVE_THRESHOLD,
    })
  ) {
    return;
  }

  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
  const candidateIds = new Set(
    selectLookaheadCandidates(
      allPieces.map((piece) => {
        let top = Number.POSITIVE_INFINITY;
        try {
          top = piece.parentElement.getBoundingClientRect().top;
        } catch {
          /* detached */
        }
        return {
          id: piece.id,
          isTranslated: piece.isTranslated,
          inFlight: inFlightPieceIds.has(piece.id),
          top,
        };
      }),
      {
        viewportHeight,
        viewportMarginPx: 200,
        belowPx: LOOKAHEAD_BELOW_PX,
        maxPieces: LOOKAHEAD_MAX_PIECES,
      },
    ),
  );

  if (candidateIds.size === 0) return;
  const candidates = allPieces.filter((p) => candidateIds.has(p.id));
  void translatePieces(candidates, { isLookahead: true });
}

/**
 * Build viewport-aware status for the popup (FR-1).
 * Reading-area idle + off-screen remaining → status `done` with
 * `viewportComplete` true and counts so the popup can say "more as you scroll"
 * instead of forever "Translating..." or a false whole-page complete.
 */
function buildStatusResponse(): StatusResponse {
  const pageState = getPageState();
  const viewportHeight =
    typeof window !== 'undefined' ? window.innerHeight : 800;

  const visiblePieceIds = collectNearViewportPieceIds(
    allPieces.map((p) => ({
      id: p.id,
      isTranslated: p.isTranslated,
      getRect: () => {
        try {
          const rect = p.parentElement.getBoundingClientRect();
          return { top: rect.top, bottom: rect.bottom };
        } catch {
          return { top: Number.POSITIVE_INFINITY, bottom: Number.POSITIVE_INFINITY };
        }
      },
    })),
    { marginPx: 200, viewportHeight },
  );

  const result = computeTranslationStatus({
    pageState,
    pieces: allPieces.map((p) => ({ id: p.id, isTranslated: p.isTranslated })),
    activeRequests,
    visiblePieceIds,
    inFlightPieceIds,
  });

  return {
    status: result.status,
    translatedCount: result.translatedCount,
    totalCount: result.totalCount,
    visiblePending: result.visiblePending,
    viewportComplete: result.viewportComplete,
  };
}

/** Broadcast current status to popup + update in-page mini progress (FR-25). */
function sendStatusUpdate(): void {
  const status = buildStatusResponse();
  // tabId is resolved by receivers via sender.tab.id (content scripts cannot
  // read their own tab id). Popup filters statusUpdate by that origin tab so
  // a translating tab does not overwrite another tab's popup progress.
  chrome.runtime.sendMessage({
    action: 'statusUpdate',
    tabId: 0,
    status,
  }).catch(() => { /* Popup likely closed */ });

  // In-page chrome complements the popup while the user reads.
  if (status.totalCount > 0 && getPageState() !== 'off') {
    updateMiniProgress({
      translated: status.translatedCount,
      total: status.totalCount,
      status: status.status === 'error' ? 'error' : status.status,
      onStop: () => {
        stopTranslation();
      },
    });
  } else {
    hideMiniProgress();
  }
}

/** FR-7: one-time flag so the pagehide/beforeunload snapshot writer is registered once per session. */
let resumeSnapshotWriterRegistered = false;

/**
 * FR-7: restore already-translated pieces from a prior session's snapshot.
 * Matches pieces by parent path + text (FR-20) and applies translations from
 * the web-resume store. Settings → Clear cache also wipes that store so a
 * full cache clear forces re-fetch on the next Translate Web.
 */
async function restoreFromSnapshot(
  pieces: TranslationPiece[],
  targetLanguage: string,
  compactInlineEnabled: boolean,
): Promise<void> {
  try {
    const url = window.location.href;
    const contentHash = await deriveContentHash(pieces.map((p) => p.text).join('\n'));
    const snapshot = await loadSnapshotViaBackground(url, contentHash);
    if (!snapshot) return;
    // Only restore if the target language matches the snapshot's.
    if (snapshot.targetLanguage !== targetLanguage) return;

    // FR-20: match by parent path + text when available; text-only fallback.
    const live = pieces.map((p) => ({
      text: p.text,
      parentPath: parentPathFromElement(p.parentElement),
    }));
    const matched = matchResumeTranslations(live, snapshot.pieces);
    if (matched.size === 0) return;

    let restored = 0;
    for (const [index, cached] of matched) {
      const piece = pieces[index];
      if (!piece || piece.isTranslated) continue;
      piece.isTranslated = true;
      piece.translatedText = cached;
      markContentHandled(piece);
      if (shouldUseInlineDisplay(piece, compactInlineEnabled)) {
        applyInlineTranslation(piece.parentElement, piece.id, cached, targetLanguage, piece.variables);
      } else {
        applyTranslation(piece.parentElement, piece.id, cached, targetLanguage, piece.variables);
      }
      restored++;
    }
    if (restored > 0) sendStatusUpdate();
  } catch {
    // Resume is best-effort — never block normal translation on it.
  }
}

/**
 * FR-2 / FR-7: write a resume snapshot.
 * Captures a frozen copy of pieces immediately so callers may clear `allPieces`
 * without racing the async IDB write (stop path used to clear first → no-op).
 */
function writeResumeSnapshot(options?: { awaitable?: false }): void;
function writeResumeSnapshot(options: { awaitable: true }): Promise<void>;
function writeResumeSnapshot(options?: { awaitable?: boolean }): void | Promise<void> {
  if (allPieces.length === 0) {
    return options?.awaitable ? Promise.resolve() : undefined;
  }
  const url = window.location.href;
  const targetLang = currentTargetLanguage;
  // Freeze pieces NOW — stopTranslation clears allPieces right after this call.
  const frozenPieces = allPieces.map((p) => ({
    id: p.id,
    text: p.text,
    translatedText: p.translatedText,
    isTranslated: p.isTranslated,
    parentPath: parentPathFromElement(p.parentElement),
  }));
  const work = (async () => {
    try {
      const contentHash = await deriveContentHash(frozenPieces.map((p) => p.text).join('\n'));
      const resumePieces: ResumePiece[] = frozenPieces.map((p) => ({
        id: p.id,
        text: p.text,
        ...(p.translatedText !== undefined ? { translatedText: p.translatedText } : {}),
        status: p.isTranslated ? 'translated' : 'pending',
        parentPath: p.parentPath,
      }));
      await saveSnapshotViaBackground({
        url,
        contentHash,
        targetLanguage: targetLang,
        capturedAt: Date.now(),
        pieces: resumePieces,
      });
    } catch {
      // Best-effort — resume is non-critical.
    }
  })();
  if (options?.awaitable) return work;
}

/** Register the pagehide/beforeunload snapshot writer once per session (FR-7). */
function registerResumeSnapshotWriter(): void {
  if (resumeSnapshotWriterRegistered) return;
  resumeSnapshotWriterRegistered = true;
  // Wrapper: writeResumeSnapshot has an overload taking options, so it is not a
  // valid EventListener by itself — always call the zero-arg form on unload.
  const onUnload = (): void => {
    writeResumeSnapshot();
  };
  window.addEventListener('pagehide', onUnload, { once: false });
  window.addEventListener('beforeunload', onUnload, { once: false });
}

/** Start translation on the current page (serialized via lifecycle mutex — FR-3). */
export async function startTranslation(): Promise<void> {
  return lifecycleMutex.run(() => startTranslationUnlocked());
}

async function startTranslationUnlocked(): Promise<void> {
  // Bump the session id FIRST (before any await) so in-flight work from a
  // previous start/stop is stale; also disconnect registered stream ports.
  translationSession = sessionRegistry.bump();
  resumeRestorePending = false;

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
  replaceAllPieces([]);
  activeRequests = 0;
  inFlightPieceIds.clear();
  handledContentKeys.clear();
  systemicPause = false;
  sessionTermMemory = [];
  hideTranslationErrorNotification();
  hideSystemicPauseBanner();

  // Load settings to apply visual settings (session-scoped cache for FR-5)
  invalidateSessionSettingsCache();
  const settings = await loadSettingsCached();

  // FR-3: session may have advanced while we awaited settings (concurrent stop).
  if (!sessionRegistry.isCurrent(translationSession)) {
    return;
  }

  // FR-7: capture the target language for the pagehide snapshot writer.
  currentTargetLanguage = settings.targetLanguage;

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

  if (!sessionRegistry.isCurrent(translationSession)) {
    return;
  }

  const effectiveExcludes = mergeExcludeSelectors(
    baseExcludes,
    matchingRule?.excludeSelectors,
  );
  replaceAllPieces(
    extractPieces(document.body, {
      includeSelectors: matchingRule?.includeSelectors,
      excludeSelectors: effectiveExcludes,
      enableRichTranslate: settings.enableRichTranslate,
      enableBodyTagWhitelist: settings.enableBodyTagWhitelist,
      enableAsideCaps: settings.enableAsideCaps,
      enableShadowDomWalk: settings.enableShadowDomWalk,
    }),
  );

  // Set page state based on displayMode setting
  setPageState(settings.displayMode === 'translation-only' ? 'translation-only' : 'dual');

  // FR-4: restore snapshot BEFORE viewport observe so restored pieces never
  // race a fresh LLM request in the same session.
  if (settings.enableWebResume && allPieces.length > 0) {
    resumeRestorePending = true;
    try {
      await restoreFromSnapshot(
        allPieces,
        settings.targetLanguage,
        settings.enableCompactInlineForShortText,
      );
    } catch {
      /* best-effort */
    } finally {
      resumeRestorePending = false;
    }
    if (!sessionRegistry.isCurrent(translationSession)) {
      return;
    }
    registerResumeSnapshotWriter();
  }

  // Create viewport observer for lazy translation.
  // FR-10: when many pieces become visible at once, prefer top-of-fold + headings.
  viewportObserver = new ViewportObserver(
    (visiblePieces) => {
      const prioritized =
        visiblePieces.length > 4
          ? sortByReadingStripPriority(
              visiblePieces.map((piece, originalIndex) => {
                let viewportTop = originalIndex * 10;
                try {
                  viewportTop = piece.parentElement.getBoundingClientRect().top;
                } catch {
                  /* detached node */
                }
                return {
                  piece,
                  id: piece.id,
                  viewportTop,
                  isHeading: isHeadingElement(piece.parentElement),
                  originalIndex,
                };
              }),
            ).map((row) => row.piece)
          : visiblePieces;
      void translatePieces(prioritized);
    },
    100,
  );

  // Observe all pieces (after resume so restored pieces skip LLM)
  if (allPieces.length > 0) {
    viewportObserver.observeAll([...allPieces]);
  }

  mutationWatcher = new MutationWatcher(
    (addedElements) => {
      if (!viewportObserver || getPageState() === 'off') return;

      // FR-7: prune detached nodes on every mutation flush.
      pruneDetachedPieces();

      const newPieces = addedElements.flatMap((element) =>
        extractDynamicPieces(element, matchingRule?.includeSelectors, effectiveExcludes, settings.enableRichTranslate, settings.enableAsideCaps),
      );
      if (newPieces.length === 0) {
        sendStatusUpdate();
        return;
      }

      appendPieces(newPieces);
      // While paused, observe still tracks pieces; dispatch stays gated by setPaused.
      viewportObserver.observeAll(newPieces);
      sendStatusUpdate();
    },
    MUTATION_DEBOUNCE_MS,
    // FR-1: SPA <body> replacement — re-initialize translation on the new body.
    // startTranslation() bumps the session id (dropping stale pre-swap writes),
    // tears down the old observers, and re-extracts from the new document.body.
    () => {
      if (getPageState() === 'off') return;
      void startTranslation();
    },
  );
  mutationWatcher.start(document.body);
}

/**
 * Stop translation and restore the page.
 * FR-2: snapshot translated pieces BEFORE clearing allPieces.
 * FR-3: serialized with start via lifecycle mutex.
 */
export function stopTranslation(): void {
  void lifecycleMutex.run(() => stopTranslationUnlocked());
}

/** Awaitable stop for command handlers that need structured completion (FR-3). */
export async function stopTranslationAsync(): Promise<void> {
  return lifecycleMutex.run(() => stopTranslationUnlocked());
}

function stopTranslationUnlocked(): void {
  // Bump session FIRST so any in-flight translation responses / stream pieces
  // are dropped before they can reinsert text into the now-restored DOM.
  translationSession = sessionRegistry.bump();
  resumeRestorePending = false;

  // FR-2: snapshot BEFORE clearing pieces (writeResumeSnapshot freezes a copy).
  writeResumeSnapshot();
  resumeSnapshotWriterRegistered = false;

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
  clearHoverCache();
  hideAutoTranslateNotification();
  hideTranslationErrorNotification();
  hideSystemicPauseBanner();
  hideMiniProgress();
  replaceAllPieces([]);
  activeRequests = 0;
  inFlightPieceIds.clear();
  handledContentKeys.clear();
  systemicPause = false;
  sessionTermMemory = [];
  invalidateSessionSettingsCache();

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
    await stopTranslationAsync();
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

  // Inline translate (key-gesture) — listeners are attached early in main() so
  // the gesture works before settings load. Only apply stored config here.
  if (!_inlineTranslateCleanup) {
    _inlineTranslateCleanup = initInlineTranslate();
  }
  // Always apply inline translate settings (defaults are guaranteed by loadSettings)
  if (settings.inlineTranslate) {
    setInlineTranslateEnabled(settings.inlineTranslate.enabled !== false);
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
      // P1: removed dead customTheme re-apply block that read the stale closure
      // `settings.theme` (frozen at initInteractionFeatures() time) instead of
      // newSettings. The theme block above (lines 418-425) already applies
      // customTheme correctly from newSettings on every change.
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
    if (isContextInvalidated()) return;
    if (message.action === 'startTranslation') {
      // FR-3: await lifecycle so concurrent commands serialize.
      void startTranslation().then(() => {
        try {
          sendResponse?.({ success: true });
        } catch {
          /* channel may be closed */
        }
      });
      return true;
    } else if (message.action === 'stopTranslation') {
      void stopTranslationAsync().then(() => {
        try {
          sendResponse?.({ success: true });
        } catch {
          /* channel may be closed */
        }
      });
      return true;
    } else if (message.action === 'toggleTranslation') {
      void toggleTranslation().then(() => {
        try {
          sendResponse?.({ success: true });
        } catch {
          /* channel may be closed */
        }
      });
      return true;
    } else if (message.action === 'translateSelectedText') {
      if (message.text) {
        translateSelectedTextViaContextMenu(message.text);
      }
    } else if (message.action === 'translateInputBox') {
      // chrome.commands translate-input-box (Alt+I) → same pipeline as gesture
      void translateFocusedInput();
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
        invalidateCategoryIfUrlChanged();

        // If nothing cached yet, run heuristic detection and persist the result.
        // The cheap heuristic (domain map + meta/og) runs whenever context-aware
        // translation is on; it does NOT require the LLM-detection toggle.
        if (!getAutoDetectedCategory() && catSettings.enableContextAwareTranslation) {
          const ctx = extractPageContext(document, true);
          if (ctx.category) {
            persistHeuristicCategory(ctx.category, ctx.domain);
          }
        }

        const info = buildCategoryInfo(catSettings, categoryOverride);
        sendResponse(info);

        // Lazy LLM detection: refine weak heuristics / fill missing categories.
        // Locked sources (domain/llm/cache) and in-flight guards skip inside helper.
        if (
          catSettings.enableLLMPageCategoryDetection &&
          !categoryOverride &&
          !isAutoCategoryLocked()
        ) {
          triggerAutoCategoryDetection(catSettings, categoryOverride, () => {
            broadcastCategoryInfo(catSettings, categoryOverride);
          }).catch(() => {});
        }
      })();
      return true; // async response
    } else if (message.action === 'startSubtitleTranslation') {
      void import('@/content/subtitleCoordinator').then(({ manualActivateSubtitles }) => {
        void manualActivateSubtitles();
      });
    } else if (message.action === 'getStatus') {
      sendResponse(buildStatusResponse());
      return false; // synchronous
    } else if (message.action === 'getPageContentType') {
      // Popup asks whether the active document is a PDF so its "Open current PDF"
      // button works for extensionless URLs (e.g. https://arxiv.org/pdf/2606.20543)
      // that the URL-only heuristic in the popup misses.
      sendResponse({ isPdf: document.contentType === 'application/pdf' });
      return false; // synchronous
    } else if (message.action === 'GET_DOM_OUTLINE') {
      // Options/background AI site-rule suggest: capped structural outline only.
      const result = getDomOutlineFromDocument(document, location.href);
      sendResponse(result);
      return false; // synchronous
    }
  });
}

function destroyZombie(): void {
  console.log('[AnyLLMTranslate] Extension context invalidated — cleaning up zombified content script');

  if (viewportObserver) {
    try { viewportObserver.disconnect(); } catch { /* noop */ }
    viewportObserver = null;
  }
  if (mutationWatcher) {
    try { mutationWatcher.stop(); } catch { /* noop */ }
    mutationWatcher = null;
  }
  if (coordinatorCleanup) {
    try { coordinatorCleanup(); } catch { /* noop */ }
    coordinatorCleanup = null;
  }
  if (playerChromeCleanup) {
    try { playerChromeCleanup(); } catch { /* noop */ }
    playerChromeCleanup = null;
  }
  if (_beforeUnloadCleanup) {
    try { _beforeUnloadCleanup(); } catch { /* noop */ }
    _beforeUnloadCleanup = null;
  }
  if (_textSelectionCleanup) {
    try { _textSelectionCleanup(); } catch { /* noop */ }
    _textSelectionCleanup = null;
  }
  if (_hoverTranslateCleanup) {
    try { _hoverTranslateCleanup(); } catch { /* noop */ }
    _hoverTranslateCleanup = null;
  }
  if (_keyboardShortcutsCleanup) {
    try { _keyboardShortcutsCleanup(); } catch { /* noop */ }
    _keyboardShortcutsCleanup = null;
  }
  if (_inlineTranslateCleanup) {
    try { _inlineTranslateCleanup(); } catch { /* noop */ }
    _inlineTranslateCleanup = null;
  }
  if (_storageChangeListener) {
    try {
      chrome.storage.onChanged.removeListener(_storageChangeListener);
    } catch { /* noop */ }
    _storageChangeListener = null;
  }

  // Clear UI / translations
  try { removeAllTranslations(); } catch { /* noop */ }
  try { removeAllSectionTranslations(); } catch { /* noop */ }
  try { clearHoverCache(); } catch { /* noop */ }
  try { hideAutoTranslateNotification(); } catch { /* noop */ }

  replaceAllPieces([]);
  activeRequests = 0;
}

// Content script definition for WXT
export default defineContentScript({
  matches: ['<all_urls>'],
  // document_end: DOM ready, listeners before idle scripts finish; earlier than
  // document_idle so page capture handlers are less likely to steal keydown.
  runAt: 'document_end',
  cssInjectionMode: 'manifest',
  async main() {
    // Guard against re-injection on SPA re-routes or WXT reloads
    if ((window as unknown as Record<string, unknown>).__anyllmTranslateInitialized) return;
    (window as unknown as Record<string, unknown>).__anyllmTranslateInitialized = true;

    // Register platform handlers for isolated world.
    // GenericSubtitleHandler is registered LAST so platform-specific handlers
    // win first-match-wins in detectCurrentHandler(). Its activation is gated
    // on enableGenericSubtitleHandler in the coordinator (settings are not yet
    // loaded here).
    registerSubtitleHandlers([
      new YouTubeHandler(),
      new UdemyHandler(),
      new CourseraHandler(),
      new LinkedInHandler(),
      new HboMaxHandler(),
      new YoukuHandler(),
      new WetvHandler(),
      new GenericSubtitleHandler(),
    ]);

    setupMessageListener();
    coordinatorCleanup = startCoordinator();
    playerChromeCleanup = startPlayerChrome();

    // Attach inline-translate key listeners immediately (defaults), then apply
    // stored settings. Waiting on loadSettings() first delayed gesture capture.
    _inlineTranslateCleanup = initInlineTranslate();
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

    // PDF auto-detect: if the browser is rendering a PDF in its native viewer,
    // notify the background so it can auto-open the bundled translator. The
    // contentType check catches extensionless URLs (arxiv.org/pdf/2606.20543)
    // that URL heuristics miss. Skipped on extension pages (loop guard: the
    // viewer itself loads a PDF) — the background also re-checks defensively.
    if (!isExtensionPage) {
      detectPdfAndNotify({
        contentType: document.contentType,
        href: location.href,
        viewerOrigin: chrome.runtime.getURL(''),
        tabId: 0, // background resolves the real tab id from sender.tab.id
        sendMessage: (msg) => chrome.runtime.sendMessage(msg),
      });
    }

    // Sentinel check for context invalidation (e.g. reload or update)
    const sentinelInterval = setInterval(() => {
      if (isContextInvalidated()) {
        clearInterval(sentinelInterval);
        destroyZombie();
      }
    }, 1000);

    // Flush pending cache LRU updates on page unload
    const beforeUnloadListener = () => {
      try {
        flushLruUpdates().catch(() => {});
        chrome.runtime.sendMessage({ action: 'FLUSH_LRU' }).catch(() => {});
        chrome.runtime.sendMessage({ action: 'CANCEL_SUBTITLE_SESSION' }).catch(() => {});
      } catch { /* ignore since context might be invalidated */ }
      if (coordinatorCleanup) {
        coordinatorCleanup();
        coordinatorCleanup = null;
      }
      if (playerChromeCleanup) {
        playerChromeCleanup();
        playerChromeCleanup = null;
      }
      if (_textSelectionCleanup) {
        _textSelectionCleanup();
        _textSelectionCleanup = null;
      }
      if (_hoverTranslateCleanup) {
        _hoverTranslateCleanup();
        _hoverTranslateCleanup = null;
      }
      if (_keyboardShortcutsCleanup) {
        _keyboardShortcutsCleanup();
        _keyboardShortcutsCleanup = null;
      }
      if (_inlineTranslateCleanup) {
        _inlineTranslateCleanup();
        _inlineTranslateCleanup = null;
      }
      if (_storageChangeListener) {
        try {
          chrome.storage.onChanged.removeListener(_storageChangeListener);
        } catch { /* noop */ }
        _storageChangeListener = null;
      }
      clearInterval(sentinelInterval);
    };

    window.addEventListener('beforeunload', beforeUnloadListener);
    _beforeUnloadCleanup = () => {
      window.removeEventListener('beforeunload', beforeUnloadListener);
      clearInterval(sentinelInterval);
    };

    console.log('[AnyLLMTranslate] Content script loaded');
  },
});
