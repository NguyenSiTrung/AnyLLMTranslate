/**
 * Background service worker — central message router and translation coordinator.
 * Handles all communication between popup, content scripts, and translation service.
 */

import type {
  ExtensionMessage,
  TranslationResultMessage,
  TranslateSubtitleMessage,
  TranslateSelectionMessage,
  FetchSubtitleMessage,
  DetectPageCategoryLlmMessage,
  ClassifyPdfParagraphsMessage,
  ClassifyPdfParagraphsResult,
  PdfDetectedMessage,
} from '@/types/messages';
import type { SubtitleCue } from '@/types/subtitle';
import { loadSettings, onSettingsChange } from '@/lib/config';
import { setCategoryOverride as storeCategoryOverride, getCategoryOverride as fetchCategoryOverride, initTabCleanup as initCategoryTabCleanup } from '@/services/categoryStore';
import { OpenAICompatibleService } from '@/services/openaiCompatible';
import type { TranslationService } from '@/services/base';
import { validateProviderConfig } from '@/services/base';
import { getCachedTranslation, cacheTranslation, evictCache, clearCache } from '@/services/cacheManager';
import { formatGlossary } from '@/lib/glossary';
import { resolveEffectiveKnobs, type SubtitleProfile, type ProfileKnobs } from '@/lib/subtitleProfiles';
import { mergeProperNouns, formatRollingGlossary } from '@/lib/subtitleGlossary';
import { contentHash } from '@/lib/subtitleFilmGlossary';
import { loadFilmGlossary, saveFilmGlossary } from '@/services/filmGlossaryStore';
import { preScanNames } from '@/services/subtitleNameScanner';
import { incrementStats, recordDailyStats } from '@/services/statsCollector';
import { invalidateDebugCache } from '@/services/debugLog';
import type { ProviderConfig } from '@/types/config';
import { shouldAutoOpenPdf, buildSessionKey } from '@/services/pdfAutoOpen';

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

/** Clear keep-alive alarm when no sessions remain */
function clearKeepaliveAlarm(): void {
  if (activeSessions.size === 0 && keepaliveAlarmActive) {
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
  });
}

// Alarm listener — existence of alarm keeps SW alive
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM) {
    // No-op: alarm firing keeps service worker alive
  }
});

 

/** Track which tabs have been counted for page translation stats */
const translatedTabSessions = new Set<number>();

/** Active translation service instance */
let translationService: (TranslationService & { updateConfig(config: ProviderConfig): void }) | null = null;

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

/** Chunk size for progressive subtitle translation (cues per LLM call). */
const CHUNK_SIZE = 25;

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

/** Track current preset to detect when service type must change */
let activePreset: string | null = null;

