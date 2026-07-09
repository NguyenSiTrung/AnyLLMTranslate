/**
 * Background service worker — central message router and translation coordinator.
 * Handles all communication between popup, content scripts, and translation service.
 */

import type {
  ExtensionMessage,
  TranslationResultMessage,
  TranslateSubtitleMessage,
  TranslateSelectionMessage,
  TranslateSelectionResult,
  FetchSubtitleMessage,
  DetectPageCategoryLlmMessage,
  ClassifyPdfParagraphsMessage,
  ClassifyPdfParagraphsResult,
  ResegmentYoutubeAsrMessage,
  ResegmentYoutubeAsrResult,
  PdfDetectedMessage,
  TranslationResultItem,
  PdfStreamPortMessage,
  PdfStreamPiece,
  PdfStreamDone,
  PdfStreamError,
} from '@/types/messages';
import {
  parseSelectionDictionary,
  hasDictionaryFields,
  extractTranslationFallback,
  type SelectionDictionaryResult,
} from '@/lib/selectionDictionary';
import {
  buildSelectionDictionarySystemPrompt,
  buildSelectionDictionaryUserPrompt,
} from '@/lib/selectionDictionaryPrompt';
import { generateSelectionDictionaryCacheKey } from '@/lib/selectionCacheKey';
import { getLanguageName } from '@/lib/languages';
import { PDF_STREAM_PORT, WEB_STREAM_PORT } from '@/types/messages';
import type { SubtitleCue } from '@/types/subtitle';
import type { ExtensionSettings } from '@/types/config';
import { parseHlsSubtitlePlaylist, parseDashManifest, parseHlsManifest } from '@/lib/manifestParser';
import { concatVttSegments } from '@/lib/vttSegmentConcat';
import { parseWebVTT } from '@/lib/subtitleParser';
import {
  parseSubtitleContent,
  isManifestResponse,
  isMaxCdnVttSegmentUrl,
  detectMpdRequests,
  resolveSegmentFetchUrl,
} from '@/lib/maxMpdSubtitles';
import { SUBTITLE_CHUNK_SIZE } from '@/lib/constants';
import { subtitleLanguagesMatch } from '@/lib/subtitleLanguageMatch';
import { loadSettings, onSettingsChange, computePoolSignature } from '@/lib/config';
import { setCategoryOverride as storeCategoryOverride, getCategoryOverride as fetchCategoryOverride, initTabCleanup as initCategoryTabCleanup } from '@/services/categoryStore';
import { ProviderPoolCoordinator } from '@/services/providerPool';
import type { TranslationService } from '@/services/base';
import { validateProviderConfig } from '@/services/base';
import { getCachedTranslation, cacheTranslation, evictCache, clearCache, getCachedTranslationByKey, cacheTranslationByKey, getCachedFailure, cacheFailure, deleteCachedFailure } from '@/services/cacheManager';
import { formatGlossary } from '@/lib/glossary';
import { splitPiecesIntoBatches, dedupPiecesByText } from '@/lib/textBatching';
import { resolveEffectiveKnobs, type SubtitleProfile, type ProfileKnobs } from '@/lib/subtitleProfiles';
import { generateSubtitleCacheKey, type GlossarySnapshot } from '@/lib/subtitleCacheKey';
import { withRetry } from '@/lib/subtitleRetry';
import { mergeProperNouns, formatRollingGlossary } from '@/lib/subtitleGlossary';
import { contentHash } from '@/lib/subtitleFilmGlossary';
import { loadFilmGlossary, saveFilmGlossary } from '@/services/filmGlossaryStore';
import { preScanNames } from '@/services/subtitleNameScanner';
import { recordUsage } from '@/services/statsCollector';
import { normalizeHost } from '@/services/statsCounters';
import { invalidateDebugCache } from '@/services/debugLog';
import { shouldAutoOpenPdf, buildSessionKey } from '@/services/pdfAutoOpen';

const MAX_PROGRESSIVE_DASH_SEGMENTS = 500;

/** Best-effort host for dimensional stats (tab URL → normalized hostname). */
function hostFromSender(sender?: chrome.runtime.MessageSender): string | undefined {
  try {
    const url = sender?.tab?.url ?? sender?.url;
    if (!url) return undefined;
    return normalizeHost(new URL(url).hostname);
  } catch {
    return undefined;
  }
}

/** First enabled pool provider id, if any (rotation makes exact slot hard). */
function bestEffortProviderId(settings: ExtensionSettings): string | undefined {
  return settings.providers?.find((p) => p.enabled)?.id;
}

/** Priority queue state for active translation sessions */
interface TranslationSession {
  queue: number[];
  setPriority: (cueIndex: number, chunkSize: number) => void;
  sessionId: number;
}
const activeSessions = new Map<number, TranslationSession>();
let subtitleSessionCounter = 0;

/** Keep-alive alarm name for MV3 service worker */
const KEEPALIVE_ALARM = 'sw-keepalive';

/** Track alarm existence to prevent redundant chrome.alarms.create calls */
let keepaliveAlarmActive = false;

/** Create or ensure keep-alive alarm exists when sessions are active */
function ensureKeepaliveAlarm(): void {
  if (keepaliveAlarmActive) return;
  keepaliveAlarmActive = true;
  chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.33 }); // ~20s
}

/** Clear keep-alive alarm when no sessions (subtitle OR PDF) remain */
function clearKeepaliveAlarm(): void {
  if (activeSessions.size === 0 && pdfSessions.size === 0 && keepaliveAlarmActive) {
    keepaliveAlarmActive = false;
    chrome.alarms.clear(KEEPALIVE_ALARM);
  }
}

/**
 * Stop an active progressive subtitle session for a tab.
 * Drains the queue so the background loop exits, removes the session, and
 * clears the keep-alive alarm when no sessions remain. Safe to call when no
 * session exists. Called on restore, explicit cancel, and tab removal.
 */
function stopSubtitleSession(tabId: number): void {
  const session = activeSessions.get(tabId);
  if (session) {
    session.queue.length = 0; // running loop exits on its next iteration
    activeSessions.delete(tabId);
  }
  clearKeepaliveAlarm();
}

/**
 * Register tab-removal cleanup so closing a tab tears down its subtitle session
 * and page-translation session tracking. Call once at service worker startup.
 */
export function initSubtitleSessionCleanup(): void {
  initCategoryTabCleanup();
  chrome.tabs.onRemoved.addListener((tabId: number) => {
    stopSubtitleSession(tabId);
    translatedTabSessions.delete(tabId);
    // PDF viewer keep-alive cleanup: closing a viewer tab must deregister its
    // session so the SW keep-alive alarm can clear once no viewers remain.
    unregisterPdfSession(tabId);
  });
}

// Alarm listener — existence of alarm keeps SW alive
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM) {
    // No-op: alarm firing keeps service worker alive
  }
});

/**
 * PDF streaming translation port handler (Phase 2).
 *
 * The PDF viewer opens a port named TRANSLATE_PDF_STREAM with a request
 * message. The background calls service.translateStream() and pushes piece
 * deltas back through the port as they arrive, then a terminal 'done' or
 * 'error' message. On error, the viewer falls back to non-streaming.
 *
 * Registered once at SW startup via chrome.runtime.onConnect.
 */
export function initPdfStreamPortListener(): void {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== PDF_STREAM_PORT) return;

    port.onMessage.addListener(async (msg: PdfStreamPortMessage) => {
      if (msg.type !== 'request') return;
      try {
        const service = await initService();
        if (!service.translateStream) {
          // No streaming support — post an error so the viewer falls back.
          port.postMessage({ type: 'error', error: 'Streaming not supported' } satisfies PdfStreamError);
          return;
        }
        const texts = new Map(msg.pieces.map((p) => [p.id, p.text]));
        const result = await service.translateStream(
          {
            texts,
            sourceLanguage: msg.sourceLanguage,
            targetLanguage: msg.targetLanguage,
            pageContext: {
              title: 'pdf-viewer',
              description: 'PDF document translation',
              domain: 'pdf',
              category: 'document',
            },
          },
          (id, text) => {
            port.postMessage({ type: 'piece', id, text } satisfies PdfStreamPiece);
          },
        );
        const results: TranslationResultItem[] = result.success
          ? Array.from(result.translations, ([id, translatedText]) => ({ id, translatedText }))
          : [];
        port.postMessage({ type: 'done', results } satisfies PdfStreamDone);
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Streaming translation failed';
        port.postMessage({ type: 'error', error } satisfies PdfStreamError);
      }
    });
  });
}

/**
 * FR-6: web-page streaming translation port. Content script opens a port,
 * background streams parsed JSON piece deltas as they arrive (reusing the
 * OpenAICompatibleService.translateStream + SSE parser), then a terminal
 * 'done'/'error'. Falls back to non-streaming in the content script on error
 * or when the service lacks translateStream.
 */
