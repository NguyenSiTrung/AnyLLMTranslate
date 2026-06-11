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
} from '@/types/messages';
import type { SubtitleCue } from '@/types/subtitle';
import { loadSettings, onSettingsChange } from '@/lib/config';
import { setCategoryOverride as storeCategoryOverride, getCategoryOverride as fetchCategoryOverride } from '@/services/categoryStore';
import { OpenAICompatibleService } from '@/services/openaiCompatible';
import { LangflowService } from '@/services/langflowService';
import type { TranslationService } from '@/services/base';
import { validateProviderConfig } from '@/services/base';
import { getCachedTranslation, cacheTranslation, evictCache, clearCache } from '@/services/cacheManager';
import { formatGlossary } from '@/lib/glossary';
import { incrementStats, recordDailyStats } from '@/services/statsCollector';
import { invalidateDebugCache } from '@/services/debugLog';
import type { ProviderConfig } from '@/types/config';

/** Priority queue state for active translation sessions */
interface TranslationSession {
  queue: number[];
  setPriority: (cueIndex: number, chunkSize: number) => void;
}
const activeSessions = new Map<number, TranslationSession>();

/** Keep-alive alarm name for MV3 service worker */
const KEEPALIVE_ALARM = 'sw-keepalive';

/** Create or ensure keep-alive alarm exists when sessions are active */
function ensureKeepaliveAlarm(): void {
  chrome.alarms.get(KEEPALIVE_ALARM, (alarm) => {
    if (!alarm) {
      chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.33 }); // ~20s
    }
  });
}

/** Clear keep-alive alarm when no sessions remain */
function clearKeepaliveAlarm(): void {
  if (activeSessions.size === 0) {
    chrome.alarms.clear(KEEPALIVE_ALARM);
  }
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

/** Rate-limiting semaphore: max 3 concurrent, queue up to 10 */
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
const semaphore: SemaphoreState = { active: 0, queue: [] };
const MAX_CONCURRENT = 3;
const MAX_QUEUE = 10;
const QUEUE_TIMEOUT_MS = 30000;

async function acquireSemaphore(): Promise<void> {
  if (semaphore.active < MAX_CONCURRENT) {
    semaphore.active++;
    return;
  }
  if (semaphore.queue.length >= MAX_QUEUE) {
    throw new Error('Too many translation requests — please try again later');
  }
  return new Promise<void>((resolve, reject) => {
    const waiter: SemaphoreWaiter = { settled: false, grant: () => {} };

    const timeout = setTimeout(() => {
      if (waiter.settled) return;
      waiter.settled = true;
      const idx = semaphore.queue.indexOf(waiter);
      if (idx !== -1) semaphore.queue.splice(idx, 1);
      reject(new Error('Translation request timed out waiting in queue'));
    }, QUEUE_TIMEOUT_MS);

    waiter.grant = () => {
      if (waiter.settled) return;
      waiter.settled = true;
      clearTimeout(timeout);
      resolve();
    };

    semaphore.queue.push(waiter);
  });
}

function releaseSemaphore(): void {
  // Hand the slot to the next live waiter, skipping any that already timed out
  // (those are marked settled and may still linger if removal raced a release).
  while (semaphore.queue.length > 0) {
    const next = semaphore.queue.shift();
    if (next && !next.settled) {
      next.grant(); // slot transfers to the waiter; active count is unchanged
      return;
    }
  }
  semaphore.active = Math.max(0, semaphore.active - 1);
}

/** Reset semaphore state. Exported for tests. */
function __resetSemaphoreForTest(): void {
  for (const waiter of semaphore.queue) waiter.settled = true;
  semaphore.active = 0;
  semaphore.queue = [];
}

/** Inspect semaphore state. Exported for tests. */
function __getSemaphoreStateForTest(): { active: number; queued: number } {
  return { active: semaphore.active, queued: semaphore.queue.length };
}

/** Track current preset to detect when service type must change */
let activePreset: string | null = null;

/** Initialize or re-create translation service from settings */
async function initService(): Promise<TranslationService & { updateConfig(config: ProviderConfig): void }> {
  const settings = await loadSettings();
  const config = settings.provider;

  // Re-create if preset changed (e.g., switching between custom ↔ langflow)
  if (translationService && activePreset === config.preset) {
    translationService.updateConfig(config);
  } else {
    // Route by preset: Langflow gets its own service, everything else is OpenAI-compatible
    if (config.preset === 'langflow') {
      translationService = new LangflowService(config);
    } else {
      translationService = new OpenAICompatibleService(config);
    }
    activePreset = config.preset;
  }

  return translationService;
}

/** Handle translate message */
async function handleTranslate(
  message: ExtensionMessage & { action: 'translate' },
  sender?: chrome.runtime.MessageSender,
): Promise<TranslationResultMessage> {
  await acquireSemaphore();
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

      clearKeepaliveAlarm();
      return {
        success: true,
        results: [...cachedResults, ...freshResults],
      };
    } else {
      clearKeepaliveAlarm();
      return {
        success: false,
        error: result.error ?? 'Translation failed',
      };
    }
  } catch (error) {
    clearKeepaliveAlarm();
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMsg };
  } finally {
    releaseSemaphore();
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
): Promise<{ success: boolean; cues?: SubtitleCue[]; error?: string }> {
  await acquireSemaphore();
  try {
    const service = await initService();
    const { cues, sourceLanguage, targetLanguage, pageContext } = message;
    const tabId = sender?.tab?.id;

    const subtitleSettings = await loadSettings();
    const subtitleGlossary = formatGlossary(subtitleSettings.glossary ?? []);

    const CHUNK_SIZE = 25;
    const CONTEXT_SIZE = 3;

    // Mutate a copy of cues as we go
    const translatedCues = [...cues];

    // Helper to translate a chunk
    const translateChunk = async (chunkCues: SubtitleCue[], contextCues: SubtitleCue[]) => {
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
        // Prepend context cues (LLM translates them, but we ignore the result)
        for (const ctxCue of contextCues) {
           texts.set(`ctx${counter++}`, ctxCue.text);
        }
        
        counter = 1;
        for (const text of uniqueTexts) {
          const id = `s${counter++}`;
          texts.set(id, text);
          idToOriginalText.set(id, text);
        }

        const result = await service.translate({
          texts,
          sourceLanguage,
          targetLanguage,
          glossaryBlock: subtitleGlossary || undefined,
          customSystemPrompt: subtitleSettings.customSystemPrompt ?? null,
          pageContext,
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
        } else {
          throw new Error(result.error ?? 'Chunk translation failed');
        }
      }
      return chunkResult;
    };

    // Process first chunk synchronously to return immediately
    const firstChunkCues = cues.slice(0, CHUNK_SIZE);
    try {
      const firstChunkResult = await translateChunk(firstChunkCues, []);
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
        }
      };

      activeSessions.set(tabId, session);
      ensureKeepaliveAlarm();

      (async () => {
         while (session.queue.length > 0) {
            const i = session.queue.shift();
            if (i === undefined) break;
            const chunkCues = cues.slice(i, i + CHUNK_SIZE);
            const contextCues = cues.slice(Math.max(0, i - CONTEXT_SIZE), i);
            
            try {
               const chunkResult = await translateChunk(chunkCues, contextCues);
               if (chunkResult.length > 0) {
                 // Merge chunk into the full translatedCues array exactly at the right offset
                 for (let j = 0; j < chunkResult.length; j++) {
                    translatedCues[i + j] = chunkResult[j];
                 }
                 // Send the FULL updated array to tab
                 chrome.tabs.sendMessage(tabId, {
                    action: 'SUBTITLE_CHUNK_TRANSLATED',
                    cues: translatedCues
                 });
               }
            } catch (error) {
               console.warn("AnyLLMTranslate: Background chunk translation failed", error);
            }
         }
         activeSessions.delete(tabId);
         clearKeepaliveAlarm();
      })();
    }

    // Track subtitle stats (fire-and-forget)
    incrementStats({
      totalSubtitlesCuesTranslated: cues.length,
    }).catch(() => {});

    return { success: true, cues: translatedCues };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Subtitle translation failed';
    return { success: false, error: errorMsg };
  } finally {
    releaseSemaphore();
  }
}

