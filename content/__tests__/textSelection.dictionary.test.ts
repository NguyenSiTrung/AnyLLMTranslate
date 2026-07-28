/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildDictionaryTooltipContent,
  applySelectionResponse,
  removeTooltip,
  TOOLTIP_CLASS,
  __setCurrentTooltipForTest,
} from '@/content/textSelection';
import {
  showLoading,
  removeDialog,
} from '@/content/selectionBubble/shell';

vi.mock('@/lib/config', () => ({
  loadSettings: vi.fn(async () => ({
    sourceLanguage: 'en',
    targetLanguage: 'vi',
    selectionDictionaryEnabled: true,
    glossary: [],
  })),
  updateSettings: vi.fn(async (p: unknown) => p),
}));

const handlers = {
  onCopy: () => {},
  onRetry: () => {},
  onSpeak: () => {},
  onGlossary: () => {},
  onPin: () => {},
  onClose: () => {},
};

function seedTooltip(): void {
  showLoading({
    anchor: { left: 100, top: 100, width: 40, height: 20 },
    originalText: 'seed',
    sourceLanguage: 'en',
    targetLanguage: 'vi',
    handlers,
  });
}

describe('textSelection dictionary UI', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    removeDialog();
    __setCurrentTooltipForTest(null);
  });

  afterEach(() => {
    removeTooltip();
    removeDialog();
    __setCurrentTooltipForTest(null);
    document.body.innerHTML = '';
  });

  describe('buildDictionaryTooltipContent', () => {
    it('works with phonetic-only dictionary fields', () => {
      const el = buildDictionaryTooltipContent(
        'test',
        {
          phonetic: '/tɛst/',
          translation: 'kiểm tra',
        },
        'kiểm tra',
      );

      expect(el.querySelector('.anyllm-word-dictionary-phonetic')?.textContent).toBe('/tɛst/');
      expect(el.querySelector('.anyllm-word-dictionary-defs')).toBeNull();
      expect(el.querySelector('.anyllm-word-dictionary-translation')?.textContent).toBe(
        'kiểm tra',
      );
    });
  });

  describe('applySelectionResponse', () => {
    it('renders dictionary layout when mode is dictionary with fields', () => {
      seedTooltip();

      applySelectionResponse('hello', {
        success: true,
        mode: 'dictionary',
        translatedText: 'xin chào',
        dictionary: {
          phonetic: '/həˈloʊ/',
          definitions: [{ pos: 'n.', meaning: 'lời chào' }],
          translation: 'xin chào',
        },
      });

      expect(document.querySelector('.anyllm-word-dictionary')).toBeTruthy();
      expect(document.querySelector('.anyllm-word-dictionary-phonetic')?.textContent).toBe(
        '/həˈloʊ/',
      );
      expect(document.querySelector(`.${TOOLTIP_CLASS}`)).toBeTruthy();
    });

    it('renders sentence layout when dictionary fields absent (fail-open plain text)', () => {
      // Scenario 1: sentence mode without dictionary fields → no dictionary UI
      seedTooltip();

      applySelectionResponse('A long sentence about many things.', {
        success: true,
        mode: 'sentence',
        translatedText: 'Một câu dài về nhiều thứ.',
      });

      expect(document.querySelector('.anyllm-word-dictionary')).toBeNull();
      expect(
        document.querySelector('[data-anyllm-role="selection-translation"]')?.textContent,
      ).toBe('Một câu dài về nhiều thứ.');

      // Scenario 2: fail-open — raw sentence-mode text renders as-is
      seedTooltip();

      applySelectionResponse('hello', {
        success: true,
        mode: 'sentence',
        translatedText: 'raw fallback text',
      });

      expect(
        document.querySelector('[data-anyllm-role="selection-translation"]')?.textContent,
      ).toBe('raw fallback text');
    });
  });
});