export function initWebStreamPortListener(): void {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== WEB_STREAM_PORT) return;

    port.onMessage.addListener(async (msg: PdfStreamPortMessage) => {
      if (msg.type !== 'request') return;
      try {
        const service = await initService();
        if (!service.translateStream) {
          port.postMessage({ type: 'error', error: 'Streaming not supported' } satisfies PdfStreamError);
          return;
        }
        const texts = new Map(msg.pieces.map((p) => [p.id, p.text]));
        const result = await service.translateStream(
          {
            texts,
            sourceLanguage: msg.sourceLanguage,
            targetLanguage: msg.targetLanguage,
          },
          (id, text) => {
            port.postMessage({ type: 'piece', id, text } satisfies PdfStreamPiece);
          },
        );
        const results: TranslationResultItem[] = result.success
          ? Array.from(result.translations, ([id, translatedText]) => ({ id, translatedText }))
          : [];
        // FR-2/FR-7: write fresh translations to the success cache so resume +
        // negative-cache lookups work the same as the non-streaming path.
        if (result.success) {
          const settings = await loadSettings();
          for (const { id, translatedText } of results) {
            const piece = msg.pieces.find((p) => p.id === id);
            if (piece) {
              const isBackfilled = result.partial === true && translatedText === piece.text;
              if (!isBackfilled) {
                cacheTranslation(
                  piece.text,
                  translatedText,
                  msg.sourceLanguage,
                  msg.targetLanguage,
                ).catch(() => {});
              }
            }
          }
          void settings; // settings loaded for cache writes above (TTL via defaults).
        }
        port.postMessage({ type: 'done', results } satisfies PdfStreamDone);
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Streaming translation failed';
        port.postMessage({ type: 'error', error } satisfies PdfStreamError);
      }
    });
  });
}

/** Track which tabs have been counted for page translation stats */
const translatedTabSessions = new Set<number>();

/** Active PDF viewer sessions (tab ids). Arms the keep-alive alarm while
 *  ≥1 viewer is open so long content-heavy translation work is not interrupted
 *  by MV3 service-worker eviction. Mirrors the subtitle keep-alive pattern. */
const pdfSessions = new Set<number>();

/** Register a PDF viewer tab as an active session. Idempotent. */
function registerPdfSession(tabId: number): void {
  if (!pdfSessions.has(tabId)) {
    pdfSessions.add(tabId);
    ensureKeepaliveAlarm();
  }
}

/** Deregister a PDF viewer tab; clears the keep-alive alarm when none remain. */
function unregisterPdfSession(tabId: number): void {
  pdfSessions.delete(tabId);
  clearKeepaliveAlarm();
}

/** Active translation service instance */
/** The active translation service. Under the multi-provider pool this is a
 *  ProviderPoolCoordinator that round-robins across all enabled (provider, key)
 *  slots with circuit-breaker failover. Falls back to a bare OpenAICompatibleService
 *  only if the pool is somehow empty (defensive — should not happen post-migration). */
let translationService: TranslationService | null = null;

/** Rate-limiting semaphore factory */
interface SemaphoreWaiter {
  /** Hand the active slot to this waiter (resolves its acquire promise). */
  grant: () => void;
  /** True once this waiter has been resolved or rejected. */
  settled: boolean;
}
interface SemaphoreState {
  active: number;
  queue: SemaphoreWaiter[];
}
interface Semaphore {
  acquire: () => Promise<void>;
  release: () => void;
  __state: SemaphoreState;
}

function createSemaphore(maxConcurrent: number, maxQueue: number, timeoutMs: number): Semaphore {
  const state: SemaphoreState = { active: 0, queue: [] };

  async function acquire(): Promise<void> {
    if (state.active < maxConcurrent) {
      state.active++;
      return;
    }
    if (state.queue.length >= maxQueue) {
      throw new Error('Too many translation requests — please try again later');
    }
    return new Promise<void>((resolve, reject) => {
      const waiter: SemaphoreWaiter = { settled: false, grant: () => {} };

      const timeout = setTimeout(() => {
        if (waiter.settled) return;
        waiter.settled = true;
        const idx = state.queue.indexOf(waiter);
        if (idx !== -1) state.queue.splice(idx, 1);
        reject(new Error('Translation request timed out waiting in queue'));
      }, timeoutMs);

      waiter.grant = () => {
        if (waiter.settled) return;
        waiter.settled = true;
        clearTimeout(timeout);
        resolve();
      };

      state.queue.push(waiter);
    });
  }

  function release(): void {
    while (state.queue.length > 0) {
      const next = state.queue.shift();
      if (next && !next.settled) {
        next.grant();
        return;
      }
    }
    state.active = Math.max(0, state.active - 1);
  }

  return { acquire, release, __state: state };
}

/** Default semaphore for page & subtitle translations: max 3 concurrent, queue 10 */
const MAX_CONCURRENT = 3;
const MAX_QUEUE = 10;
const QUEUE_TIMEOUT_MS = 30000;
const semaphore = createSemaphore(MAX_CONCURRENT, MAX_QUEUE, QUEUE_TIMEOUT_MS);
const acquireSemaphore = semaphore.acquire;
const releaseSemaphore = semaphore.release;

/** Chunk size for progressive subtitle translation (cues per LLM call).
 *  Shared with the overlay via lib/constants so chunk-boundary math stays in sync. */
const CHUNK_SIZE = SUBTITLE_CHUNK_SIZE;

/** Dedicated PDF semaphore: max 2 concurrent, queue 6 — isolated from page/subtitle */
const PDF_MAX_CONCURRENT = 2;
const PDF_MAX_QUEUE = 6;
const pdfSemaphore = createSemaphore(PDF_MAX_CONCURRENT, PDF_MAX_QUEUE, QUEUE_TIMEOUT_MS);
const acquirePdfSemaphore = pdfSemaphore.acquire;
const releasePdfSemaphore = pdfSemaphore.release;

/** Reset semaphore state. Exported for tests. */
function __resetSemaphoreForTest(): void {
  for (const waiter of semaphore.__state.queue) waiter.settled = true;
  semaphore.__state.active = 0;
  semaphore.__state.queue = [];
  for (const waiter of pdfSemaphore.__state.queue) waiter.settled = true;
  pdfSemaphore.__state.active = 0;
  pdfSemaphore.__state.queue = [];
}

/** Inspect semaphore state. Exported for tests. */
function __getSemaphoreStateForTest(): { active: number; queued: number } {
  return { active: semaphore.__state.active, queued: semaphore.__state.queue.length };
}

/** Inspect PDF semaphore state. Exported for tests. */
function __getPdfSemaphoreStateForTest(): { active: number; queued: number } {
  return { active: pdfSemaphore.__state.active, queued: pdfSemaphore.__state.queue.length };
}

/** Seed an active subtitle session. Exported for tests. */
function __seedSubtitleSessionForTest(tabId: number): { queue: number[]; sessionId: number } {
  const sid = ++subtitleSessionCounter;
  const session: TranslationSession = { queue: [1, 2, 3], setPriority: () => {}, sessionId: sid };
  activeSessions.set(tabId, session);
  keepaliveAlarmActive = true; // simulate ensureKeepaliveAlarm having been called
  return session;
}

/** Count active subtitle sessions. Exported for tests. */
function __getActiveSessionCountForTest(): number {
  return activeSessions.size;
}

/** Reset PDF viewer session set + keep-alive flag. Exported for tests. */
function __resetPdfSessionsForTest(): void {
  pdfSessions.clear();
  keepaliveAlarmActive = false;
}

/** Count active PDF viewer sessions. Exported for tests. */
function __getPdfSessionCountForTest(): number {
  return pdfSessions.size;
}

/** Whether the keep-alive alarm is currently armed. Exported for tests. */
function __isKeepaliveArmedForTest(): boolean {
  return keepaliveAlarmActive;
}

/**
 * Initialize or reconfigure the translation service from settings.
 *
 * Under the multi-provider pool, this returns a {@link ProviderPoolCoordinator}
 * that round-robins across all enabled (provider, key) slots with circuit-
 * breaker failover (FR-6). The coordinator is the single seam: every
 * translation path (page, subtitle, PDF, selection, hover, inline,
 * category-detect, glossary preview) calls through here, so the pool covers
 * them all without per-path changes.
 *
 * `rebuild()` preserves member-service instances + circuit-breaker state for
 * unchanged key identities, so a live settings change (onSettingsChange /
 * updateSettings message) hot-swaps config without losing rate-limiter windows
 * or breaker cooldowns.
 */
/**
 * FR-6: cached decrypted settings + pool signature so the hot translate path
 * doesn't re-run the AES-GCM decrypt loop or a full pool rebuild on every call.
 * The cache is invalidated by {@link onSettingsChange} (see initSettingsWatcher).
 * Signature comparison is O(keys) and allocation-light — safe per-request.
 */
let cachedDecryptedSettings: ExtensionSettings | null = null;
let lastPoolSignature: string | null = null;

/** FR-6 test seam: reset the settings/signature caches between tests. */
function __resetSettingsCacheForTest(): void {
  cachedDecryptedSettings = null;
  lastPoolSignature = null;
}

