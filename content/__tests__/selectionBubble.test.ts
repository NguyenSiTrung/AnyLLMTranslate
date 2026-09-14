import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildFooterActions, setStatusLine } from '@/content/selectionBubble/actions';
import { buildDictionaryContent } from '@/content/selectionBubble/contentDictionary';
import { buildSentenceContent } from '@/content/selectionBubble/contentSentence';
import { computeBubblePosition } from '@/content/selectionBubble/position';
import {
  showLoading,
  setPinned,
  isPinned,
  shouldDismissOnOutsideClick,
  removeDialog,
  applySentence,
} from '@/content/selectionBubble/shell';

/**
 * @vitest-environment jsdom
 */

const baseHandlers = () => ({
  onCopy: vi.fn(),
  onRetry: vi.fn(),
  onSpeakOriginal: vi.fn(),
  onSpeakTranslation: vi.fn(),
  onGlossary: vi.fn(),
});

describe('buildFooterActions', () => {
  it('renders five action buttons including dual speak, shows stop labels when speaking, and renders the status line', () => {
    const handlers = baseHandlers();
    const el = buildFooterActions({ handlers });
    expect(el.querySelectorAll('[data-anyllm-role="selection-action"]')).toHaveLength(5);
    expect(el.querySelector('[data-action="speak-original"]')).toBeTruthy();
    expect(el.querySelector('[data-action="speak-translation"]')).toBeTruthy();
    expect(
      el.querySelector('[data-action="speak-original"]')?.getAttribute('aria-label'),
    ).toBe('Speak original');
    expect(
      el.querySelector('[data-action="speak-translation"]')?.getAttribute('aria-label'),
    ).toBe('Speak translation');
    (el.querySelector('[data-action="copy"]') as HTMLButtonElement).click();
    expect(handlers.onCopy).toHaveBeenCalledOnce();
    (el.querySelector('[data-action="speak-original"]') as HTMLButtonElement).click();
    expect(handlers.onSpeakOriginal).toHaveBeenCalledOnce();
    (el.querySelector('[data-action="speak-translation"]') as HTMLButtonElement).click();
    expect(handlers.onSpeakTranslation).toHaveBeenCalledOnce();

    // While speaking, both speak buttons show "Stop".
    const speakingEl = buildFooterActions({ handlers: baseHandlers(), speaking: true });
    expect(
      speakingEl.querySelector('[data-action="speak-original"]')?.getAttribute('aria-label'),
    ).toBe('Stop');
    expect(
      speakingEl.querySelector('[data-action="speak-translation"]')?.getAttribute('aria-label'),
    ).toBe('Stop');

    // Status line renders the provided text.
    const withStatus = buildFooterActions({
      handlers: {
        onCopy: () => {},
        onRetry: () => {},
        onSpeakOriginal: () => {},
        onSpeakTranslation: () => {},
        onGlossary: () => {},
      },
    });
    setStatusLine(withStatus, 'Added to glossary', 'success');
    expect(
      withStatus.querySelector('[data-anyllm-role="selection-status"]')?.textContent,
    ).toBe('Added to glossary');
  });
});

/**
 * @vitest-environment jsdom
 */

describe('buildDictionaryContent', () => {
  it('renders section labels, word, phonetic, pos, translation, context', () => {
    const el = buildDictionaryContent(
      'hello',
      {
        phonetic: '/həˈloʊ/',
        definitions: [
          {
            pos: 'excl.',
            meaning: 'xin chào',
            example: { source: 'Hello!', target: 'Xin chào!' },
          },
        ],
        translation: 'xin chào',
        contextualAnalysis: 'A greeting.',
      },
      'xin chào',
    );
    expect(el.className).toContain('anyllm-word-dictionary');
    expect(el.querySelector('.anyllm-word-dictionary-word')?.textContent).toBe('hello');
    expect(el.querySelector('.anyllm-word-dictionary-phonetic')?.textContent).toBe('/həˈloʊ/');
    expect(el.querySelector('.anyllm-word-dictionary-pos')?.textContent).toBe('excl.');
    expect(el.querySelector('.anyllm-word-dictionary-translation')?.textContent).toBe(
      'xin chào',
    );
    expect(el.querySelector('.anyllm-word-dictionary-context')?.textContent).toContain(
      'greeting',
    );
    expect(el.textContent).toMatch(/Definitions/i);
    expect(el.textContent).toMatch(/In this context/i);
    expect(el.querySelector('.anyllm-tooltip-actions')).toBeNull();
  });
});

