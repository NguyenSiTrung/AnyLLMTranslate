/**
 * WXT Content Script entrypoint.
 * Orchestrates: domWalker → viewportObserver → background message → translationDisplay
 * Plus: text selection translate, hover translate
 */

import type { TranslationPiece } from '@/types/translation';
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
} from '@/content/autoTranslateNotification';
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
import { detectLanguage, isSameLanguage } from '@/lib/langDetect';
import { isTransientTranslationError } from '@/lib/translationErrors';
import {
  loadSnapshot,
  saveSnapshot,
  deriveContentHash,
  type ResumePiece,
} from '@/lib/webResume';
import { WEB_STREAM_PORT } from '@/types/messages';
import type { TranslationResultMessage, TranslationResultItem } from '@/types/messages';

let viewportObserver: ViewportObserver | null = null;
let mutationWatcher: MutationWatcher | null = null;
let allPieces: TranslationPiece[] = [];
/** FR-7: the target language of the active session, captured so the
 *  pagehide snapshot writer can record it without re-reading settings. */
let currentTargetLanguage = 'vi';
let coordinatorCleanup: (() => void) | null = null;
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
let lastSystemicError = '';
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

function enterSystemicPause(error: string): void {
  systemicPause = true;
  lastSystemicError = error;
  viewportObserver?.setPaused(true);
}