async function initService(): Promise<TranslationService> {
  // FR-6 (#8): memoize the decrypted settings so the AES-GCM decrypt loop in
  // loadSettings doesn't run on every translate call. Invalidated on
  // onSettingsChange.
  const settings =
    cachedDecryptedSettings ?? (await loadSettings());
  cachedDecryptedSettings = settings;

  // FR-6 (#7): signature-based dirty tracking — only rebuild the pool when the
  // pool-relevant settings actually changed (vs. on every translate call).
  const signature = computePoolSignature(settings);
  const existing = translationService;
  if (existing instanceof ProviderPoolCoordinator && signature === lastPoolSignature) {
    // Pool config unchanged since last init — reuse the built coordinator as-is.
    return existing;
  }

  // Build or rebuild the pool coordinator. The coordinator is the single seam
  // covering all translation paths; rebuild() preserves member-service
  // instances + circuit-breaker state for unchanged key identities.
  const coord: ProviderPoolCoordinator =
    existing instanceof ProviderPoolCoordinator
      ? existing
      : new ProviderPoolCoordinator();
  translationService = coord;
  coord.rebuild(settings);
  lastPoolSignature = signature;

  return coord;
}

async function handleTranslate(
  message: ExtensionMessage & { action: 'translate' },
  sender?: chrome.runtime.MessageSender,
): Promise<TranslationResultMessage> {
  // Route PDF translations through a dedicated semaphore so they don't
  // compete with regular page/subtitle translations for the same slots.
  const isPdf = message.pageContext?.domain === 'pdf';
  const acquire = isPdf ? acquirePdfSemaphore : acquireSemaphore;
  const release = isPdf ? releasePdfSemaphore : releaseSemaphore;

  // For PDF translations, honor any tab-scoped category override set via the
  // popup's category dropdown (the PDF viewer hardcodes 'document' because it
  // has no content script to detect categories).
  if (isPdf && message.pageContext && sender?.tab?.id) {
    const override = fetchCategoryOverride(sender.tab.id);
    if (override) {
      message.pageContext = { ...message.pageContext, category: override };
    }
  }

  await acquire();
  try {
    const usageMode = isPdf ? 'pdf' : 'page';
    // Track page translation (once per tab session). PDF uses mode 'pdf' on
    // usage events (pdfEvents) rather than pageSessions.
    const tabId = sender?.tab?.id;
    if (tabId && !translatedTabSessions.has(tabId)) {
      translatedTabSessions.add(tabId);
      if (!isPdf) {
        recordUsage({
          mode: 'page',
          pageSession: true,
          host: hostFromSender(sender),
          sourceLanguage: message.sourceLanguage,
          targetLanguage: message.targetLanguage,
        }).catch(() => {});
      }
    }

    const settings = await loadSettings();
    const glossaryBlock = formatGlossary(settings.glossary ?? []);
    const providerId = bestEffortProviderId(settings);
    const host = hostFromSender(sender);

    // FR-1: Split pieces into cached and uncached
    const cachedResults: Array<{ id: string; translatedText: string }> = [];
    const uncachedPieces: Array<{ id: string; text: string }> = [];
    // FR-4: per-piece failures (from negative-cache hits or batch failures).
    const failedResults: Array<{ id: string; error: string }> = [];
    let cacheCharacters = 0;

    for (const piece of message.pieces) {
      const cached = await getCachedTranslation(
        piece.text,
        message.sourceLanguage,
        message.targetLanguage,
        settings.cacheTTLDays,
      );
      if (cached !== null) {
        cachedResults.push({ id: piece.id, translatedText: cached });
        cacheCharacters += piece.text.length;
        continue;
      }
      // FR-4: negative cache — if a recent failure is cached for this piece,
      // short-circuit to an error result (no LLM call) so flaky providers aren't
      // retried on every scroll-past. The piece surfaces in `failed`, not
      // `results`, so the content script shows an error state.
      // Bypassed (and cleared) on a forced retry so the "Click to retry" button
      // actually re-calls the LLM instead of re-surfacing the cached error.
      if (settings.enableFailureCache && !message.skipFailureCache) {
        const failure = await getCachedFailure(
          piece.text,
          message.sourceLanguage,
          message.targetLanguage,
          settings.failureCacheTtlMinutes,
        );
        if (failure !== null) {
          failedResults.push({ id: piece.id, error: failure });
          continue;
        }
      } else if (message.skipFailureCache) {
        // Forced retry: drop any stale negative-cache entry for this piece so a
        // fresh failure isn't shadowed by the previous one (fire-and-forget).
        deleteCachedFailure(
          piece.text,
          message.sourceLanguage,
          message.targetLanguage,
        ).catch(() => {});
      }
      uncachedPieces.push(piece);
    }

    // If all pieces were cached or negative-cached, return immediately — no LLM call.
    // FR-4: surface negative-cached failures so the content script shows error states.
    if (uncachedPieces.length === 0) {
      if (cachedResults.length > 0) {
        recordUsage({
          mode: usageMode,
          cacheHits: cachedResults.length,
          cacheMisses: 0,
          cacheCharacters,
          host,
          sourceLanguage: message.sourceLanguage,
          targetLanguage: message.targetLanguage,
          providerId,
        }).catch(() => {});
      }
      return {
        success: true,
        results: cachedResults,
        ...(failedResults.length > 0 ? { failed: failedResults } : {}),
      };
    }

    ensureKeepaliveAlarm();

    // FR-2: dedup identical short paragraphs that scrolled in together, then
    // split the unique pieces into request-sized sub-batches so a single large
    // viewport flush never becomes one oversized LLM call. Mirrors Immersive's
    // maxTextGroupLengthPerRequest / maxTextLengthPerRequest.
    // FR-3: partition by inArticleContext so article prose and chrome text
    // don't interleave in the same LLM request (coherent context per batch).
    const { deduped, dupes } = dedupPiecesByText(uncachedPieces);
    const batchOpts = {
      maxTextGroupLengthPerRequest: settings.maxTextGroupLengthPerRequest,
      maxTextLengthPerRequest: settings.maxTextLengthPerRequest,
    };
    const inArticleDeduped = deduped.filter((p) => p.inArticleContext === true);
    const outOfArticleDeduped = deduped.filter((p) => p.inArticleContext !== true);
    const batches = [
      ...splitPiecesIntoBatches(inArticleDeduped, batchOpts),
      ...splitPiecesIntoBatches(outOfArticleDeduped, batchOpts),
    ];

    // Translate only uncached pieces
    const service = await initService();

    const freshResults: Array<{ id: string; translatedText: string }> = [];
    let totalApiCalls = 0;
    let anyPartial = false;
    let lastError: string | undefined;

    for (const batch of batches) {
      const texts = new Map<string, string>();
      for (const piece of batch) {
        texts.set(piece.id, piece.text);
      }

      const result = await service.translate({
        texts,
        sourceLanguage: message.sourceLanguage,
        targetLanguage: message.targetLanguage,
        glossaryBlock: glossaryBlock || undefined,
        customSystemPrompt: settings.customSystemPrompt ?? null,
        pageContext: message.pageContext,
      });
      totalApiCalls++;

      if (result.success) {
        if (result.partial) anyPartial = true;
        for (const [id, translatedText] of result.translations.entries()) {
          freshResults.push({ id, translatedText });

          // Write each fresh translation back to cache.
          const piece = batch.find((p) => p.id === id);
          if (piece) {
            // FR-7 (fixes #9): partial-result guard — mirror the subtitle path.
            // When the LLM omitted this ID, the service back-fills it with the
            // source text. Never cache that: it would persist source-as-translation
            // and poison future lookups. (result.partial marks the chunk.)
            const isBackfilled = result.partial === true && translatedText === piece.text;
            if (!isBackfilled) {
              await cacheTranslation(
                piece.text,
                translatedText,
                message.sourceLanguage,
                message.targetLanguage,
              );
            }
          }
        }
      } else {
        // Record the first batch failure; continue so partial results still
        // surface (a later batch may succeed). If ALL batches fail, the final
        // return reports the error.
        lastError = result.error ?? 'Translation failed';
        // FR-4: write negative-cache entries for the failed pieces so a retry
        // within the TTL short-circuits without another LLM round-trip.
        if (settings.enableFailureCache) {
          for (const piece of batch) {
            failedResults.push({ id: piece.id, error: lastError });
            cacheFailure(
              piece.text,
              lastError,
              message.sourceLanguage,
              message.targetLanguage,
            ).catch(() => {});
          }
        }
      }
    }

    // Re-hydrate duplicate ids: each dup adopts its canonical piece's translation.
    if (dupes.size > 0) {
      for (const [dupeId, canonicalId] of dupes) {
        const canonical = freshResults.find((r) => r.id === canonicalId);
        if (canonical) {
          freshResults.push({ id: dupeId, translatedText: canonical.translatedText });
        } else {
          // Canonical didn't translate (e.g. its batch failed) — fall back to source.
          const dupePiece = uncachedPieces.find((p) => p.id === dupeId);
          if (dupePiece) {
            freshResults.push({ id: dupeId, translatedText: dupePiece.text });
          }
        }
      }
    }

    // Track translation stats (fire-and-forget)
    const totalChars = uncachedPieces.reduce((sum, p) => sum + p.text.length, 0);
    recordUsage({
      mode: usageMode,
      characters: totalChars,
      apiCalls: totalApiCalls,
      cacheHits: cachedResults.length,
      cacheMisses: uncachedPieces.length,
      cacheCharacters,
      host,
      sourceLanguage: message.sourceLanguage,
      targetLanguage: message.targetLanguage,
      providerId,
    }).catch(() => {});

    if (freshResults.length > 0) {
      return {
        success: true,
        results: [...cachedResults, ...freshResults],
        // Only flag partial when at least one batch back-filled; omit otherwise
        // so the default response shape stays `{ success, results }`.
        ...(anyPartial ? { partial: true } : {}),
        // FR-4: surface per-piece failures even on partial success so the content
        // script can show error states for negative-cached/failed pieces.
        ...(failedResults.length > 0 ? { failed: failedResults } : {}),
      };
    } else {
      return {
        success: false,
        error: lastError ?? 'Translation failed',
        ...(failedResults.length > 0 ? { failed: failedResults } : {}),
      };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMsg };
  } finally {
    clearKeepaliveAlarm();
    release();
  }
}