/**
 * @vitest-environment jsdom
 */

describe('buildSentenceContent', () => {
  it('shows translation with collapsed original by default and the original when expanded', () => {
    // Collapsed by default: translation visible, original hidden until toggled
    const onToggle = vi.fn();
    const el = buildSentenceContent({
      translatedText: 'Xin chào',
      originalText: 'Hello',
      originalExpanded: false,
      onToggleOriginal: onToggle,
    });
    expect(el.querySelector('[data-anyllm-role="selection-translation"]')?.textContent).toBe(
      'Xin chào',
    );
    expect(el.querySelector('[data-anyllm-role="selection-original"]')).toBeNull();
    const toggle = el.querySelector(
      '[data-anyllm-role="selection-original-toggle"]',
    ) as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    expect(onToggle).toHaveBeenCalledOnce();

    // Expanded: original shown
    const expanded = buildSentenceContent({
      translatedText: 'Xin chào',
      originalText: 'Hello',
      originalExpanded: true,
      onToggleOriginal: () => {},
    });
    expect(expanded.querySelector('[data-anyllm-role="selection-original"]')?.textContent).toBe(
      'Hello',
    );
  });
});

/**
 * @vitest-environment jsdom
 */

describe('computeBubblePosition', () => {
  const viewport = { width: 1000, height: 800 };
  const size = { width: 320, height: 160 };

  it('places above when there is room (adding scroll offsets), below when near the top edge, and clamps horizontally near the right edge', () => {
    const r = computeBubblePosition({
      anchor: { left: 400, top: 300, width: 100, height: 20 },
      size,
      viewport,
      scrollX: 0,
      scrollY: 0,
      gap: 8,
      margin: 8,
    });
    expect(r.placement).toBe('above');
    expect(r.top).toBeLessThan(300);
    expect(r.left).toBeGreaterThanOrEqual(8);
    expect(r.left + size.width).toBeLessThanOrEqual(viewport.width - 8);

    // Scroll offsets are added to document coordinates
    const scrolled = computeBubblePosition({
      anchor: { left: 100, top: 200, width: 50, height: 20 },
      size,
      viewport,
      scrollX: 50,
      scrollY: 100,
    });
    expect(scrolled.left).toBeGreaterThanOrEqual(50);
    expect(scrolled.top).toBeGreaterThanOrEqual(0);

    // Near the top edge → below
    const below = computeBubblePosition({
      anchor: { left: 400, top: 20, width: 100, height: 20 },
      size,
      viewport,
      scrollX: 0,
      scrollY: 0,
    });
    expect(below.placement).toBe('below');
    expect(below.top).toBeGreaterThan(20);

    // Near the right edge → horizontal clamp
    const clamped = computeBubblePosition({
      anchor: { left: 950, top: 400, width: 40, height: 20 },
      size,
      viewport,
      scrollX: 0,
      scrollY: 0,
      margin: 8,
    });
    expect(clamped.left + size.width).toBeLessThanOrEqual(viewport.width - 8);
  });

});

/**
 * @vitest-environment jsdom
 */

const handlers = {
  onCopy: () => {},
  onRetry: () => {},
  onSpeakOriginal: () => {},
  onSpeakTranslation: () => {},
  onGlossary: () => {},
  onPin: () => setPinned(!isPinned()),
  onClose: () => removeDialog(),
};

describe('shell pin', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    removeDialog();
  });
  afterEach(() => {
    removeDialog();
  });

  it('dismisses on outside click when unpinned but not when pinned; applySentence fills the body with the translation', () => {
    showLoading({
      anchor: { left: 100, top: 100, width: 40, height: 20 },
      originalText: 'hi',
      sourceLanguage: 'en',
      targetLanguage: 'vi',
      handlers,
    });
    expect(shouldDismissOnOutsideClick()).toBe(true);

    setPinned(true);
    expect(shouldDismissOnOutsideClick()).toBe(false);
    expect(isPinned()).toBe(true);

    applySentence({ translatedText: 'Xin chào', originalText: 'Hello' });
    expect(
      document.querySelector('[data-anyllm-role="selection-translation"]')?.textContent,
    ).toBe('Xin chào');
  });
});
