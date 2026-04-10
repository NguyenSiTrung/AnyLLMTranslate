/**
 * Tests for content.ts entrypoint — translation orchestration and visual settings application.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock dependencies (but not translationDisplay functions we want to test)
vi.mock('@/content/domWalker');
vi.mock('@/content/viewportObserver');
vi.mock('@/lib/config');
vi.mock('@/content/subtitleCoordinator');
vi.mock('@/content/textSelection');
vi.mock('@/content/hoverTranslate');
vi.mock('@/content/keyboardShortcuts');

import { startTranslation } from '../content';
import { applyTheme, applyPosition, applyDarkMode } from '@/content/translationDisplay';

describe('content.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-lingua-theme');
    document.documentElement.removeAttribute('data-lingua-position');
    document.documentElement.removeAttribute('data-lingua-state');
    document.documentElement.classList.remove('lingua-dark');
  });

  describe('startTranslation visual settings application', () => {
    it('applies theme from settings when translation starts', async () => {
      const { loadSettings } = await import('@/lib/config');
      const { extractPieces } = await import('@/content/domWalker');

      vi.mocked(loadSettings).mockResolvedValue({
        theme: 'bubble',
        translationPosition: 'below',
        darkMode: 'auto',
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      } as any);

      vi.mocked(extractPieces).mockReturnValue([]);

      await startTranslation();

      expect(document.documentElement.getAttribute('data-lingua-theme')).toBe('bubble');
    });

    it('applies translation position from settings when translation starts', async () => {
      const { loadSettings } = await import('@/lib/config');
      const { extractPieces } = await import('@/content/domWalker');

      vi.mocked(loadSettings).mockResolvedValue({
        theme: 'dividing-line',
        translationPosition: 'above',
        darkMode: 'light',
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      } as any);

      vi.mocked(extractPieces).mockReturnValue([]);

      await startTranslation();

      expect(document.documentElement.getAttribute('data-lingua-position')).toBe('above');
    });

    it('applies dark mode from settings when translation starts', async () => {
      const { loadSettings } = await import('@/lib/config');
      const { extractPieces } = await import('@/content/domWalker');

      vi.mocked(loadSettings).mockResolvedValue({
        theme: 'paper',
        translationPosition: 'side',
        darkMode: 'dark',
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      } as any);

      vi.mocked(extractPieces).mockReturnValue([]);

      await startTranslation();

      expect(document.documentElement.classList.contains('lingua-dark')).toBe(true);
    });

    it('sets all DOM attributes correctly when translation starts with pieces', async () => {
      const { loadSettings } = await import('@/lib/config');
      const { extractPieces } = await import('@/content/domWalker');
      const { ViewportObserver } = await import('@/content/viewportObserver');

      vi.mocked(loadSettings).mockResolvedValue({
        theme: 'shadow-card',
        translationPosition: 'below',
        darkMode: 'dark',
        sourceLanguage: 'en',
        targetLanguage: 'vi',
      } as any);

      // Create mock pieces to prevent early return
      vi.mocked(extractPieces).mockReturnValue([
        { id: 'piece-1', text: 'Hello', parentElement: document.createElement('p') },
      ] as any);

      // Mock ViewportObserver to avoid actual DOM observation
      vi.mocked(ViewportObserver).mockImplementation(() => ({
        observeAll: vi.fn(),
        disconnect: vi.fn(),
      } as any));

      await startTranslation();

      // Verify DOM attributes are set
      expect(document.documentElement.getAttribute('data-lingua-theme')).toBe('shadow-card');
      expect(document.documentElement.getAttribute('data-lingua-position')).toBe('below');
      expect(document.documentElement.classList.contains('lingua-dark')).toBe(true);
    });
  });

  describe('settings change listeners', () => {
    it('applies theme when settings change and translation is active', async () => {
      const { setPageState, getPageState } = await import('@/content/translationDisplay');

      // Set page state to active
      setPageState('dual');

      // Create a listener callback similar to the one in content.ts
      const listener = (changes: any, areaName: string) => {
        if (areaName !== 'local') return;
        const settingsKey = 'lingua-lens-settings';
        if (changes[settingsKey]?.newValue) {
          const newSettings = changes[settingsKey].newValue;
          if (newSettings.theme && getPageState() !== 'off') {
            applyTheme(newSettings.theme);
          }
        }
      };

      // Simulate settings change
      listener(
        {
          'lingua-lens-settings': {
            newValue: {
              theme: 'paper',
              translationPosition: 'below',
              darkMode: 'auto',
            },
          },
        },
        'local',
      );

      expect(document.documentElement.getAttribute('data-lingua-theme')).toBe('paper');
    });

    it('applies position when settings change and translation is active', async () => {
      const { setPageState, getPageState } = await import('@/content/translationDisplay');

      // Set page state to active
      setPageState('dual');

      // Create a listener callback similar to the one in content.ts
      const listener = (changes: any, areaName: string) => {
        if (areaName !== 'local') return;
        const settingsKey = 'lingua-lens-settings';
        if (changes[settingsKey]?.newValue) {
          const newSettings = changes[settingsKey].newValue;
          if (newSettings.translationPosition && getPageState() !== 'off') {
            applyPosition(newSettings.translationPosition);
          }
        }
      };

      // Simulate settings change
      listener(
        {
          'lingua-lens-settings': {
            newValue: {
              theme: 'bubble',
              translationPosition: 'above',
              darkMode: 'auto',
            },
          },
        },
        'local',
      );

      expect(document.documentElement.getAttribute('data-lingua-position')).toBe('above');
    });

    it('applies dark mode when settings change and translation is active', async () => {
      const { setPageState, getPageState } = await import('@/content/translationDisplay');

      // Set page state to active
      setPageState('dual');

      // Create a listener callback similar to the one in content.ts
      const listener = (changes: any, areaName: string) => {
        if (areaName !== 'local') return;
        const settingsKey = 'lingua-lens-settings';
        if (changes[settingsKey]?.newValue) {
          const newSettings = changes[settingsKey].newValue;
          if (newSettings.darkMode && getPageState() !== 'off') {
            applyDarkMode(newSettings.darkMode);
          }
        }
      };

      // Simulate settings change
      listener(
        {
          'lingua-lens-settings': {
            newValue: {
              theme: 'bubble',
              translationPosition: 'below',
              darkMode: 'dark',
            },
          },
        },
        'local',
      );

      expect(document.documentElement.classList.contains('lingua-dark')).toBe(true);
    });

    it('does not apply visual settings when translation is not active', async () => {
      const { setPageState, getPageState } = await import('@/content/translationDisplay');

      // Set page state to off
      setPageState('off');

      // Create a listener callback similar to the one in content.ts
      const listener = (changes: any, areaName: string) => {
        if (areaName !== 'local') return;
        const settingsKey = 'lingua-lens-settings';
        if (changes[settingsKey]?.newValue) {
          const newSettings = changes[settingsKey].newValue;
          if (newSettings.theme && getPageState() !== 'off') {
            applyTheme(newSettings.theme);
          }
        }
      };

      // Simulate settings change
      listener(
        {
          'lingua-lens-settings': {
            newValue: {
              theme: 'paper',
              translationPosition: 'above',
              darkMode: 'dark',
            },
          },
        },
        'local',
      );

      // Verify visual settings were not applied
      expect(document.documentElement.getAttribute('data-lingua-theme')).not.toBe('paper');
    });
  });

  describe('stopTranslation cleanup', () => {
    it('removes data-lingua-theme attribute when translation stops', async () => {
      const { stopTranslation } = await import('../content');

      // Set attributes before stopping
      document.documentElement.setAttribute('data-lingua-theme', 'bubble');
      document.documentElement.setAttribute('data-lingua-position', 'below');
      document.documentElement.classList.add('lingua-dark');

      stopTranslation();

      expect(document.documentElement.getAttribute('data-lingua-theme')).toBeNull();
    });

    it('removes data-lingua-position attribute when translation stops', async () => {
      const { stopTranslation } = await import('../content');

      // Set attributes before stopping
      document.documentElement.setAttribute('data-lingua-theme', 'bubble');
      document.documentElement.setAttribute('data-lingua-position', 'below');
      document.documentElement.classList.add('lingua-dark');

      stopTranslation();

      expect(document.documentElement.getAttribute('data-lingua-position')).toBeNull();
    });

    it('removes lingua-dark class when translation stops', async () => {
      const { stopTranslation } = await import('../content');

      // Set attributes before stopping
      document.documentElement.setAttribute('data-lingua-theme', 'bubble');
      document.documentElement.setAttribute('data-lingua-position', 'below');
      document.documentElement.classList.add('lingua-dark');

      stopTranslation();

      expect(document.documentElement.classList.contains('lingua-dark')).toBe(false);
    });
  });
});
