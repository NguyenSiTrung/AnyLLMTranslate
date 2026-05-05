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

import { startTranslation, stopTranslation } from '../content';
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
        originalHTML: 'Hello',
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
        id: 'piece-1', text: 'Hello', parentElement: document.createElement('p'), textNodes: [], originalHTML: 'Hello', isTranslated: false,
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
        id: 'piece-1', text: 'Hello', parentElement: document.createElement('p'), textNodes: [], originalHTML: 'Hello', isTranslated: false,
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
        originalHTML: 'Initial content',
        isTranslated: false,
      };
      const dynamicPiece: TranslationPiece = {
        id: 'piece-2',
        text: 'Dynamic content',
        parentElement: dynamicParent,
        textNodes: [],
        originalHTML: 'Dynamic content',
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
        originalHTML: 'Late content',
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
        originalHTML: 'Article content',
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
        id: 'piece-1', text: 'Hello', parentElement: document.createElement('p'), textNodes: [], originalHTML: 'Hello', isTranslated: false,
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
});