/** Initialize or re-create translation service from settings */
async function initService(): Promise<TranslationService & { updateConfig(config: ProviderConfig): void }> {
  const settings = await loadSettings();
  const config = settings.provider;

  // Re-create if preset changed
  if (translationService && activePreset === config.preset) {
    translationService.updateConfig(config);
  } else {
    translationService = new OpenAICompatibleService(config);
    activePreset = config.preset;
  }

  return translationService;
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
    // Track page translation (once per tab session)
    const tabId = sender?.tab?.id;
    if (tabId && !translatedTabSessions.has(tabId)) {
      translatedTabSessions.add(tabId);
      incrementStats({ totalPagesTranslated: 1 }).catch(() => {});
    }

    const settings = await loadSettings();
    const glossaryBlock = formatGlossary(settings.glossary ?? []);

    // FR-1: Split pieces into cached and uncached
    const cachedResults: Array<{ id: string; translatedText: string }> = [];
    const uncachedPieces: Array<{ id: string; text: string }> = [];

    for (const piece of message.pieces) {
      const cached = await getCachedTranslation(
        piece.text,
        message.sourceLanguage,
        message.targetLanguage,
        settings.cacheTTLDays,
      );
      if (cached !== null) {
        cachedResults.push({ id: piece.id, translatedText: cached });
      } else {
        uncachedPieces.push(piece);
      }
    }

    // Track cache hit/miss stats (fire-and-forget)
    if (cachedResults.length > 0 || uncachedPieces.length > 0) {
      incrementStats({
        totalCacheHits: cachedResults.length,
        totalCacheMisses: uncachedPieces.length,
      }).catch(() => {});
    }

    // If all pieces were cached, return immediately — no LLM call
    if (uncachedPieces.length === 0) {
      return { success: true, results: cachedResults };
    }

    ensureKeepaliveAlarm();

    // Translate only uncached pieces
    const service = await initService();
    const texts = new Map<string, string>();
    for (const piece of uncachedPieces) {
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

    if (result.success) {
      const freshResults: Array<{ id: string; translatedText: string }> = [];

      for (const [id, translatedText] of result.translations.entries()) {
        freshResults.push({ id, translatedText });

        // Write each fresh translation back to cache
        const piece = uncachedPieces.find((p) => p.id === id);
        if (piece) {
          await cacheTranslation(
            piece.text,
            translatedText,
            message.sourceLanguage,
            message.targetLanguage,
          );
        }
      }

      // Track translation stats (fire-and-forget)
      const totalChars = uncachedPieces.reduce((sum, p) => sum + p.text.length, 0);
      incrementStats({
        totalApiCalls: 1,
        totalCharactersTranslated: totalChars,
      }).catch(() => {});
      recordDailyStats(totalChars, 1, cachedResults.length).catch(() => {});

      return {
        success: true,
        results: [...cachedResults, ...freshResults],
      };
    } else {
      return {
        success: false,
        error: result.error ?? 'Translation failed',
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
  const sessionId = ++subtitleSessionCounter;
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
    const filmHash = await contentHash(cues);
    let filmGlossary: Record<string, string> | undefined;
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

    // Mutate a copy of cues as we go
    const translatedCues = [...cues];

    // Helper to translate a chunk
    const translateChunk = async (chunkCues: SubtitleCue[], contextCues: SubtitleCue[]) => {
      // Each chunk holds its own semaphore slot so MAX_CONCURRENT is enforced
      // across the synchronous first chunk AND the background chunk loop.
      await acquireSemaphore();
      try {
        const chunkResult: SubtitleCue[] = new Array(chunkCues.length);
        const uncachedIndices: number[] = [];
        const uniqueTexts = new Set<string>();

        for (let i = 0; i < chunkCues.length; i++) {
          const cue = chunkCues[i];
          const cached = await getCachedTranslation(cue.text, sourceLanguage, targetLanguage, subtitleSettings.cacheTTLDays);
          if (cached) {
            chunkResult[i] = {
              ...cue,
              text: cached,
              originalText: cue.text,
            };
          } else {
            uncachedIndices.push(i);
            uniqueTexts.add(cue.text);
          }
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

          const result = await service.translate({
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

          if (result.success) {
            const textToTranslation = new Map<string, string>();
            for (const [id, translatedText] of result.translations.entries()) {
              if (id.startsWith('ctx')) continue; // Ignore context

              const originalText = idToOriginalText.get(id);
              if (originalText) {
                textToTranslation.set(originalText, translatedText);
                // Cache the translation
                await cacheTranslation(originalText, translatedText, sourceLanguage, targetLanguage);
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

            // Track subtitle API call + character stats (fire-and-forget)
            const chunkChars = [...uniqueTexts].reduce((sum, t) => sum + t.length, 0);
            incrementStats({
              totalApiCalls: 1,
              totalCharactersTranslated: chunkChars,
            }).catch(() => {});
            recordDailyStats(chunkChars, 1, chunkCues.length - uncachedIndices.length).catch(() => {});

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
                 // Track per-chunk subtitle stats (fire-and-forget) — avoids
                 // overcounting upfront when background chunks may fail.
                 incrementStats({
                   totalSubtitlesCuesTranslated: chunkResult.length,
                 }).catch(() => {});
               }
            } catch (error) {
               console.warn("AnyLLMTranslate: Background chunk translation failed", error);
            }
         }
         activeSessions.delete(tabId);
         clearKeepaliveAlarm();
      })();
    }

    // Track subtitle stats for the first chunk only (fire-and-forget).
    // Background chunk stats are tracked per-chunk in the async loop above
    // to avoid overcounting cues that may fail in later chunks.
    incrementStats({
      totalSubtitlesCuesTranslated: Math.min(cues.length, CHUNK_SIZE),
    }).catch(() => {});

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
): Promise<{ success: boolean; content?: string; error?: string }> {
  if (!isAllowedSubtitleUrl(message.url)) {
    return { success: false, error: 'URL not in subtitle allow-list' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(message.url, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }
    const content = await response.text();
    return { success: true, content };
  } catch (error) {
    clearTimeout(timer);
    if (error instanceof Error && error.name === 'AbortError') {
      return { success: false, error: 'Subtitle fetch timed out after 30s' };
    }
    const errorMsg = error instanceof Error ? error.message : 'Failed to fetch subtitle';
    return { success: false, error: errorMsg };
  }
}

/** Handle translateSelection message — translate a single text string */
async function handleTranslateSelection(
  message: TranslateSelectionMessage,
): Promise<{ success: boolean; translatedText?: string; error?: string }> {
  try {
    // FR-2: Check cache before calling LLM
    const selectionSettings = await loadSettings();
    const cached = await getCachedTranslation(
      message.text,
      message.sourceLanguage,
      message.targetLanguage,
      selectionSettings.cacheTTLDays,
    );
    if (cached !== null) {
      return { success: true, translatedText: cached };
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

      // Write-back to cache after successful LLM call
      await cacheTranslation(
        message.text,
        translated,
        message.sourceLanguage,
        message.targetLanguage,
      );

      // Track selection stats (fire-and-forget)
      incrementStats({
        totalApiCalls: 1,
        totalCharactersTranslated: message.text.length,
      }).catch(() => {});
      recordDailyStats(message.text.length, 1, 0).catch(() => {});

      return { success: true, translatedText: translated };
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
    case 'translateSelection':
      return handleTranslateSelection(message);
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
    default:
      return undefined;
  }
}

/** Initialize settings change listener */
export function initSettingsListener(): () => void {
  return onSettingsChange(() => {
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
  MAX_CONCURRENT,
  PDF_MAX_CONCURRENT,
};