/** Handle restore message */
 

/** Handle testConnection message */
async function handleTestConnection(): Promise<{ success: boolean; error?: string }> {
  try {
    const settings = await loadSettings();
    const validation = validateProviderConfig(settings.provider);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const service = await initService();
    return await service.testConnection();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Connection test failed';
    return { success: false, error: errorMsg };
  }
}

/** Handle translateSubtitle message */
async function handleTranslateSubtitle(
  message: TranslateSubtitleMessage,
  sender?: chrome.runtime.MessageSender,
): Promise<{ success: boolean; cues?: SubtitleCue[]; error?: string; sessionId?: number }> {
  const sessionId = message.sessionId ?? ++subtitleSessionCounter;
  // P1 semaphore bypass fix: previously a single acquire/release wrapped the
  // whole function, but the async chunk loop runs AFTER this function returns —
  // so releaseSemaphore() fired while background chunks were still translating,
  // letting the next handleTranslateSubtitle bypass the MAX_CONCURRENT limit.
  // Now each chunk (including the synchronous first chunk) acquires its own slot.
  try {
    const service = await initService();
    const { cues, sourceLanguage, targetLanguage } = message;
    const tabId = sender?.tab?.id;

    const subtitleSettings = await loadSettings();
    const subtitleGlossary = formatGlossary(subtitleSettings.glossary ?? []);

    // Resolve translation knobs from the content-script-provided profile.
    // Unknown/absent profile falls back to 'media' (balanced defaults); an
    // unexpected profile string falls back inside resolveEffectiveKnobs too
    // (guards against malformed untrusted runtime data).
    const profile: SubtitleProfile = message.profile ?? 'media';
    // Layer partial overrides over the profile preset. Precedence:
    // per-tab (message.knobOverrides) > global (persisted) > preset.
    // With both absent this returns PROFILE_PRESETS[profile] exactly.
    const subtitleKnobs: ProfileKnobs = resolveEffectiveKnobs(
      profile,
      subtitleSettings.subtitleSettings?.knobOverrides,
      message.knobOverrides,
    );

    // Per-film proper-noun glossary: load by content hash, or pre-scan once and
    // persist. Seeds the rolling glossary so chunk 0 translates with the full
    // name list. Every failure degrades to an empty seed — translation proceeds.
    let filmGlossary: Record<string, string> | undefined;
    if (!message.skipFilmPreScan) {
      const filmHash = await contentHash(cues);
      try {
        filmGlossary = await loadFilmGlossary(filmHash);
        if (!filmGlossary) {
          filmGlossary = await preScanNames(service, sourceLanguage, targetLanguage, cues, subtitleKnobs);
          if (filmGlossary && Object.keys(filmGlossary).length > 0) {
            await saveFilmGlossary(filmHash, filmGlossary);
          }
        }
      } catch {
        filmGlossary = undefined;
      }
    }

    const CONTEXT_SIZE = 3;

    // Per-session rolling proper-noun glossary. Accumulates across chunks:
    // each chunk's extracted properNouns are merged in, and the formatted
    // block is injected into the next chunk's subtitle prompt for name
    // consistency. Dies when handleTranslateSubtitle returns (closure scope).
    // Seeded from the film glossary (pre-scan or persisted) so chunk 0 starts
    // with every known name. Seeding through mergeProperNouns enforces
    // MAX_ROLLING_GLOSSARY uniformly.
    const rollingGlossary = new Map<string, string>();
    if (filmGlossary) {
      mergeProperNouns(rollingGlossary, filmGlossary);
    }

    /** Build a stable glossary snapshot for the subtitle cache key. Captures the
     *  current global + rolling + film glossary state so a cache entry is
     *  invalidated when the glossary grows. */
    const buildGlossarySnapshot = (): GlossarySnapshot => ({
      globalEntries: (subtitleSettings.glossary ?? []).map((e) => ({ source: e.source, target: e.target })),
      properNouns: [...new Set([...rollingGlossary.keys(), ...(filmGlossary ? Object.keys(filmGlossary) : [])])],
    });

    // Mutate a copy of cues as we go
    const translatedCues = [...cues];

    const host = hostFromSender(sender);
    const providerId = bestEffortProviderId(subtitleSettings);

    // Helper to translate a chunk
    const translateChunk = async (chunkCues: SubtitleCue[], contextCues: SubtitleCue[]) => {
      // Each chunk holds its own semaphore slot so MAX_CONCURRENT is enforced
      // across the synchronous first chunk AND the background chunk loop.
      await acquireSemaphore();
      try {
        const chunkResult: SubtitleCue[] = new Array(chunkCues.length);
        const uncachedIndices: number[] = [];
        const uniqueTexts = new Set<string>();
        let cacheCharacters = 0;

        for (let i = 0; i < chunkCues.length; i++) {
          const cue = chunkCues[i];
          // Sub-project 6: context-aware subtitle cache key (profile + knobs +
          // glossary, namespaced from the web path) instead of the bare
          // SHA-256(src:tgt:text). Web path's getCachedTranslation is untouched.
          const subtitleKey = await generateSubtitleCacheKey(cue.text, sourceLanguage, targetLanguage, subtitleKnobs, buildGlossarySnapshot());
          const cached = await getCachedTranslationByKey(subtitleKey, subtitleSettings.cacheTTLDays);
          if (cached) {
            chunkResult[i] = {
              ...cue,
              text: cached,
              originalText: cue.text,
            };
            cacheCharacters += cue.text.length;
          } else {
            uncachedIndices.push(i);
            uniqueTexts.add(cue.text);
          }
        }

        if (uniqueTexts.size === 0) {
          // All cues served from cache — still record cache + cue stats.
          recordUsage({
            mode: 'subtitle',
            cacheHits: chunkCues.length,
            cacheMisses: 0,
            cacheCharacters,
            subtitleCues: chunkCues.length,
            host,
            sourceLanguage,
            targetLanguage,
            providerId,
          }).catch(() => {});
          return chunkResult;
        }

        if (uniqueTexts.size > 0) {
          const texts = new Map<string, string>();
          const idToOriginalText = new Map<string, string>();

          let counter = 1;
          // Prepend context cues (LLM translates them, but we ignore the result).
          // Voice prefix: [Speaker] is added when cue.voice is present so the
          // model understands dialogue flow. Cache is unaffected (ctx results
          // are never cached).
          for (const ctxCue of contextCues) {
            const ctxText = ctxCue.voice ? `[${ctxCue.voice}] ${ctxCue.text}` : ctxCue.text;
            texts.set(`ctx${counter++}`, ctxText);
          }

          counter = 1;
          for (const text of uniqueTexts) {
            const id = `s${counter++}`;
            // Find the voice for this unique text (first matching uncached cue).
            const voiceIdx = uncachedIndices.find(j => chunkCues[j].text === text);
            const cueWithVoice = voiceIdx !== undefined ? chunkCues[voiceIdx] : undefined;
            const prefixedText = cueWithVoice?.voice ? `[${cueWithVoice.voice}] ${text}` : text;
            texts.set(id, prefixedText);
            idToOriginalText.set(id, text);
          }

          // Sub-project 6: chunk-level retry with exponential backoff. The
          // wrapper normalizes service.translate's { success: false } into a
          // throw so withRetry's thrown-error model applies. NOTE: because the
          // service returns an error STRING (not a thrown ApiError), the 4xx
          // status code is not visible here — shouldRetry returns true for all
          // failures, so 4xx is retried twice. This is a deliberate trade-off
          // vs. broad service-layer churn; 4xx is rare and the cost is 2 wasted
          // calls. (Making the service re-throw ApiError on 4xx would enable
          // true fail-fast but touches every caller.)
          const runTranslate = async () => {
            const r = await service.translate({
              texts,
              sourceLanguage,
              targetLanguage,
              glossaryBlock: subtitleGlossary || undefined,
              // Subtitle path: subtitleKnobs routes to the subtitle prompt and
              // customSystemPrompt/pageContext are ignored by the service.
              subtitleKnobs,
              // Rolling proper-noun glossary for cross-chunk name consistency.
              rollingGlossaryBlock: formatRollingGlossary(rollingGlossary) || undefined,
            });
            if (!r.success) {
              throw new Error(r.error ?? 'Chunk translation failed');
            }
            return r;
          };

          const result = await withRetry(runTranslate, {
            maxRetries: 2,
            baseDelayMs: 500,
            shouldRetry: () => true, // 4xx status not visible; retry all failures
          });

          if (result.success) {
            const textToTranslation = new Map<string, string>();
            for (const [id, translatedText] of result.translations.entries()) {
              if (id.startsWith('ctx')) continue; // Ignore context

              const originalText = idToOriginalText.get(id);
              if (originalText) {
                textToTranslation.set(originalText, translatedText);
                // Partial-result guard: when the LLM omitted this ID, the service
                // back-fills it with the source text. Never cache that — it would
                // persist source-as-translation. (result.partial marks the chunk.)
                const isBackfilled = result.partial === true && translatedText === originalText;
                if (!isBackfilled) {
                  const writeKey = await generateSubtitleCacheKey(originalText, sourceLanguage, targetLanguage, subtitleKnobs, buildGlossarySnapshot());
                  await cacheTranslationByKey(writeKey, translatedText, sourceLanguage, targetLanguage);
                }
              }
            }

            for (const i of uncachedIndices) {
              const cue = chunkCues[i];
              const translatedText = textToTranslation.get(cue.text);
              if (translatedText) {
                chunkResult[i] = {
                  ...cue,
                  text: translatedText,
                  originalText: cue.text,
                };
              } else {
                chunkResult[i] = { ...cue };
              }
            }

            // Track subtitle API + cache + cue stats (fire-and-forget)
            const chunkChars = [...uniqueTexts].reduce((sum, t) => sum + t.length, 0);
            recordUsage({
              mode: 'subtitle',
              characters: chunkChars,
              apiCalls: 1,
              cacheHits: chunkCues.length - uncachedIndices.length,
              cacheMisses: uncachedIndices.length,
              cacheCharacters,
              subtitleCues: chunkCues.length,
              host,
              sourceLanguage,
              targetLanguage,
              providerId,
            }).catch(() => {});

            // Merge extracted proper nouns into the rolling glossary so the
            // next chunk's prompt carries forward name consistency.
            if (result.properNouns) {
              mergeProperNouns(rollingGlossary, result.properNouns);
            }
          } else {
            throw new Error(result.error ?? 'Chunk translation failed');
          }
        }
        return chunkResult;
      } finally {
        releaseSemaphore();
      }
    };

    // Process first chunk synchronously to return immediately
    const firstChunkCues = cues.slice(0, CHUNK_SIZE);
    try {
      // Seed chunk 0 with look-ahead context (cues right AFTER the first chunk)
      // instead of empty context. The model already ignores ctx* translations
      // (see the `id.startsWith('ctx')` skip below), so this reuses the existing
      // context machinery — it just feeds forward cues for the opening chunk,
      // which otherwise translates context-blind.
      const firstChunkLookahead = cues.slice(CHUNK_SIZE, CHUNK_SIZE + CONTEXT_SIZE);
      const firstChunkResult = await translateChunk(firstChunkCues, firstChunkLookahead);
      for (let j = 0; j < firstChunkResult.length; j++) {
         translatedCues[j] = firstChunkResult[j];
      }
    } catch (error) {
      console.warn("AnyLLMTranslate: First chunk translation failed", error);
      // Return error so it falls back or fails gracefully
      throw error;
    }

    // Process remaining chunks asynchronously using a priority queue
    if (cues.length > CHUNK_SIZE && tabId) {
      const queue: number[] = [];
      for (let i = CHUNK_SIZE; i < cues.length; i += CHUNK_SIZE) {
        queue.push(i);
      }

      const session: TranslationSession = {
        queue,
        setPriority: (cueIndex: number, chunkSize: number) => {
          const chunkStart = Math.floor(cueIndex / chunkSize) * chunkSize;
          const idx = queue.indexOf(chunkStart);
          if (idx !== -1) {
            queue.splice(idx, 1);
            queue.unshift(chunkStart);
          }
        },
        sessionId,
      };

      activeSessions.set(tabId, session);
      ensureKeepaliveAlarm();

      (async () => {
         while (session.queue.length > 0) {
            const i = session.queue.shift();
            if (i === undefined) break;
            const chunkCues = cues.slice(i, i + CHUNK_SIZE);
            // Bidirectional context: preceding cues + following cues.
            const precedingCues = cues.slice(Math.max(0, i - CONTEXT_SIZE), i);
            const followingCues = cues.slice(i + CHUNK_SIZE, i + CHUNK_SIZE + CONTEXT_SIZE);
            const contextCues = [...precedingCues, ...followingCues];
            
            try {
               const chunkResult = await translateChunk(chunkCues, contextCues);
               if (chunkResult.length > 0) {
                 // Merge chunk into the full translatedCues array exactly at the right offset
                 for (let j = 0; j < chunkResult.length; j++) {
                    translatedCues[i + j] = chunkResult[j];
                 }
                 // Send ONLY the translated chunk delta (not the full array)
                 // to reduce message size from O(n) to O(chunk_size)
                 chrome.tabs.sendMessage(tabId, {
                    action: 'SUBTITLE_CHUNK_TRANSLATED',
                    chunkStart: i,
                    chunkCues: chunkResult,
                    sessionId: session.sessionId,
                 });
                 // subtitleCues counted inside translateChunk via recordUsage
               }
            } catch (error) {
               console.warn("AnyLLMTranslate: Background chunk translation failed", error);
               // Sub-project 6: surface the failure so the user knows a section
               // wasn't translated (instead of silently swallowing). Best-effort
               // — tab/SW may be gone.
               try {
                 chrome.tabs.sendMessage(tabId, {
                   action: 'SUBTITLE_CHUNK_FAILED',
                   chunkStart: i,
                   sessionId: session.sessionId,
                 });
               } catch { /* tab gone — nothing to do */ }
            }
         }
         activeSessions.delete(tabId);
         clearKeepaliveAlarm();
      })();
    }

    // subtitleCues for the first chunk are recorded inside translateChunk.
    // Background chunks also record per successful translateChunk (avoids
    // overcounting cues that fail in later chunks).

    return { success: true, cues: translatedCues, sessionId };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Subtitle translation failed';
    return { success: false, error: errorMsg };
  }
}

