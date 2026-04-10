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
    const service = await initService();

    const texts = new Map<string, string>();
    for (const piece of message.pieces) {
      texts.set(piece.id, piece.text);
    }

    const result = await service.translate({
      texts,
      sourceLanguage: message.sourceLanguage,
      targetLanguage: message.targetLanguage,
    });

    if (result.success) {
      return {
        success: true,
        results: Array.from(result.translations.entries()).map(([id, translatedText]) => ({
          id,
          translatedText,
        })),
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

      const result = await service.translate({
        texts,
        sourceLanguage,
        targetLanguage,
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
    const service = await initService();
    const texts = new Map<string, string>();
    texts.set('selection', message.text);

    const result = await service.translate({
      texts,
      sourceLanguage: message.sourceLanguage,
      targetLanguage: message.targetLanguage,
    });

    if (result.success) {
      const translated = result.translations.get('selection') ?? '';

      // Cache the translation
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
