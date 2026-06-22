/**
 * Tests for content.ts entrypoint — translation orchestration and visual settings application.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ExtensionSettings } from '@/types/config';
import type { TranslationPiece } from '@/types/translation';

const mutationMocks = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  callback: undefined as ((elements: Element[]) => void) | undefined,
}));

// Mock dependencies (but not translationDisplay functions we want to test)
vi.mock('@/content/domWalker');
vi.mock('@/content/viewportObserver');
vi.mock('@/content/mutationWatcher', () => ({
  MutationWatcher: vi.fn().mockImplementation((callback: (elements: Element[]) => void) => {
    mutationMocks.callback = callback;
    return {
      start: mutationMocks.start,
      stop: mutationMocks.stop,
    };
  }),
}));
vi.mock('@/lib/config');
vi.mock('@/content/subtitleCoordinator');
vi.mock('@/content/textSelection');
vi.mock('@/content/hoverTranslate');
vi.mock('@/content/keyboardShortcuts');

const catMocks = vi.hoisted(() => ({
  triggerAutoCategoryDetection: vi.fn<(...args: never[]) => Promise<void>>().mockResolvedValue(undefined),
  extractPageContext: vi.fn<(...args: never[]) => { title: string; description: string; domain: string; category?: string }>()
    .mockReturnValue({ title: '', description: '', domain: 'example.com' }),
  getAutoDetectedCategory: vi.fn<(...args: never[]) => string | undefined>().mockReturnValue(undefined),
  setAutoDetectedCategory: vi.fn<(category: string | undefined) => void>(),
}));
vi.mock('@/content/utils/pageContext', () => ({
  extractPageContext: (...args: never[]) => catMocks.extractPageContext(...args),
  resolveCategory: vi.fn(),
  detectLLMCategoryIfNeeded: vi.fn(),
  triggerAutoCategoryDetection: (...args: never[]) => catMocks.triggerAutoCategoryDetection(...args),
  DOMAIN_CATEGORY_MAP: {},
}));

vi.mock('@/content/categoryState', () => ({
  getAutoDetectedCategory: (...args: never[]) => catMocks.getAutoDetectedCategory(...args),
  setAutoDetectedCategory: (category: string | undefined) => catMocks.setAutoDetectedCategory(category),
  buildCategoryInfo: vi.fn(() => ({ autoDetected: undefined, siteRule: undefined, override: undefined, effective: undefined })),
  broadcastCategoryInfo: vi.fn(),
  isCategoryDetectionInFlight: vi.fn(() => false),
  setCategoryDetectionInFlight: vi.fn(),
}));

import { startTranslation, stopTranslation, setupMessageListener } from '../content';
import { applyTheme, applyPosition, applyDarkMode, setPageState, getPageState } from '@/content/translationDisplay';
import { extractPieces } from '@/content/domWalker';
import { ViewportObserver } from '@/content/viewportObserver';
import { loadSettings } from '@/lib/config';

const mockSettings: ExtensionSettings = {
  theme: 'blockquote',
  translationPosition: 'below',
  darkMode: 'auto',
  sourceLanguage: 'en',
  targetLanguage: 'vi',
} as ExtensionSettings;

describe('content.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(extractPieces).mockReset();
    vi.mocked(ViewportObserver).mockReset();
    vi.mocked(loadSettings).mockReset();
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-anyllm-theme');
    document.documentElement.removeAttribute('data-anyllm-position');
    document.documentElement.removeAttribute('data-anyllm-state');
    document.documentElement.classList.remove('anyllm-dark');
    mutationMocks.start.mockClear();
    mutationMocks.stop.mockClear();
    mutationMocks.callback = undefined;
  });

  describe('startTranslation visual settings application', () => {
    it('applies theme from settings when translation starts', async () => {
      vi.mocked(loadSettings).mockResolvedValue({
        ...mockSettings,
        theme: 'bubble',
      });

      vi.mocked(extractPieces).mockReturnValue([]);

      await startTranslation();

      expect(document.documentElement.getAttribute('data-anyllm-theme')).toBe('bubble');
    });

    it('applies translation position from settings when translation starts', async () => {
      vi.mocked(loadSettings).mockResolvedValue({
        ...mockSettings,
        theme: 'blockquote',
        translationPosition: 'above',
        darkMode: 'light',
      });

      vi.mocked(extractPieces).mockReturnValue([]);

      await startTranslation();

      expect(document.documentElement.getAttribute('data-anyllm-position')).toBe('above');
    });

    it('applies dark mode from settings when translation starts', async () => {
      vi.mocked(loadSettings).mockResolvedValue({
        ...mockSettings,
        theme: 'paper',
        translationPosition: 'side',
        darkMode: 'dark',
      });

      vi.mocked(extractPieces).mockReturnValue([]);

      await startTranslation();

      expect(document.documentElement.classList.contains('anyllm-dark')).toBe(true);
    });

    it('sets all DOM attributes correctly when translation starts with pieces', async () => {
      vi.mocked(loadSettings).mockResolvedValue({
        ...mockSettings,
        theme: 'shadow-card',
        translationPosition: 'below',
        darkMode: 'dark',
      });

      const mockPiece: TranslationPiece = {
        id: 'piece-1',
        text: 'Hello',
        parentElement: document.createElement('p'),
        textNodes: [],
        isTranslated: false,
      };

      vi.mocked(extractPieces).mockReturnValue([mockPiece]);
      vi.mocked(ViewportObserver).mockImplementation(() => ({
        observeAll: vi.fn(),
        disconnect: vi.fn(),
      } as unknown as ViewportObserver));

      await startTranslation();

      expect(document.documentElement.getAttribute('data-anyllm-theme')).toBe('shadow-card');
      expect(document.documentElement.getAttribute('data-anyllm-position')).toBe('below');
      expect(document.documentElement.classList.contains('anyllm-dark')).toBe(true);
    });

    it('applies dual page state when translation starts with bilingual-below displayMode', async () => {
      vi.mocked(loadSettings).mockResolvedValue({
        ...mockSettings,
        displayMode: 'bilingual-below',
      });
      const mockPiece: TranslationPiece = {
        id: 'piece-1', text: 'Hello', parentElement: document.createElement('p'), textNodes: [], isTranslated: false,
      };
      vi.mocked(extractPieces).mockReturnValue([mockPiece]);
      vi.mocked(ViewportObserver).mockImplementation(() => ({
        observeAll: vi.fn(),
        disconnect: vi.fn(),
      } as unknown as ViewportObserver));

      await startTranslation();
      expect(document.documentElement.getAttribute('data-anyllm-state')).toBe('dual');
    });

    it('applies translation-only page state when translation starts with translation-only displayMode', async () => {
      vi.mocked(loadSettings).mockResolvedValue({
        ...mockSettings,
        displayMode: 'translation-only',
      });
      const mockPiece: TranslationPiece = {
        id: 'piece-1', text: 'Hello', parentElement: document.createElement('p'), textNodes: [], isTranslated: false,
      };
      vi.mocked(extractPieces).mockReturnValue([mockPiece]);
      vi.mocked(ViewportObserver).mockImplementation(() => ({
        observeAll: vi.fn(),
        disconnect: vi.fn(),
      } as unknown as ViewportObserver));

      await startTranslation();
      expect(document.documentElement.getAttribute('data-anyllm-state')).toBe('translation-only');
    });

    it('observes dynamically added SPA content while page translation is active', async () => {
      vi.mocked(loadSettings).mockResolvedValue({
        ...mockSettings,
        displayMode: 'bilingual-below',
        siteRules: [],
        globalExcludeSelectors: [],
        enableSmartExcludes: false,
      } as ExtensionSettings);
      const initialParent = document.createElement('p');
      const dynamicParent = document.createElement('p');
      const initialPiece: TranslationPiece = {
        id: 'piece-1',
        text: 'Initial content',
        parentElement: initialParent,
        textNodes: [],
        isTranslated: false,
      };
      const dynamicPiece: TranslationPiece = {
        id: 'piece-2',
        text: 'Dynamic content',
        parentElement: dynamicParent,
        textNodes: [],
        isTranslated: false,
      };
      const observeAll = vi.fn();

      vi.mocked(extractPieces)
        .mockReturnValueOnce([initialPiece])
        .mockReturnValueOnce([dynamicPiece]);
      vi.mocked(ViewportObserver).mockImplementation(() => ({
        observeAll,
        disconnect: vi.fn(),
      } as unknown as ViewportObserver));

      await startTranslation();
      mutationMocks.callback?.([dynamicParent]);

      expect(mutationMocks.start).toHaveBeenCalledWith(document.body);
      expect(observeAll).toHaveBeenNthCalledWith(1, [initialPiece]);
      expect(observeAll).toHaveBeenNthCalledWith(2, [dynamicPiece]);
    });

    it('keeps watching SPA pages when no initial translatable content exists', async () => {
      vi.mocked(loadSettings).mockResolvedValue({
        ...mockSettings,
        displayMode: 'bilingual-below',
        siteRules: [],
        globalExcludeSelectors: [],
        enableSmartExcludes: false,
      } as ExtensionSettings);
      const dynamicParent = document.createElement('p');
      const dynamicPiece: TranslationPiece = {
        id: 'piece-1',
        text: 'Late content',
        parentElement: dynamicParent,
        textNodes: [],
        isTranslated: false,
      };
      const observeAll = vi.fn();

      vi.mocked(extractPieces)
        .mockReturnValueOnce([])
        .mockReturnValueOnce([dynamicPiece]);
      vi.mocked(ViewportObserver).mockImplementation(() => ({
        observeAll,
        disconnect: vi.fn(),
      } as unknown as ViewportObserver));

      await startTranslation();
      mutationMocks.callback?.([dynamicParent]);

      expect(document.documentElement.getAttribute('data-anyllm-state')).toBe('dual');
      expect(mutationMocks.start).toHaveBeenCalledWith(document.body);
      expect(observeAll).toHaveBeenCalledWith([dynamicPiece]);
    });

    it('applies include selectors to dynamically added root elements', async () => {
      vi.mocked(loadSettings).mockResolvedValue({
        ...mockSettings,
        displayMode: 'bilingual-below',
        siteRules: [{
          id: 'local-article',
          hostname: 'localhost',
          includeSelectors: ['article'],
          excludeSelectors: [],
          alwaysTranslate: false,
          neverTranslate: false,
          builtIn: false,
        }],
        globalExcludeSelectors: [],
        enableSmartExcludes: false,
      } as ExtensionSettings);
      const dynamicArticle = document.createElement('article');
      const dynamicPiece: TranslationPiece = {
        id: 'piece-1',
        text: 'Article content',
        parentElement: dynamicArticle,
        textNodes: [],
        isTranslated: false,
      };
      const observeAll = vi.fn();

      vi.mocked(extractPieces)
        .mockReturnValueOnce([])
        .mockReturnValueOnce([dynamicPiece]);
      vi.mocked(ViewportObserver).mockImplementation(() => ({
        observeAll,
        disconnect: vi.fn(),
      } as unknown as ViewportObserver));

      await startTranslation();
      mutationMocks.callback?.([dynamicArticle]);

      expect(extractPieces).toHaveBeenLastCalledWith(dynamicArticle, {
        excludeSelectors: [],
      });
      expect(observeAll).toHaveBeenCalledWith([dynamicPiece]);
    });

    it('skips dynamically added root elements that match excludes', async () => {
      vi.mocked(loadSettings).mockResolvedValue({
        ...mockSettings,
        displayMode: 'bilingual-below',
        siteRules: [],
        globalExcludeSelectors: ['nav'],
        enableSmartExcludes: false,
      } as ExtensionSettings);
      const dynamicNav = document.createElement('nav');
      const observeAll = vi.fn();

      vi.mocked(extractPieces).mockReturnValueOnce([]);
      vi.mocked(ViewportObserver).mockImplementation(() => ({
        observeAll,
        disconnect: vi.fn(),
      } as unknown as ViewportObserver));

      await startTranslation();
      mutationMocks.callback?.([dynamicNav]);

      expect(extractPieces).toHaveBeenCalledTimes(1);
      expect(observeAll).not.toHaveBeenCalled();
    });
  });

  describe('settings change listeners', () => {
    it('applies theme when settings change and translation is active', async () => {
      setPageState('dual');

      const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
        if (areaName !== 'local') return;
        const settingsKey = 'anyllm-translate-settings';
        if (changes[settingsKey]?.newValue) {
          const newSettings = changes[settingsKey].newValue;
          if (newSettings.theme && getPageState() !== 'off') {
            applyTheme(newSettings.theme);
          }
        }
      };

      listener(
        {
          'anyllm-translate-settings': {
            newValue: {
              theme: 'paper',
              translationPosition: 'below',
              darkMode: 'auto',
            },
          },
        },
        'local',
      );

      expect(document.documentElement.getAttribute('data-anyllm-theme')).toBe('paper');
    });

    it('applies position when settings change and translation is active', async () => {
      setPageState('dual');

      const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
        if (areaName !== 'local') return;
        const settingsKey = 'anyllm-translate-settings';
        if (changes[settingsKey]?.newValue) {
          const newSettings = changes[settingsKey].newValue;
          if (newSettings.translationPosition && getPageState() !== 'off') {
            applyPosition(newSettings.translationPosition);
          }
        }
      };

      listener(
        {
          'anyllm-translate-settings': {
            newValue: {
              theme: 'bubble',
              translationPosition: 'above',
              darkMode: 'auto',
            },
          },
        },
        'local',
      );

      expect(document.documentElement.getAttribute('data-anyllm-position')).toBe('above');
    });

    it('applies dark mode when settings change and translation is active', async () => {
      setPageState('dual');

      const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
        if (areaName !== 'local') return;
        const settingsKey = 'anyllm-translate-settings';
        if (changes[settingsKey]?.newValue) {
          const newSettings = changes[settingsKey].newValue;
          if (newSettings.darkMode && getPageState() !== 'off') {
            applyDarkMode(newSettings.darkMode);
          }
        }
      };

      listener(
        {
          'anyllm-translate-settings': {
            newValue: {
              theme: 'bubble',
              translationPosition: 'below',
              darkMode: 'dark',
            },
          },
        },
        'local',
      );

      expect(document.documentElement.classList.contains('anyllm-dark')).toBe(true);
    });

    it('applies translation-only state when displayMode changes to translation-only and translation is active', async () => {
      setPageState('dual');

      const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
        if (areaName !== 'local') return;
        const settingsKey = 'anyllm-translate-settings';
        if (changes[settingsKey]?.newValue) {
          const newSettings = changes[settingsKey].newValue;
          if (newSettings.displayMode && getPageState() !== 'off') {
            const next = newSettings.displayMode === 'translation-only' ? 'translation-only' : 'dual';
            setPageState(next);
          }
        }
      };

      listener(
        {
          'anyllm-translate-settings': {
            newValue: {
              displayMode: 'translation-only',
            },
          },
        },
        'local'
      );

      expect(document.documentElement.getAttribute('data-anyllm-state')).toBe('translation-only');
    });

    it('does not apply visual settings when translation is not active', async () => {
      setPageState('off');

      const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
        if (areaName !== 'local') return;
        const settingsKey = 'anyllm-translate-settings';
        if (changes[settingsKey]?.newValue) {
          const newSettings = changes[settingsKey].newValue;
          if (newSettings.theme && getPageState() !== 'off') {
            applyTheme(newSettings.theme);
          }
        }
      };

      listener(
        {
          'anyllm-translate-settings': {
            newValue: {
              theme: 'paper',
              translationPosition: 'above',
              darkMode: 'dark',
            },
          },
        },
        'local',
      );

      expect(document.documentElement.getAttribute('data-anyllm-theme')).not.toBe('paper');
    });

    it('does not apply displayMode when translation is not active', async () => {
      setPageState('off');

      const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
        if (areaName !== 'local') return;
        const settingsKey = 'anyllm-translate-settings';
        if (changes[settingsKey]?.newValue) {
          const newSettings = changes[settingsKey].newValue;
          if (newSettings.displayMode && getPageState() !== 'off') {
            const next = newSettings.displayMode === 'translation-only' ? 'translation-only' : 'dual';
            setPageState(next);
          }
        }
      };

      listener(
        {
          'anyllm-translate-settings': {
            newValue: {
              displayMode: 'translation-only',
            },
          },
        },
        'local'
      );

      // 'off' state means the data attribute is set to 'off', it should not change to 'translation-only'
      expect(document.documentElement.getAttribute('data-anyllm-state')).toBe('off');
    });
  });

  describe('stopTranslation cleanup', () => {
    it('removes data-anyllm-theme attribute when translation stops', async () => {
      document.documentElement.setAttribute('data-anyllm-theme', 'bubble');
      document.documentElement.setAttribute('data-anyllm-position', 'below');
      document.documentElement.classList.add('anyllm-dark');

      stopTranslation();

      expect(document.documentElement.getAttribute('data-anyllm-theme')).toBeNull();
    });

    it('removes data-anyllm-position attribute when translation stops', async () => {
      document.documentElement.setAttribute('data-anyllm-theme', 'bubble');
      document.documentElement.setAttribute('data-anyllm-position', 'below');
      document.documentElement.classList.add('anyllm-dark');

      stopTranslation();

      expect(document.documentElement.getAttribute('data-anyllm-position')).toBeNull();
    });

    it('removes anyllm-dark class when translation stops', async () => {
      document.documentElement.setAttribute('data-anyllm-theme', 'bubble');
      document.documentElement.setAttribute('data-anyllm-position', 'below');
      document.documentElement.classList.add('anyllm-dark');

      stopTranslation();

      expect(document.documentElement.classList.contains('anyllm-dark')).toBe(false);
    });

    it('stops the dynamic content watcher when translation stops', async () => {
      vi.mocked(loadSettings).mockResolvedValue({
        ...mockSettings,
        displayMode: 'bilingual-below',
      });
      const mockPiece: TranslationPiece = {
        id: 'piece-1', text: 'Hello', parentElement: document.createElement('p'), textNodes: [], isTranslated: false,
      };
      vi.mocked(extractPieces).mockReturnValue([mockPiece]);
      vi.mocked(ViewportObserver).mockImplementation(() => ({
        observeAll: vi.fn(),
        disconnect: vi.fn(),
      } as unknown as ViewportObserver));

      await startTranslation();
      stopTranslation();

      expect(mutationMocks.stop).toHaveBeenCalledTimes(1);
    });
  });

  describe('lifecycle session guards', () => {
    it('disconnects existing viewport observer when startTranslation is called twice', async () => {
      vi.mocked(loadSettings).mockResolvedValue({
        ...mockSettings,
        displayMode: 'bilingual-below',
      });
      vi.mocked(extractPieces).mockReturnValue([]);
      const firstDisconnect = vi.fn();
      const secondDisconnect = vi.fn();
      vi.mocked(ViewportObserver)
        .mockImplementationOnce(() => ({
          observeAll: vi.fn(),
          disconnect: firstDisconnect,
        } as unknown as ViewportObserver))
        .mockImplementationOnce(() => ({
          observeAll: vi.fn(),
          disconnect: secondDisconnect,
        } as unknown as ViewportObserver));

      await startTranslation();
      await startTranslation();

      // The first observer must have been torn down before the second
      // session installs its replacement — otherwise duplicate observers
      // would double-fire translation requests for the same paragraphs.
      expect(firstDisconnect).toHaveBeenCalledTimes(1);
      // Mutation watcher from first start must also have been stopped.
      expect(mutationMocks.stop).toHaveBeenCalledTimes(1);
    });

    it('stops the previous mutation watcher before installing a new one on re-start', async () => {
      vi.mocked(loadSettings).mockResolvedValue({
        ...mockSettings,
        displayMode: 'bilingual-below',
      });
      vi.mocked(extractPieces).mockReturnValue([]);
      vi.mocked(ViewportObserver).mockImplementation(() => ({
        observeAll: vi.fn(),
        disconnect: vi.fn(),
      } as unknown as ViewportObserver));

      // Start fresh so module-level state is owned by this test.
      stopTranslation();
      mutationMocks.stop.mockClear();

      await startTranslation();
      await startTranslation();
      await startTranslation();

      // Each start past the first must tear down the prior watcher exactly once.
      expect(mutationMocks.stop).toHaveBeenCalledTimes(2);
    });
  });

  describe('getPageCategory lazy detection', () => {
    type Listener = (msg: { action: string; category?: string }, sender: unknown, sendResponse: (r: unknown) => void) => boolean | undefined;

    function captureListener(): Listener {
      let captured: Listener | null = null;
      const addListener = vi.fn((l: Listener) => { captured = l; });
      global.chrome = {
        runtime: {
          sendMessage: vi.fn().mockResolvedValue(undefined),
          onMessage: { addListener, removeListener: vi.fn() },
        },
      } as unknown as typeof chrome;
      setupMessageListener();
      if (!captured) throw new Error('setupMessageListener did not register an onMessage listener');
      return captured;
    }

    beforeEach(() => {
      vi.mocked(loadSettings).mockResolvedValue({
        ...mockSettings,
        enableLLMPageCategoryDetection: true,
        enableContextAwareTranslation: true,
        llmCategoryDetectionMode: 'async',
        siteRules: [],
      } as ExtensionSettings);
      catMocks.getAutoDetectedCategory.mockReturnValue(undefined);
      catMocks.triggerAutoCategoryDetection.mockClear();
      catMocks.triggerAutoCategoryDetection.mockResolvedValue(undefined);
    });

    it('fires triggerAutoCategoryDetection when singleton is empty and detection is enabled', async () => {
      const listener = captureListener();

      await new Promise<void>((resolve) => {
        listener({ action: 'getPageCategory' }, {}, () => resolve());
      });
      // flush microtasks so the async IIFE reaches the trigger call
      await new Promise((r) => setTimeout(r, 0));

      expect(catMocks.triggerAutoCategoryDetection).toHaveBeenCalledTimes(1);
    });

    it('does NOT fire triggerAutoCategoryDetection when singleton already has a value', async () => {
      catMocks.getAutoDetectedCategory.mockReturnValue('News');
      const listener = captureListener();

      await new Promise<void>((resolve) => {
        listener({ action: 'getPageCategory' }, {}, () => resolve());
      });
      await new Promise((r) => setTimeout(r, 0));

      expect(catMocks.triggerAutoCategoryDetection).not.toHaveBeenCalled();
    });

    it('does NOT fire triggerAutoCategoryDetection when a heuristic category already exists', async () => {
      catMocks.extractPageContext.mockReturnValueOnce({ title: '', description: '', domain: 'example.com', category: 'News' });
      const listener = captureListener();

      await new Promise<void>((resolve) => {
        listener({ action: 'getPageCategory' }, {}, () => resolve());
      });
      await new Promise((r) => setTimeout(r, 0));

      expect(catMocks.triggerAutoCategoryDetection).not.toHaveBeenCalled();
    });

    it('does NOT fire triggerAutoCategoryDetection when an override is set', async () => {
      const listener = captureListener();

      // Simulate background forwarding a categoryChanged with an override.
      // The handler updates module-level categoryOverride asynchronously via
      // loadSettings().then(...); it does not call sendResponse, so resolve
      // via microtask flush instead of waiting on sendResponse.
      listener({ action: 'categoryChanged', category: 'Gaming' }, {}, () => {});
      // Allow the async loadSettings().then(...) in the categoryChanged handler
      // to run to completion so categoryOverride is populated before the next msg.
      await new Promise((r) => setTimeout(r, 0));
      // loadSettings is mocked to resolve synchronously, but the .then chain needs
      // an extra tick. Flush a few microtask turns to be safe.
      await new Promise((r) => setTimeout(r, 0));

      listener({ action: 'getPageCategory' }, {}, () => {});
      await new Promise((r) => setTimeout(r, 0));

      expect(catMocks.triggerAutoCategoryDetection).not.toHaveBeenCalled();
    });

    it('runs heuristic detection (extractPageContext with truthy flag) when LLM detection is OFF but context-aware translation is ON', async () => {
      // This is the regression guard for the heuristic/LLM decoupling: the cheap
      // domain-map heuristic must run regardless of the LLM-detection toggle, so
      // predefined sites (e.g. max.com -> Streaming Entertainment) surface their
      // category in the popup even with LLM detection off.
      vi.mocked(loadSettings).mockResolvedValue({
        ...mockSettings,
        enableContextAwareTranslation: true,
        enableLLMPageCategoryDetection: false,
        llmCategoryDetectionMode: 'async',
        siteRules: [],
      } as ExtensionSettings);
      catMocks.getAutoDetectedCategory.mockReturnValue(undefined);
      catMocks.extractPageContext.mockReturnValue({ title: '', description: '', domain: 'max.com', category: 'Streaming Entertainment' });
      catMocks.setAutoDetectedCategory.mockClear();
      catMocks.triggerAutoCategoryDetection.mockClear();
      const listener = captureListener();

      listener({ action: 'getPageCategory' }, {}, () => {});
      await new Promise((r) => setTimeout(r, 0));

      // Heuristic ran: extractPageContext was called with a truthy enable flag.
      expect(catMocks.extractPageContext).toHaveBeenCalledWith(expect.anything(), true);
      // The heuristic category is persisted into the shared singleton so the
      // popup (which reads autoDetected via buildCategoryInfo) can display it.
      expect(catMocks.setAutoDetectedCategory).toHaveBeenCalledWith('Streaming Entertainment');
      // The expensive LLM kick-off stays gated on enableLLMPageCategoryDetection.
      expect(catMocks.triggerAutoCategoryDetection).not.toHaveBeenCalled();
    });
  });

  describe('getPageContentType action', () => {
    type Listener = (msg: { action: string }, sender: unknown, sendResponse: (r: unknown) => void) => boolean | undefined;

    function captureListener(): Listener {
      let captured: Listener | null = null;
      const addListener = vi.fn((l: Listener) => { captured = l; });
      global.chrome = {
        runtime: {
          sendMessage: vi.fn().mockResolvedValue(undefined),
          onMessage: { addListener, removeListener: vi.fn() },
        },
      } as unknown as typeof chrome;
      setupMessageListener();
      if (!captured) throw new Error('setupMessageListener did not register an onMessage listener');
      return captured;
    }

    function setContentType(value: string | undefined): void {
      Object.defineProperty(document, 'contentType', { configurable: true, value });
    }

    it('responds with isPdf=true when document.contentType is application/pdf', () => {
      const listener = captureListener();
      setContentType('application/pdf');
      try {
        let captured: unknown;
        const ret = listener({ action: 'getPageContentType' }, {}, (r: unknown) => { captured = r; });
        expect(captured).toEqual({ isPdf: true });
        expect(ret).toBe(false);
      } finally {
        setContentType('text/html');
      }
    });

    it('responds with isPdf=false when document.contentType is text/html', () => {
      const listener = captureListener();
      setContentType('text/html');
      let captured: unknown;
      listener({ action: 'getPageContentType' }, {}, (r: unknown) => { captured = r; });
      expect(captured).toEqual({ isPdf: false });
    });
  });
});