/** Allowed subtitle domains for CORS bypass (hostname suffix matching) */
const SUBTITLE_ALLOWLIST = [
  /(?:^|\.)youtube\.com$/,
  /(?:^|\.)googlevideo\.com$/,
  /(?:^|\.)youtu\.be$/,
  /(?:^|\.)udemycdn\.com$/,
  /(?:^|\.)udemy\.com$/,
  /(?:^|\.)coursera\.org$/,
  /(?:^|\.)coursera-user-content\.net$/,
  /(?:^|\.)cloudfront\.net$/,
  /(?:^|\.)akamaized\.net$/,
  /(?:^|\.)linkedin\.com$/,
  /(?:^|\.)licdn\.com$/,
  /(?:^|\.)max\.com$/,
  /(?:^|\.)hbomax\.com$/,
  /(?:^|\.)hbo\.com$/,
  /(?:^|\.)delivery\.mp\.microsoft\.com$/,
  /(?:^|\.)media\.max\.com$/,
  /(?:^|\.)prd\.media\.max\.com$/,
  /(?:^|\.)youku\.com$/,
  /(?:^|\.)youku\.tv$/,
  /(?:^|\.)ykimg\.com$/,
  /(?:^|\.)iflix\.com$/,
  /(?:^|\.)wetv\.vip$/,
];

function isAllowedSubtitleUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Block non-HTTP(S) protocols
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return false;
    }
    // Block private/loopback/link-local hosts
    const host = parsed.hostname;
    if (isPrivateHost(host)) {
      return false;
    }
    // Match against allowlist using hostname suffix matching
    return SUBTITLE_ALLOWLIST.some((pattern) => pattern.test(host));
  } catch {
    return false; // Invalid URL
  }
}

/**
 * Returns true if `host` is a private/loopback/link-local address (IPv4 or IPv6,
 * bare or bracketed). Used to mitigate SSRF via the subtitle CORS-bypass fetch.
 *
 * Covers: localhost, 127/8, 10/8, 172.16/12 (NOT all of 172/8 — public 172.x
 * addresses must stay reachable), 192.168/16, 169.254/16, 0.0.0.0, IPv6 loopback
 * ::1, IPv6 ULA fc00::/7, and IPv6 link-local fe80::/10.
 */