/** Allowed subtitle domains for CORS bypass */
const SUBTITLE_ALLOWLIST = [
  /youtube\.com/,
  /googlevideo\.com/,
  /youtu\.be/,
  /udemycdn\.com/,
  /udemy\.com/,
  /coursera\.org/,
  /coursera-user-content\.net/,
  /vimeo\.com/,
  /vimeocdn\.com/,
  /netflix\.com/,
  /nflxvideo\.net/,
  /amazon\.com/,
  /primevideo\.com/,
  /aiv-cdn\.net/,
  /cloudfront\.net/,
  /akamaized\.net/,
  /linkedin\.com/,
  /licdn\.com/,
];

function isAllowedSubtitleUrl(url: string): boolean {
  return SUBTITLE_ALLOWLIST.some((pattern) => pattern.test(url));
}

/** Handle fetchSubtitle message (CORS bypass for subtitle fetch) */
async function handleFetchSubtitle(
  message: FetchSubtitleMessage,
): Promise<{ success: boolean; content?: string; error?: string }> {
  if (!isAllowedSubtitleUrl(message.url)) {
    return { success: false, error: 'URL not in subtitle allow-list' };
  }
  try {
    const response = await fetch(message.url);
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }
    const content = await response.text();
    return { success: true, content };
  } catch (error) {
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
      return initService().then(() => ({ success: true }));
    case 'translateSubtitle':
      return handleTranslateSubtitle(message, _sender);
    case 'FETCH_SUBTITLE':
      return handleFetchSubtitle(message);
    case 'translateSelection':
      return handleTranslateSelection(message);
    case 'restore': {
      // Clear page translation session tracking for this tab
      const restoreTabId = _sender.tab?.id;
      if (restoreTabId) translatedTabSessions.delete(restoreTabId);
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
          session.setPriority(message.cueIndex, 25); // CHUNK_SIZE is 25
        }
      }
      return undefined;
    }
    case 'setCategoryOverride': {
      const tabId = message.tabId || _sender.tab?.id;
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
      const tabId = message.tabId || _sender.tab?.id;
      if (!tabId) return Promise.resolve({ override: undefined });
      const override = fetchCategoryOverride(tabId);
      return Promise.resolve({ override });
    }
    case 'DETECT_PAGE_CATEGORY_LLM':
      return handleDetectPageCategoryLLM(message);
    case 'CLEAR_CACHE':
      return clearCache().then(() => ({ success: true })).catch(() => ({ success: false }));
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

/** Export for testing */
export {
  initService,
  acquireSemaphore,
  releaseSemaphore,
  __resetSemaphoreForTest,
  __getSemaphoreStateForTest,
};
