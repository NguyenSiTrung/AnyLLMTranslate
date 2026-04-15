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
} from '@/types/messages';
import type { SubtitleCue } from '@/types/subtitle';
import { loadSettings, onSettingsChange } from '@/lib/config';
import { OpenAICompatibleService } from '@/services/openaiCompatible';
import { validateProviderConfig } from '@/services/base';
import { getCachedTranslation, cacheTranslation } from '@/services/cacheManager';
import { formatGlossary } from '@/lib/glossary';

 

/** Active translation service instance */
let translationService: OpenAICompatibleService | null = null;

/** Initialize or re-create translation service from settings */
async function initService(): Promise<OpenAICompatibleService> {
  const settings = await loadSettings();
  const config = settings.provider;

  if (translationService) {
    translationService.updateConfig(config);
  } else {
    translationService = new OpenAICompatibleService(config);
  }

  return translationService;
}

/** Handle translate message */
async function handleTranslate(
  message: ExtensionMessage & { action: 'translate' }
): Promise<TranslationResultMessage> {
  try {
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
      );
      if (cached !== null) {
        cachedResults.push({ id: piece.id, translatedText: cached });
      } else {
        uncachedPieces.push(piece);
      }
    }

    // If all pieces were cached, return immediately — no LLM call
    if (uncachedPieces.length === 0) {
      return { success: true, results: cachedResults };
    }

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
): Promise<{ success: boolean; cues?: SubtitleCue[]; error?: string }> {
  try {
    const service = await initService();
    const { cues, sourceLanguage, targetLanguage } = message;

    // Check cache for each cue
    const translatedCues: SubtitleCue[] = [];
    const uncachedTexts = new Map<string, SubtitleCue>();

    for (const cue of cues) {
      const cached = await getCachedTranslation(cue.text, sourceLanguage, targetLanguage);
      if (cached) {
        translatedCues.push({
          ...cue,
          text: cached,
          originalText: cue.text,
        });
      } else {
        uncachedTexts.set(cue.text, cue);
      }
    }

    // Batch translate uncached texts
    if (uncachedTexts.size > 0) {
      const texts = new Map<string, string>();
      for (const [, cue] of uncachedTexts.entries()) {
        texts.set(cue.text, cue.text);
      }

      const subtitleSettings = await loadSettings();
      const subtitleGlossary = formatGlossary(subtitleSettings.glossary ?? []);

      const result = await service.translate({
        texts,
        sourceLanguage,
        targetLanguage,
        glossaryBlock: subtitleGlossary || undefined,
        customSystemPrompt: subtitleSettings.customSystemPrompt ?? null,
      });

      if (result.success) {
        for (const [originalText, translatedText] of result.translations.entries()) {
          const cue = uncachedTexts.get(originalText);
          if (cue) {
            const translatedCue = {
              ...cue,
              text: translatedText,
              originalText: cue.text,
            };
            translatedCues.push(translatedCue);

            // Cache the translation
            await cacheTranslation(originalText, translatedText, sourceLanguage, targetLanguage);
          }
        }
      } else {
        return { success: false, error: result.error ?? 'Subtitle translation failed' };
      }
    }

    // Sort by start time to maintain order
    translatedCues.sort((a, b) => a.startTime - b.startTime);

    return { success: true, cues: translatedCues };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Subtitle translation failed';
    return { success: false, error: errorMsg };
  }
}

/** Handle fetchSubtitle message (CORS bypass for subtitle fetch) */
async function handleFetchSubtitle(
  message: FetchSubtitleMessage,
): Promise<{ success: boolean; content?: string; error?: string }> {
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
    const cached = await getCachedTranslation(
      message.text,
      message.sourceLanguage,
      message.targetLanguage,
    );
    if (cached !== null) {
      return { success: true, translatedText: cached };
    }

    const service = await initService();
    const selectionSettings = await loadSettings();
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

      return { success: true, translatedText: translated };
    } else {
      return { success: false, error: result.error ?? 'Translation failed' };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Selection translation failed';
    return { success: false, error: errorMsg };
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
      return handleTranslate(message);
    case 'testConnection':
      return handleTestConnection();
    case 'updateSettings':
      return initService().then(() => ({ success: true }));
    case 'translateSubtitle':
      return handleTranslateSubtitle(message);
    case 'FETCH_SUBTITLE':
      return handleFetchSubtitle(message);
    case 'translateSelection':
      return handleTranslateSelection(message);
    case 'statusUpdate':
      handleStatusUpdate(message, _sender.tab?.id);
      return undefined;
    default:
      return undefined;
  }
}

/** Initialize settings change listener */
export function initSettingsListener(): () => void {
  return onSettingsChange(() => {
    initService();
  });
}

/** Export for testing */
export { initService };