function isPrivateHost(host: string): boolean {
  // Strip IPv6 brackets for consistent matching.
  const h = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;

  if (h === 'localhost' || h === '0.0.0.0' || h === '::') return true;

  // IPv6 textual forms (normalize to lowercase, strip zone-id after %).
  const v6 = h.split('%')[0].toLowerCase();
  if (v6 === '::1') return true;
  if (v6.startsWith('fc') || v6.startsWith('fd')) return true; // ULA fc00::/7
  if (v6.startsWith('fe80') || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb')) {
    return true; // link-local fe80::/10
  }

  // IPv4 dotted-quad checks. Guard against non-numeric hosts (domains) early.
  const parts = h.split('.');
  if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
    const [a, b] = parts.map(Number) as [number, number, number, number];
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 10) return true; // 10.0.0.0/8 private
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a === 0) return true; // 0.0.0.0/8 "this network"
  }

  return false;
}

/** Handle fetchSubtitle message (CORS bypass for subtitle fetch) */
async function handleFetchSubtitle(
  message: FetchSubtitleMessage,
): Promise<{ success: boolean; content?: string; contentType?: string; error?: string }> {
  if (!isAllowedSubtitleUrl(message.url)) {
    return { success: false, error: 'URL not in subtitle allow-list' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(message.url, {
      signal: controller.signal,
      headers: { Accept: 'text/vtt,application/ttml+xml,text/plain,*/*;q=0.8' },
    });
    clearTimeout(timer);
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }
    const content = await response.text();
    const contentType = response.headers.get('Content-Type') ?? '';
    // Max CDN VTT segment URLs often return a nested DASH MPD; the MPD processor
    // follows that chain in MAIN world — do not reject here or nested parsing never runs.
    if (
      isManifestResponse(content, contentType) &&
      !isMaxCdnVttSegmentUrl(message.url)
    ) {
      return { success: false, error: 'response is a DASH manifest, not subtitle content' };
    }
    return { success: true, content, contentType };
  } catch (error) {
    clearTimeout(timer);
    if (error instanceof Error && error.name === 'AbortError') {
      return { success: false, error: 'Subtitle fetch timed out after 30s' };
    }
    const errorMsg = error instanceof Error ? error.message : 'Failed to fetch subtitle';
    return { success: false, error: errorMsg };
  }
}

/** Handle FETCH_MANIFEST_SUBTITLES — fetch a subtitle playlist + segments, assemble into cues */
async function handleFetchManifestSubtitles(
  message: { playlistUrl: string; preferredLanguage?: string },
): Promise<{ success: boolean; cues?: SubtitleCue[]; error?: string; language?: string }> {
  if (!isAllowedSubtitleUrl(message.playlistUrl)) {
    return { success: false, error: 'URL not in subtitle allow-list' };
  }

  try {
    const lowerUrl = message.playlistUrl.toLowerCase().split('?')[0];
    const isHls = lowerUrl.endsWith('.m3u8');
    const isDash = lowerUrl.endsWith('.mpd') || detectMpdRequests(message.playlistUrl);

    if (isHls) {
      // Fetch the subtitle media playlist
      const playlistResponse = await fetchWithTimeout(message.playlistUrl);
      if (!playlistResponse.ok) {
        return { success: false, error: `HTTP ${playlistResponse.status}` };
      }
      const playlistBody = await playlistResponse.text();

      // Check if it's a multivariant playlist (contains EXT-X-MEDIA SUBTITLES)
      // or a media playlist (contains EXTINF segments)
      if (playlistBody.includes('#EXT-X-MEDIA:') && playlistBody.includes('TYPE=SUBTITLES')) {
        // Multivariant — extract subtitle playlist URLs, pick the first/default
        const tracks = parseHlsManifest(playlistBody, message.playlistUrl);
        if (tracks.length === 0) {
          return { success: false, error: 'No subtitle tracks in manifest' };
        }
        // Use the default track or the first one
        const track = tracks.find((t) => t.isDefault) ?? tracks[0];
        // Recursively fetch the subtitle playlist
        return handleFetchManifestSubtitles({ playlistUrl: track.url });
      }

      // Media playlist — extract segment URLs
      const segments = parseHlsSubtitlePlaylist(playlistBody, message.playlistUrl);
      if (segments.length === 0) {
        return { success: false, error: 'No segments in subtitle playlist' };
      }

      // Fetch all segments
      const segmentBodies: string[] = [];
      for (const seg of segments) {
        if (!isAllowedSubtitleUrl(seg.url)) {
          return { success: false, error: 'Segment URL not in allow-list' };
        }
        const segResponse = await fetchWithTimeout(seg.url);
        if (!segResponse.ok) {
          return { success: false, error: `Segment fetch failed: HTTP ${segResponse.status}` };
        }
        segmentBodies.push(await segResponse.text());
      }

      // Concatenate + parse
      const combined = concatVttSegments(segmentBodies);
      const cues = parseWebVTT(combined);
      return { success: true, cues };
    }

    if (isDash) {
      // DASH manifest — parse for subtitle track URLs
      const manifestResponse = await fetchWithTimeout(message.playlistUrl);
      if (!manifestResponse.ok) {
        return { success: false, error: `HTTP ${manifestResponse.status}` };
      }
      const manifestBody = await manifestResponse.text();
      const tracks = parseDashManifest(manifestBody, message.playlistUrl);
      if (tracks.length === 0) {
        return { success: false, error: 'No subtitle tracks in DASH manifest' };
      }

      const preferredLanguage = message.preferredLanguage;
      const track = preferredLanguage
        ? tracks.find((t) => subtitleLanguagesMatch(t.language, preferredLanguage)) ?? tracks[0]
        : tracks[0];
      if (!isAllowedSubtitleUrl(track.url)) {
        return { success: false, error: 'Track URL not in allow-list' };
      }

      if (track.segmentUrls && track.segmentUrls.length > 1) {
        const segmentResult = await fetchDashSegmentBodies(track.segmentUrls);
        if (!segmentResult.success) {
          return { success: false, error: segmentResult.error };
        }
        const combined = concatVttSegments(segmentResult.bodies);
        const cues = parseSubtitleContent(combined, 'text/vtt', track.segmentUrls[0]);
        return { success: true, cues, language: track.language };
      }

      if (track.segmentFetch) {
        const segmentResult = await fetchProgressiveDashSegments(track.segmentFetch);
        if (!segmentResult.success) {
          return { success: false, error: segmentResult.error };
        }
        const body = segmentResult.bodies.length > 1
          ? concatVttSegments(segmentResult.bodies)
          : segmentResult.bodies[0];
        const cues = parseSubtitleContent(body, 'text/vtt', track.url);
        return { success: true, cues, language: track.language };
      }

      const trackResponse = await fetchWithTimeout(track.url);
      if (!trackResponse.ok) {
        return { success: false, error: `HTTP ${trackResponse.status}` };
      }
      const trackBody = await trackResponse.text();
      const contentType = trackResponse.headers.get('Content-Type') ?? '';
      const cues = parseSubtitleContent(trackBody, contentType, track.url);
      return { success: true, cues, language: track.language };
    }

    // Direct VTT/SRT/TTML file
    const response = await fetchWithTimeout(message.playlistUrl);
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }
    const body = await response.text();
    const contentType = response.headers.get('Content-Type') ?? '';
    const cues = parseSubtitleContent(body, contentType, message.playlistUrl);
    return { success: true, cues };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Failed to fetch manifest subtitles';
    return { success: false, error: errorMsg };
  }
}

async function fetchDashSegmentBodies(
  urls: string[],
): Promise<{ success: true; bodies: string[] } | { success: false; error: string }> {
  const bodies: string[] = [];
  for (const url of urls) {
    if (!isAllowedSubtitleUrl(url)) {
      return { success: false, error: 'Segment URL not in allow-list' };
    }
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      return { success: false, error: `Segment fetch failed: HTTP ${response.status}` };
    }
    bodies.push(await response.text());
  }
  return { success: true, bodies };
}

async function fetchProgressiveDashSegments(
  template: NonNullable<ReturnType<typeof parseDashManifest>[number]['segmentFetch']>,
): Promise<{ success: true; bodies: string[] } | { success: false; error: string }> {
  const bodies: string[] = [];
  for (
    let number = template.startNumber;
    number < template.startNumber + MAX_PROGRESSIVE_DASH_SEGMENTS;
    number++
  ) {
    const url = resolveSegmentFetchUrl(template, number);
    if (!url) break;
    if (!isAllowedSubtitleUrl(url)) {
      return { success: false, error: 'Segment URL not in allow-list' };
    }
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      if (bodies.length > 0 && (response.status === 404 || response.status === 410)) {
        break;
      }
      return { success: false, error: `Segment fetch failed: HTTP ${response.status}` };
    }
    const body = await response.text();
    const contentType = response.headers.get('Content-Type') ?? '';
    if (isManifestResponse(body, contentType)) {
      if (bodies.length > 0) break;
      return { success: false, error: 'Segment response is a DASH manifest, not subtitle content' };
    }
    bodies.push(body);
  }
  if (bodies.length === 0) {
    return { success: false, error: 'No DASH subtitle segments fetched' };
  }
  return { success: true, bodies };
}

/** Fetch with 30s timeout (reused by manifest handler) */
async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return response;
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
}

