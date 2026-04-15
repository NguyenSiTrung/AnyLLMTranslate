/**
 * Tests for content.ts entrypoint — translation orchestration and visual settings application.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ExtensionSettings } from '@/types/config';
import type { TranslationPiece } from '@/types/translation';

// Mock dependencies (but not translationDisplay functions we want to test)
vi.mock('@/content/domWalker');
vi.mock('@/content/viewportObserver');
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
  theme: 'dividing-line',
  translationPosition: 'below',
  darkMode: 'auto',
  sourceLanguage: 'en',
  targetLanguage: 'vi',
} as ExtensionSettings;

describe('content.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-anyllm-theme');
    document.documentElement.removeAttribute('data-anyllm-position');
    document.documentElement.removeAttribute('data-anyllm-state');
    document.documentElement.classList.remove('anyllm-dark');
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
        theme: 'dividing-line',
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
  });
});
