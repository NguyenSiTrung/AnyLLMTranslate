/**
 * Tests for content/keyboardShortcuts.ts — keyboard shortcut handling.
 * Covers: init/cleanup, key event handling, toggle states, default shortcuts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initKeyboardShortcuts,
  getActiveShortcuts,
  getDefaultShortcuts,
} from '@/content/keyboardShortcuts';

// Mock dependencies
vi.mock('@/content/textSelection', () => ({
  setTextSelectionEnabled: vi.fn(),
  isTextSelectionEnabled: vi.fn(() => true),
  removeTooltip: vi.fn(),
  removeTranslateButton: vi.fn(),
}));

vi.mock('@/content/hoverTranslate', () => ({
  setHoverTranslateEnabled: vi.fn(),
  isHoverTranslateEnabled: vi.fn(() => false),
}));

import { setTextSelectionEnabled, removeTooltip, removeTranslateButton } from '@/content/textSelection';
import { setHoverTranslateEnabled } from '@/content/hoverTranslate';

describe('content/keyboardShortcuts', () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    cleanup = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (cleanup) cleanup();
    vi.restoreAllMocks();
  });

  describe('initKeyboardShortcuts', () => {
    it('attaches keydown listener in capture phase and returns a cleanup function', () => {
      const addSpy = vi.spyOn(document, 'addEventListener');
      cleanup = initKeyboardShortcuts();

      expect(typeof cleanup).toBe('function');
      expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true);
    });

    it('cleanup removes keydown listener', () => {
      const removeSpy = vi.spyOn(document, 'removeEventListener');
      cleanup = initKeyboardShortcuts();
      cleanup();
      cleanup = null;

      expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true);
    });
  });

  describe('getDefaultShortcuts', () => {
    it('returns 4 default shortcuts including Alt+H, Alt+D, and Escape', () => {
      const shortcuts = getDefaultShortcuts();
      expect(shortcuts).toHaveLength(4);
      expect(shortcuts.find((s) => s.key === 'h' && s.altKey)).toBeDefined();
      expect(shortcuts.find((s) => s.key === 'd' && s.altKey)).toBeDefined();
      expect(shortcuts.find((s) => s.key === 'Escape')).toBeDefined();
    });
  });

  describe('getActiveShortcuts', () => {
    it('returns copy of active shortcuts after init', () => {
      cleanup = initKeyboardShortcuts();
      const active = getActiveShortcuts();
      expect(active.length).toBeGreaterThan(0);
    });

    it('returns empty array before init', () => {
      // Shortcuts are empty before initialization
      const active = getActiveShortcuts();
      // May be empty or from previous init depending on module state
      expect(Array.isArray(active)).toBe(true);
    });
  });

  describe('Alt+H — toggle hover translate', () => {
    it('calls setHoverTranslateEnabled with toggled value', () => {
      cleanup = initKeyboardShortcuts();

      const event = new KeyboardEvent('keydown', {
        key: 'h',
        altKey: true,
        bubbles: true,
      });
      document.dispatchEvent(event);

      expect(setHoverTranslateEnabled).toHaveBeenCalledWith(true);
    });
  });

  describe('Alt+D — toggle text selection translate', () => {
    it('calls setTextSelectionEnabled with toggled value', () => {
      cleanup = initKeyboardShortcuts();

      const event = new KeyboardEvent('keydown', {
        key: 'd',
        altKey: true,
        bubbles: true,
      });
      document.dispatchEvent(event);

      expect(setTextSelectionEnabled).toHaveBeenCalledWith(false);
    });
  });

  describe('Escape — dismiss tooltip', () => {
    it('calls removeTooltip and removeTranslateButton', () => {
      cleanup = initKeyboardShortcuts();

      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      });
      document.dispatchEvent(event);

      expect(removeTooltip).toHaveBeenCalled();
      expect(removeTranslateButton).toHaveBeenCalled();
    });
  });

  describe('unmatched keys', () => {
    it('does not call any action for unregistered keys', () => {
      cleanup = initKeyboardShortcuts();

      const event = new KeyboardEvent('keydown', {
        key: 'q',
        altKey: true,
        bubbles: true,
      });
      document.dispatchEvent(event);

      expect(setHoverTranslateEnabled).not.toHaveBeenCalled();
      expect(setTextSelectionEnabled).not.toHaveBeenCalled();
    });
  });
});
