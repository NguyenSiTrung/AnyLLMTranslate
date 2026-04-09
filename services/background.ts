/**
 * Background service worker — central message router and translation coordinator.
 * Handles all communication between popup, content scripts, and translation service.
 */

import type {
  ExtensionMessage,
  TranslationResultMessage,
  StatusResponse,
  TabTranslationStatus,
} from '@/types/messages';
import type { ProviderConfig } from '@/types/config';
import { loadSettings, onSettingsChange } from '@/lib/config';
import { OpenAICompatibleService } from '@/services/openaiCompatible';
import { validateProviderConfig } from '@/services/base';

/** Per-tab translation state */
interface TabState {
  status: TabTranslationStatus;
  translatedCount: number;
  totalCount: number;
  error?: string;
}

/** Tab states map */
const tabStates = new Map<number, TabState>();

/** Active translation service instance */
let translationService: OpenAICompatibleService | null = null;

/** Get or create the default tab state */
function getTabState(tabId: number): TabState {
  let state = tabStates.get(tabId);
  if (!state) {
    state = { status: 'idle', translatedCount: 0, totalCount: 0 };
    tabStates.set(tabId, state);
  }
  return state;
}

/** Update tab state */
function updateTabState(tabId: number, updates: Partial<TabState>): void {
  const state = getTabState(tabId);
  Object.assign(state, updates);
  tabStates.set(tabId, state);
}

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
  message: ExtensionMessage & { action: 'translate' },
  tabId: number,
): Promise<TranslationResultMessage> {
  try {
    const service = await initService();
    const state = getTabState(tabId);

    updateTabState(tabId, {
      status: 'translating',
      totalCount: state.totalCount + message.pieces.length,
    });

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
      updateTabState(tabId, {
        status: 'done',
        translatedCount: state.translatedCount + result.translations.size,
      });

      return {
        success: true,
        results: Array.from(result.translations.entries()).map(([id, translatedText]) => ({
          id,
          translatedText,
        })),
      };
    } else {
      updateTabState(tabId, {
        status: 'error',
        error: result.error,
      });

      return {
        success: false,
        error: result.error ?? 'Translation failed',
      };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    updateTabState(tabId, { status: 'error', error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/** Handle restore message */
function handleRestore(tabId: number): { success: boolean } {
  updateTabState(tabId, {
    status: 'idle',
    translatedCount: 0,
    totalCount: 0,
    error: undefined,
  });
  return { success: true };
}

/** Handle getStatus message */
function handleGetStatus(tabId: number): StatusResponse {
  const state = getTabState(tabId);
  return {
    status: state.status,
    translatedCount: state.translatedCount,
    totalCount: state.totalCount,
    error: state.error,
  };
}

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

/** Main message router */
export function handleMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> | undefined {
  const tabId = sender.tab?.id ?? 0;

  switch (message.action) {
    case 'translate':
      return handleTranslate(message, tabId);
    case 'restore':
      return Promise.resolve(handleRestore(tabId));
    case 'getStatus':
      return Promise.resolve(handleGetStatus(tabId));
    case 'testConnection':
      return handleTestConnection();
    case 'updateSettings':
      return initService().then(() => ({ success: true }));
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
export { tabStates, getTabState, updateTabState, initService };