/** Serialize dictionary result for cache storage (string payload). */
function serializeDictionaryCache(raw: string, parsed: SelectionDictionaryResult | null): string {
  if (parsed && hasDictionaryFields(parsed)) {
    return JSON.stringify({
      phonetic: parsed.phonetic,
      definitions: parsed.definitions,
      translation: parsed.translation,
      contextual_analysis: parsed.contextualAnalysis,
      _raw: raw,
    });
  }
  return raw;
}

/** Deserialize a dictionary cache entry into a selection result. */
function deserializeDictionaryCache(cached: string): TranslateSelectionResult {
  const parsed = parseSelectionDictionary(cached);
  const translatedText = extractTranslationFallback(cached, parsed);
  if (hasDictionaryFields(parsed)) {
    return {
      success: true,
      translatedText,
      mode: 'dictionary',
      dictionary: {
        phonetic: parsed?.phonetic,
        definitions: parsed?.definitions,
        translation: parsed?.translation,
        contextualAnalysis: parsed?.contextualAnalysis,
      },
    };
  }
  return { success: true, translatedText, mode: 'sentence' };
}

/** Handle translateSelection message — translate a single text string.
 *  Dictionary mode is opt-in via message.dictionaryMode + settings flag. */
async function handleTranslateSelection(
  message: TranslateSelectionMessage,
  sender?: chrome.runtime.MessageSender,
): Promise<TranslateSelectionResult> {
  try {
    const selectionSettings = await loadSettings();
    const host = hostFromSender(sender);
    const providerId = bestEffortProviderId(selectionSettings);
    const useDictionary =
      message.dictionaryMode === true &&
      selectionSettings.selectionDictionaryEnabled !== false;

    // --- Dictionary word-mode path (opt-in only) ---
    if (useDictionary) {
      const dictKey = await generateSelectionDictionaryCacheKey(
        message.text,
        message.sourceLanguage,
        message.targetLanguage,
      );
      const cachedDict = await getCachedTranslationByKey(
        dictKey,
        selectionSettings.cacheTTLDays,
      );
      if (cachedDict !== null) {
        return deserializeDictionaryCache(cachedDict);
      }

      const service = await initService();
      const fromLabel =
        message.sourceLanguage === 'auto'
          ? 'auto'
          : getLanguageName(message.sourceLanguage);
      const toLabel = getLanguageName(message.targetLanguage);
      const systemPrompt = buildSelectionDictionarySystemPrompt({
        from: fromLabel,
        to: toLabel,
        text: message.text,
        contextText: message.contextText ?? '',
      });
      const userPrompt = buildSelectionDictionaryUserPrompt({ text: message.text });
      // Dictionary path omits glossary injection to avoid prompt noise (FR-5.3).
      const texts = new Map<string, string>();
      texts.set('selection', message.text);

      const result = await service.translate({
        texts,
        sourceLanguage: message.sourceLanguage,
        targetLanguage: message.targetLanguage,
        preScanSystemPrompt: systemPrompt,
        customUserPrompt: userPrompt,
        returnRawResponse: true,
      });

      if (!result.success) {
        return { success: false, error: result.error ?? 'Translation failed' };
      }

      const raw = result.translations.get('selection') ?? '';
      const parsed = parseSelectionDictionary(raw);
      const translatedText = extractTranslationFallback(raw, parsed);

      // Cache the structured (or fail-open) payload under the dict: key.
      await cacheTranslationByKey(
        dictKey,
        serializeDictionaryCache(raw, parsed),
        message.sourceLanguage,
        message.targetLanguage,
      );

      recordUsage({
        mode: 'selection',
        characters: message.text.length,
        apiCalls: 1,
        host,
        sourceLanguage: message.sourceLanguage,
        targetLanguage: message.targetLanguage,
        providerId,
      }).catch(() => {});

      if (hasDictionaryFields(parsed)) {
        return {
          success: true,
          translatedText,
          mode: 'dictionary',
          dictionary: {
            phonetic: parsed?.phonetic,
            definitions: parsed?.definitions,
            translation: parsed?.translation,
            contextualAnalysis: parsed?.contextualAnalysis,
          },
        };
      }

      // Fail-open: invalid/partial JSON still shows a usable string (NFR-1).
      return { success: true, translatedText, mode: 'sentence' };
    }

    // --- Plain sentence path (default; hover/inline/dictionary-off) ---
    const cached = await getCachedTranslation(
      message.text,
      message.sourceLanguage,
      message.targetLanguage,
      selectionSettings.cacheTTLDays,
    );
    if (cached !== null) {
      return { success: true, translatedText: cached, mode: 'sentence' };
    }

    const service = await initService();
    const selectionGlossary = formatGlossary(selectionSettings.glossary ?? []);
    const texts = new Map<string, string>();
    texts.set('selection', message.text);

    const result = await service.translate({
      texts,
      sourceLanguage: message.sourceLanguage,
      targetLanguage: message.targetLanguage,
      glossaryBlock: selectionGlossary || undefined,
      customSystemPrompt: selectionSettings.customSystemPrompt ?? null,
    });

    if (result.success) {
      const translated = result.translations.get('selection') ?? '';

      await cacheTranslation(
        message.text,
        translated,
        message.sourceLanguage,
        message.targetLanguage,
      );

      recordUsage({
        mode: 'selection',
        characters: message.text.length,
        apiCalls: 1,
        host,
        sourceLanguage: message.sourceLanguage,
        targetLanguage: message.targetLanguage,
        providerId,
      }).catch(() => {});

      return { success: true, translatedText: translated, mode: 'sentence' };
    } else {
      return { success: false, error: result.error ?? 'Translation failed' };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Selection translation failed';
    return { success: false, error: errorMsg };
  }
}

/** Handle DETECT_PAGE_CATEGORY_LLM message */
async function handleDetectPageCategoryLLM(
  message: DetectPageCategoryLlmMessage,
): Promise<{ success: boolean; category?: string; error?: string }> {
  try {
    const service = await initService();
    if (!service.detectPageCategory) {
       return { success: false, error: 'Provider does not support category detection' };
    }
    return await service.detectPageCategory(message.pageContext);
  } catch (error) {
     return { success: false, error: String(error) };
  }
}

/** Handle CLASSIFY_PDF_PARAGRAPHS message */
async function handleClassifyPdfParagraphs(
  message: ClassifyPdfParagraphsMessage,
): Promise<ClassifyPdfParagraphsResult> {
  try {
    const service = await initService();
    if (!service.classifyPdfParagraphs) {
      return { success: false, error: 'Provider does not support paragraph classification' };
    }
    return await service.classifyPdfParagraphs(message.paragraphs);
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/** Handle RESEGMENT_YOUTUBE_ASR — AI/BYOK sentence re-alignment before translate. */
async function handleResegmentYoutubeAsr(
  message: ResegmentYoutubeAsrMessage,
): Promise<ResegmentYoutubeAsrResult> {
  try {
    const service = await initService();
    if (!service.resegmentYoutubeAsr) {
      return { success: false, error: 'Provider does not support YouTube ASR resegment' };
    }
    return await service.resegmentYoutubeAsr(message.units, message.language);
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/** Update extension badge based on status */
function handleStatusUpdate(
  message: { status: { status: string } },
  tabId?: number
): void {
  if (!tabId) return;
  const state = message.status.status;
  
  try {
    if (state === 'done') {
      chrome.action.setBadgeText({ text: '✓', tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#10B981', tabId });
    } else if (state === 'translating') {
      chrome.action.setBadgeText({ text: '...', tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#3B82F6', tabId });
    } else if (state === 'error') {
      chrome.action.setBadgeText({ text: '!', tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#EF4444', tabId });
    } else {
      chrome.action.setBadgeText({ text: '', tabId });
    }
  } catch {
    // Ignore badge setting errors (e.g., if tab is no longer available)
  }
}

/** Storage key for the set of (tabId::url) keys already auto-opened this session. */
const PDF_AUTOOPEN_SESSION_KEY = 'pdf-autoopen-opened';

/** Open the bundled PDF viewer for a URL. Shared by popup, context menu,
 *  and auto-trigger so URL validation lives in one place.
 *  Returns the viewer URL that was navigated to (for logging/tests). */
export function openPdfViewer(
  url: string,
  mode: 'new-tab' | 'same-tab' = 'new-tab',
  sourceTabId?: number,
): string {
  const viewerUrl = chrome.runtime.getURL(`pdf-viewer.html?file=${encodeURIComponent(url)}`);
  if (mode === 'same-tab' && sourceTabId !== undefined) {
    chrome.tabs.update(sourceTabId, { url: viewerUrl });
  } else {
    chrome.tabs.create({ url: viewerUrl });
  }
  return viewerUrl;
}

/** Read the set of already-auto-opened session keys from storage.session. */
async function readOpenedKeys(): Promise<Set<string>> {
  try {
    const result = await chrome.storage.session.get(PDF_AUTOOPEN_SESSION_KEY);
    const arr = (result[PDF_AUTOOPEN_SESSION_KEY] as string[] | undefined) ?? [];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

/** Persist an updated set of opened keys. */
async function writeOpenedKeys(keys: Set<string>): Promise<void> {
  try {
    await chrome.storage.session.set({ [PDF_AUTOOPEN_SESSION_KEY]: Array.from(keys) });
  } catch {
    // storage.session unavailable (older browser) — best-effort, dedupe degrades
    // to per-SW-instance.
  }
}

/** Handle a PDF_DETECTED message: decide + open + dedupe. */
async function handlePdfDetected(
  message: PdfDetectedMessage,
  sender: chrome.runtime.MessageSender,
): Promise<{ opened: boolean }> {
  const tabId = message.tabId ?? sender.tab?.id;
  if (tabId === undefined) return { opened: false };
  const settings = await loadSettings();
  const viewerOrigin = chrome.runtime.getURL('');
  const sessionKey = buildSessionKey(tabId, message.url);
  const openedKeys = await readOpenedKeys();
  const decision = shouldAutoOpenPdf({
    url: message.url,
    viewerOrigin,
    settings,
    sessionKey,
    openedSessionKeys: openedKeys,
  });
  if (!decision.open) return { opened: false };
  openedKeys.add(sessionKey);
  await writeOpenedKeys(openedKeys);
  openPdfViewer(message.url, settings.pdfSettings?.openMode ?? 'new-tab', tabId);
  return { opened: true };
}

export function handleMessage(
  message: ExtensionMessage,
  _sender: chrome.runtime.MessageSender,
): Promise<unknown> | undefined {
  switch (message.action) {
    case 'translate':
      return handleTranslate(message, _sender);
    case 'testConnection':
      return handleTestConnection();
    case 'updateSettings':
      return initService().then(() => ({ success: true })).catch(() => ({ success: false, error: 'Failed to update settings' }));
    case 'translateSubtitle':
      return handleTranslateSubtitle(message, _sender);
    case 'FETCH_SUBTITLE':
      return handleFetchSubtitle(message);
    case 'FETCH_MANIFEST_SUBTITLES':
      return handleFetchManifestSubtitles(message);
    case 'translateSelection':
      return handleTranslateSelection(message, _sender);
    case 'restore': {
      // Clear page translation session tracking and stop any active subtitle
      // session for this tab so progressive chunk work and the keep-alive alarm
      // do not outlive the restore.
      const restoreTabId = message.tabId ?? _sender.tab?.id;
      if (restoreTabId) {
        translatedTabSessions.delete(restoreTabId);
        stopSubtitleSession(restoreTabId);
      }
      return undefined;
    }
    case 'CANCEL_SUBTITLE_SESSION': {
      const cancelTabId = message.tabId ?? _sender.tab?.id;
      if (cancelTabId) stopSubtitleSession(cancelTabId);
      return undefined;
    }
    case 'statusUpdate':
      handleStatusUpdate(message, _sender.tab?.id);
      return undefined;
    case 'FLUSH_LRU': {
      // No-op: content script sends this on beforeunload to keep SW alive briefly
      return undefined;
    }
    case 'PRIORITIZE_SUBTITLE_CHUNK': {
      const tabId = _sender.tab?.id;
      if (tabId) {
        const session = activeSessions.get(tabId);
        if (session) {
          session.setPriority(message.cueIndex, CHUNK_SIZE);
        }
      }
      return undefined;
    }
    case 'setCategoryOverride': {
      const tabId = message.tabId ?? _sender.tab?.id;
      if (!tabId) return Promise.resolve({ success: false });
      storeCategoryOverride(tabId, message.category);
      // Forward categoryChanged to the content tab so it updates immediately
      chrome.tabs.sendMessage(tabId, {
        action: 'categoryChanged',
        category: message.category,
      }).catch(() => {});
      return Promise.resolve({ success: true });
    }
    case 'getCategoryOverride': {
      const tabId = message.tabId ?? _sender.tab?.id;
      if (!tabId) return Promise.resolve({ override: undefined });
      const override = fetchCategoryOverride(tabId);
      return Promise.resolve({ override });
    }
    case 'DETECT_PAGE_CATEGORY_LLM':
      return handleDetectPageCategoryLLM(message);
    case 'CLASSIFY_PDF_PARAGRAPHS':
      return handleClassifyPdfParagraphs(message);
    case 'RESEGMENT_YOUTUBE_ASR':
      return handleResegmentYoutubeAsr(message);
    case 'CLEAR_CACHE':
      return clearCache().then(() => ({ success: true })).catch(() => ({ success: false }));
    case 'OPEN_PDF_VIEWER': {
      // Validate the URL before forwarding to the viewer.
      const url = (message as { url: string }).url;
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && parsed.protocol !== 'file:') {
          return Promise.resolve({ success: false, error: 'Unsupported protocol' });
        }
        // P2 security: file:// is only allowed from trusted extension senders
        // (popup/options — which have no sender.tab). Content scripts run on
        // untrusted host pages and must not be able to open arbitrary local
        // files (would let a malicious page enumerate the user's filesystem).
        if (parsed.protocol === 'file:' && _sender?.tab?.id !== undefined) {
          return Promise.resolve({ success: false, error: 'file:// not allowed from content scripts' });
        }
      } catch {
        return Promise.resolve({ success: false, error: 'Invalid URL' });
      }
      openPdfViewer(url);
      return Promise.resolve({ success: true });
    }
    case 'PDF_DETECTED':
      return handlePdfDetected(message as PdfDetectedMessage, _sender).then(() => ({ success: true }));
    case 'REGISTER_PDF_SESSION': {
      const tabId = _sender.tab?.id;
      if (tabId !== undefined) registerPdfSession(tabId);
      return Promise.resolve({ success: true });
    }
    case 'UNREGISTER_PDF_SESSION': {
      const tabId = _sender.tab?.id;
      if (tabId !== undefined) unregisterPdfSession(tabId);
      return Promise.resolve({ success: true });
    }
    default:
      return undefined;
  }
}

/** Initialize settings change listener */
export function initSettingsListener(): () => void {
  return onSettingsChange(() => {
    // FR-6: invalidate the decrypted-settings cache so the next initService
    // re-reads + re-decrypts (the AES-GCM loop is skipped on the hot path only
    // when settings are unchanged). The pool signature is also recomputed
    // inside initService, triggering a rebuild only if pool config changed.
    cachedDecryptedSettings = null;
    initService();
    // Invalidate debug log cache so subsequent LLM calls observe the new
    // debugMode value without waiting for the 5s TTL to expire.
    invalidateDebugCache();
  });
}

/**
 * FR-3: Run eviction once and schedule daily repeating alarm.
 * Called on service worker startup (fire-and-forget, non-blocking).
 */
export async function scheduleEviction(): Promise<void> {
  // Run immediately on startup with user-configured limits
  loadSettings()
    .then((s) => evictCache(s.maxCacheSizeMB, s.cacheTTLDays))
    .catch(() => {
      // Silently fail — eviction is best-effort
    });

  // Schedule daily eviction via chrome.alarms (persists across SW restarts)
  chrome.alarms.create('cache-evict', { periodInMinutes: 1440 });
}

/**
 * FR-3: Register the alarm listener that fires evictCache on schedule.
 * Must be called at SW startup before any alarm can fire.
 */
export function initEvictionSchedule(): void {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'cache-evict') {
      loadSettings()
        .then((s) => evictCache(s.maxCacheSizeMB, s.cacheTTLDays))
        .catch(() => {
          // Silently fail — eviction is best-effort
        });
    }
  });
}

/** Get current subtitle session counter value. Exported for tests. */
function __getSubtitleSessionCounterForTest(): number {
  return subtitleSessionCounter;
}

/** Reset subtitle session counter to 0 and clear all active sessions. Exported for tests. */
function __resetSubtitleSessionCounterForTest(): void {
  subtitleSessionCounter = 0;
  for (const session of activeSessions.values()) {
    session.queue.length = 0;
  }
  activeSessions.clear();
}

/**
 * Reset the cached translation service (provider pool coordinator) for tests.
 *
 * The pool coordinator is a module-level singleton that preserves circuit-
 * breaker cooldowns + rate-limiter windows across `initService()` calls (so a
 * live settings change hot-swaps config without losing state). That persistence
 * leaks across test cases: a 429/5xx in one test opens a key's breaker, and the
 * next test reuses the same coordinator with that key still cooling. Reset here
 * between tests. Mirrors the `__resetSemaphoreForTest` pattern.
 */
function __resetTranslationServiceForTest(): void {
  translationService = null;
}

/** Export for testing */
export {
  initService,
  acquireSemaphore,
  releaseSemaphore,
  acquirePdfSemaphore,
  releasePdfSemaphore,
  __resetSemaphoreForTest,
  __getSemaphoreStateForTest,
  __getPdfSemaphoreStateForTest,
  __seedSubtitleSessionForTest,
  __getActiveSessionCountForTest,
  __getSubtitleSessionCounterForTest,
  __resetSubtitleSessionCounterForTest,
  __resetTranslationServiceForTest,
  __resetSettingsCacheForTest,
  __resetPdfSessionsForTest,
  __getPdfSessionCountForTest,
  __isKeepaliveArmedForTest,
  MAX_CONCURRENT,
  PDF_MAX_CONCURRENT,
};
