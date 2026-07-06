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
  });

  describe('stopTranslation cleanup', () => {
    it('removes data-anyllm-theme attribute when translation stops', async () => {
      document.documentElement.setAttribute('data-anyllm-theme', 'bubble');
      document.documentElement.setAttribute('data-anyllm-position', 'below');
      document.documentElement.classList.add('anyllm-dark');

      stopTranslation();

      expect(document.documentElement.getAttribute('data-anyllm-theme')).toBeNull();
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
  });
});
