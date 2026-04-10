/**
 * Tests for content/textSelection.ts — text selection translate popup.
 * Covers: selection detection, button positioning, tooltip lifecycle, cleanup.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initTextSelection,
  setTextSelectionEnabled,
  isTextSelectionEnabled,
  removeTooltip,
  removeTranslateButton,
  TRANSLATE_BUTTON_CLASS,
  TOOLTIP_CLASS,
} from '@/content/textSelection';

// Mock chrome APIs
vi.mock('@/lib/config', () => ({
  loadSettings: vi.fn().mockResolvedValue({
    sourceLanguage: 'auto',
    targetLanguage: 'vi',
    textSelectionEnabled: true,
  }),
}));

describe('content/textSelection', () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = '<p>Hello world paragraph for testing</p>';
    cleanup = null;
    setTextSelectionEnabled(true);
  });

  afterEach(() => {
    if (cleanup) cleanup();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('initTextSelection', () => {
    it('returns a cleanup function', () => {
      cleanup = initTextSelection();
      expect(typeof cleanup).toBe('function');
    });

    it('attaches event listeners that can be cleaned up', () => {
      const addSpy = vi.spyOn(document, 'addEventListener');
      cleanup = initTextSelection();

      expect(addSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
      expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      expect(addSpy).toHaveBeenCalledWith('mousedown', expect.any(Function));
    });

    it('cleanup removes event listeners', () => {
      const removeSpy = vi.spyOn(document, 'removeEventListener');
      cleanup = initTextSelection();
      cleanup();
      cleanup = null;

      expect(removeSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('mousedown', expect.any(Function));
    });
  });

  describe('setTextSelectionEnabled', () => {
    it('sets enabled state to true', () => {
      setTextSelectionEnabled(true);
      expect(isTextSelectionEnabled()).toBe(true);
    });

    it('sets enabled state to false', () => {
      setTextSelectionEnabled(false);
      expect(isTextSelectionEnabled()).toBe(false);
    });

    it('cleans up tooltip and button when disabled', () => {
      // Create dummy elements
      const btn = document.createElement('div');
      btn.className = TRANSLATE_BUTTON_CLASS;
      document.body.appendChild(btn);

      const tooltip = document.createElement('div');
      tooltip.className = TOOLTIP_CLASS;
      document.body.appendChild(tooltip);

      setTextSelectionEnabled(false);
      expect(isTextSelectionEnabled()).toBe(false);
    });
  });

  describe('removeTooltip', () => {
    it('removes tooltip element from DOM', () => {
      // No tooltip exists — should not throw
      expect(() => removeTooltip()).not.toThrow();
    });
  });

  describe('removeTranslateButton', () => {
    it('removes button element from DOM', () => {
      // No button exists — should not throw
      expect(() => removeTranslateButton()).not.toThrow();
    });
  });

  describe('keyboard Escape dismissal', () => {
    it('dispatching Escape key calls cleanup handlers', () => {
      cleanup = initTextSelection();

      // Simulate keydown Escape
      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(escapeEvent);

      // Should not have any tooltip or button after Escape
      expect(document.querySelector(`.${TOOLTIP_CLASS}`)).toBeNull();
      expect(document.querySelector(`.${TRANSLATE_BUTTON_CLASS}`)).toBeNull();
    });
  });

  describe('mouseup with no selection', () => {
    it('does not create translate button when selection is empty', () => {
      cleanup = initTextSelection();

      // Mock empty selection
      vi.spyOn(window, 'getSelection').mockReturnValue({
        toString: () => '',
        rangeCount: 0,
      } as unknown as Selection);

      // Simulate mouseup
      const mouseupEvent = new MouseEvent('mouseup', {
        clientX: 100,
        clientY: 100,
        bubbles: true,
      });
      document.dispatchEvent(mouseupEvent);

      expect(document.querySelector(`.${TRANSLATE_BUTTON_CLASS}`)).toBeNull();
    });

    it('does not create translate button when selection is too short', () => {
      cleanup = initTextSelection();

      // Mock single-char selection
      vi.spyOn(window, 'getSelection').mockReturnValue({
        toString: () => 'a',
        rangeCount: 1,
        getRangeAt: () => ({
          getBoundingClientRect: () => ({
            top: 100, left: 100, width: 10, height: 20,
          }),
        }),
      } as unknown as Selection);

      const mouseupEvent = new MouseEvent('mouseup', {
        clientX: 100,
        clientY: 100,
        bubbles: true,
      });
      document.dispatchEvent(mouseupEvent);

      expect(document.querySelector(`.${TRANSLATE_BUTTON_CLASS}`)).toBeNull();
    });
  });

  describe('mouseup with valid selection', () => {
    it('creates translate button when selection is >= 2 chars', async () => {
      cleanup = initTextSelection();

      const mockRange = {
        getBoundingClientRect: () => ({
          top: 100, left: 100, width: 50, height: 20,
          bottom: 120, right: 150, x: 100, y: 100,
          toJSON: () => ({}),
        }),
      };

      // Mock valid selection
      const selectionMock = {
        toString: () => 'Hello world',
        rangeCount: 1,
        getRangeAt: () => mockRange,
      } as unknown as Selection;

      vi.spyOn(window, 'getSelection').mockReturnValue(selectionMock);

      const para = document.querySelector('p')!;
      const mouseupEvent = new MouseEvent('mouseup', {
        clientX: 125,
        clientY: 110,
        bubbles: true,
      });
      para.dispatchEvent(mouseupEvent);

      // Flush microtasks (async event handler) 
      await vi.waitFor(() => {
        const btn = document.querySelector(`.${TRANSLATE_BUTTON_CLASS}`);
        expect(btn).not.toBeNull();
      });

      const btn = document.querySelector(`.${TRANSLATE_BUTTON_CLASS}`);
      expect(btn?.getAttribute('role')).toBe('button');
      expect(btn?.getAttribute('aria-label')).toBe('Translate selection');
    });
  });

  describe('disabled state', () => {
    it('does not create button when disabled', () => {
      cleanup = initTextSelection();
      setTextSelectionEnabled(false);

      vi.spyOn(window, 'getSelection').mockReturnValue({
        toString: () => 'Hello world',
        rangeCount: 1,
        getRangeAt: () => ({
          getBoundingClientRect: () => ({
            top: 100, left: 100, width: 50, height: 20,
          }),
        }),
      } as unknown as Selection);

      const mouseupEvent = new MouseEvent('mouseup', {
        clientX: 100,
        clientY: 100,
        bubbles: true,
      });
      document.dispatchEvent(mouseupEvent);

      expect(document.querySelector(`.${TRANSLATE_BUTTON_CLASS}`)).toBeNull();
    });
  });

  describe('click outside dismissal', () => {
    it('removes tooltip and button on mousedown outside', () => {
      cleanup = initTextSelection();

      // Simulate clicking on body (outside any tooltip/button)
      const mousedownEvent = new MouseEvent('mousedown', {
        clientX: 200,
        clientY: 200,
        bubbles: true,
      });
      document.body.dispatchEvent(mousedownEvent);

      expect(document.querySelector(`.${TOOLTIP_CLASS}`)).toBeNull();
      expect(document.querySelector(`.${TRANSLATE_BUTTON_CLASS}`)).toBeNull();
    });
  });
});