function clearSystemicPause(): void {
  if (!systemicPause && !viewportObserver?.isPaused) return;
  systemicPause = false;
  lastSystemicError = '';
  viewportObserver?.setPaused(false);
  // Re-observe unfinished pieces so scrolling/resume can continue after recovery.
  if (viewportObserver) {
    const pending = allPieces.filter((p) => !p.isTranslated && !inFlightPieceIds.has(p.id));
    viewportObserver.releaseAll(pending.map((p) => p.id));
    viewportObserver.observeAll(pending);
  }
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

  // Drop pieces we already tracked (same parent + same text) — common when
  // scrolling SPAs re-insert or mutate nodes under a large container.
  return extracted.filter((piece) => {
    if (isContentHandled(piece)) return false;
    const dup = allPieces.some(
      (p) => p.parentElement === piece.parentElement && p.text === piece.text,
    );
    return !dup;
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
): Promise<TranslationResultMessage> {
  return new Promise((resolve) => {
    const pieceById = new Map(pieces.map((p) => [p.id, p]));
    const results: TranslationResultItem[] = [];
    let settled = false;

    const port = chrome.runtime.connect({ name: WEB_STREAM_PORT });
    port.postMessage({
      type: 'request',
      pieces: pieces.map((p) => ({ id: p.id, text: p.text, inArticleContext: p.inArticleContext })),
      sourceLanguage,
      targetLanguage,
    });

    port.onMessage.addListener((msg: {
      type: string;
      id?: string;
      text?: string;
      results?: TranslationResultItem[];
      error?: string;
      partial?: boolean;
    }) => {
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
        port.disconnect();
        resolve({
          success: true,
          results: msg.results ?? results,
          ...(msg.partial ? { partial: true } : {}),
        });
      } else if (msg.type === 'error') {
        settled = true;
        port.disconnect();
        // Surface as a failure so translatePieces' error branch + non-streaming
        // fallback can handle it.
        resolve({ success: false, error: msg.error ?? 'Streaming failed' });
      }
    });

    port.onDisconnect.addListener(() => {
      if (!settled) {
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
  options: { skipFailureCache?: boolean; autoRetriedOnce?: boolean } = {},
): Promise<void> {
  if (pieces.length === 0) return;
  const { skipFailureCache = false, autoRetriedOnce = false } = options;

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
  const requestSession = translationSession;

  // Load settings before the placeholder loop so the compact-inline flag
  // gates which spinner style each piece gets (short → inline, long → block).
  const settings = await loadSettings();
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

    // Persist heuristic category in the singleton if not yet cached
    if (pageContext?.category && !getAutoDetectedCategory()) {
      setAutoDetectedCategory(pageContext.category);
      broadcastCategoryInfo(settings, categoryOverride);
    }

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

    // FR-3: source-language gate. When detection is on and sourceLanguage is
    // 'auto', skip pieces whose detected language already matches the target —
    // they would round-trip through the LLM unchanged (wasted tokens + latency).
    // Confidence threshold guards against false positives on ambiguous text.
    const SAME_LANG_CONFIDENCE = 0.55;
    let translatablePieces = workPieces;
    if (settings.enableSourceLanguageDetection && settings.sourceLanguage === 'auto') {
      translatablePieces = workPieces.filter((piece) => {
        const detected = detectLanguage(piece.text);
        if (detected.lang && isSameLanguage(detected.lang, settings.targetLanguage) && detected.confidence >= SAME_LANG_CONFIDENCE) {
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

    let response: TranslationResultMessage;
    if (settings.enableStreamingTranslation) {
      // FR-6: try streaming first; fall back to non-streaming on failure.
      const streamed = await streamTranslate(translatablePieces, settings.sourceLanguage, settings.targetLanguage, settings.enableCompactInlineForShortText);
      response = streamed.success
        ? streamed
        : await chrome.runtime.sendMessage({
            action: 'translate',
            pieces: translatablePieces.map((p) => ({ id: p.id, text: p.text, inArticleContext: p.inArticleContext })),
            sourceLanguage: settings.sourceLanguage,
            targetLanguage: settings.targetLanguage,
            pageContext,
            skipFailureCache,
          });
    } else {
      response = await chrome.runtime.sendMessage({
        action: 'translate',
        pieces: translatablePieces.map((p) => ({ id: p.id, text: p.text, inArticleContext: p.inArticleContext })),
        sourceLanguage: settings.sourceLanguage,
        targetLanguage: settings.targetLanguage,
        pageContext,
        skipFailureCache,
      });
    }

    // Session guard: if the page has been restored or re-translated
    // since this request was issued, drop the response without touching
    // the DOM. This prevents the classic "ghost translation" race where
    // a late LLM reply re-injects translations onto an already-restored page.
    if (requestSession !== translationSession) {
      return;
    }

    if (response.success && response.results) {
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
    if (requestSession !== translationSession) {
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
    requestSession === translationSession
  ) {
    await translatePieces(pendingAutoRetry, {
      skipFailureCache: true,
      autoRetriedOnce: true,
    });
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

/** FR-7: one-time flag so the pagehide/beforeunload snapshot writer is registered once per session. */
let resumeSnapshotWriterRegistered = false;

/**
 * FR-7: restore already-translated pieces from a prior session's snapshot.
 * Matches pieces by `text` (the snapshot may use different piece ids after a
 * re-extraction) and applies the cached translation via the display layer. Only
 * restores pieces whose translation is still in the success cache — a cache
 * miss degrades gracefully (the viewport observer re-translates normally).
 */
async function restoreFromSnapshot(
  pieces: TranslationPiece[],
  targetLanguage: string,
  compactInlineEnabled: boolean,
): Promise<void> {
  try {
    const url = window.location.href;
    const contentHash = await deriveContentHash(pieces.map((p) => p.text).join('\n'));
    const snapshot = await loadSnapshot(url, contentHash);
    if (!snapshot) return;
    // Only restore if the target language matches the snapshot's.
    if (snapshot.targetLanguage !== targetLanguage) return;

    // Build a text → translation map from the snapshot for fast lookup.
    const translatedByText = new Map<string, string>();
    for (const piece of snapshot.pieces) {
      if (piece.status === 'translated' && piece.translatedText) {
        translatedByText.set(piece.text, piece.translatedText);
      }
    }
    if (translatedByText.size === 0) return;

    let restored = 0;
    for (const piece of pieces) {
      const cached = translatedByText.get(piece.text);
      if (cached !== undefined) {
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
    }
    if (restored > 0) sendStatusUpdate();
  } catch {
    // Resume is best-effort — never block normal translation on it.
  }
}

/** FR-7: write a resume snapshot on pagehide/beforeunload so the next session can restore. */
function writeResumeSnapshot(): void {
  if (allPieces.length === 0) return;
  const url = window.location.href;
  const targetLang = currentTargetLanguage;
  void (async () => {
    try {
      const contentHash = await deriveContentHash(allPieces.map((p) => p.text).join('\n'));
      const resumePieces: ResumePiece[] = allPieces.map((p) => ({
        id: p.id,
        text: p.text,
        ...(p.translatedText !== undefined ? { translatedText: p.translatedText } : {}),
        status: p.isTranslated ? 'translated' : 'pending',
      }));
      await saveSnapshot({
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
}

/** Register the pagehide/beforeunload snapshot writer once per session (FR-7). */
function registerResumeSnapshotWriter(): void {
  if (resumeSnapshotWriterRegistered) return;
  resumeSnapshotWriterRegistered = true;
  window.addEventListener('pagehide', writeResumeSnapshot, { once: false });
  window.addEventListener('beforeunload', writeResumeSnapshot, { once: false });
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
  inFlightPieceIds.clear();
  handledContentKeys.clear();
  systemicPause = false;
  lastSystemicError = '';
  hideTranslationErrorNotification();

  // Load settings to apply visual settings
  const settings = await loadSettings();
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

  const effectiveExcludes = mergeExcludeSelectors(
    baseExcludes,
    matchingRule?.excludeSelectors,
  );
  allPieces = extractPieces(document.body, {
    includeSelectors: matchingRule?.includeSelectors,
    excludeSelectors: effectiveExcludes,
    enableRichTranslate: settings.enableRichTranslate,
    enableBodyTagWhitelist: settings.enableBodyTagWhitelist,
    enableAsideCaps: settings.enableAsideCaps,
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

  // FR-7: cross-session resume. If a fresh snapshot exists for this URL +
  // content hash, restore already-translated pieces immediately (no LLM calls
  // — relies on the success cache still holding the translations).
  if (settings.enableWebResume && allPieces.length > 0) {
    void restoreFromSnapshot(allPieces, settings.targetLanguage, settings.enableCompactInlineForShortText).catch(() => {});
    // Register a one-time snapshot writer on page hide so the next session can resume.
    registerResumeSnapshotWriter();
  }

  mutationWatcher = new MutationWatcher(
    (addedElements) => {
      if (!viewportObserver || getPageState() === 'off') return;

      const newPieces = addedElements.flatMap((element) =>
        extractDynamicPieces(element, matchingRule?.includeSelectors, effectiveExcludes, settings.enableRichTranslate, settings.enableAsideCaps),
      );
      if (newPieces.length === 0) return;

      allPieces.push(...newPieces);
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
  clearHoverCache();
  hideAutoTranslateNotification();
  hideTranslationErrorNotification();
  allPieces = [];
  activeRequests = 0;
  inFlightPieceIds.clear();
  handledContentKeys.clear();
  systemicPause = false;
  lastSystemicError = '';
  // FR-7: write a final snapshot before clearing so the next session can resume,
  // then reset the writer-registration flag.
  writeResumeSnapshot();
  resumeSnapshotWriterRegistered = false;

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
      startTranslation();
    } else if (message.action === 'stopTranslation') {
      stopTranslation();
    } else if (message.action === 'toggleTranslation') {
      toggleTranslation();
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
        // Singleton holds LLM-detected or heuristic results
        let detected = getAutoDetectedCategory();

        // If nothing cached yet, run heuristic detection and persist the result.
        // The cheap heuristic (domain map + meta/og) runs whenever context-aware
        // translation is on; it does NOT require the LLM-detection toggle.
        if (!detected && catSettings.enableContextAwareTranslation) {
          const heuristic = extractPageContext(document, true).category;
          if (heuristic) {
            setAutoDetectedCategory(heuristic);
            detected = heuristic;
          }
        }

        const info = buildCategoryInfo(catSettings, categoryOverride);
        sendResponse(info);

        // Lazy LLM detection: when nothing is detected yet, detection is enabled,
        // and no manual override is set, kick off an async detection so the popup's
        // pageCategoryUpdate listener fills in the category shortly after open.
        // The helper's in-flight guard prevents duplicate calls across repeated
        // popup opens while one detection is pending.
        if (!detected && catSettings.enableLLMPageCategoryDetection && !categoryOverride) {
          triggerAutoCategoryDetection(catSettings, categoryOverride, (cat) => {
            setAutoDetectedCategory(cat);
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
      sendResponse({
        status: computeStatus(),
        translatedCount: allPieces.filter((p) => p.isTranslated).length,
        totalCount: allPieces.length,
      });
      return false; // synchronous
    } else if (message.action === 'getPageContentType') {
      // Popup asks whether the active document is a PDF so its "Open current PDF"
      // button works for extensionless URLs (e.g. https://arxiv.org/pdf/2606.20543)
      // that the URL-only heuristic in the popup misses.
      sendResponse({ isPdf: document.contentType === 'application/pdf' });
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

  allPieces = [];
  activeRequests = 0;
}

// Content script definition for WXT
export default defineContentScript({
  matches: ['<all_urls>'],
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
