/**
 * Page keyboard shortcuts — code-based matching + feedback.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  setTextSelectionEnabled,
  isTextSelectionEnabled,
  removeTooltip,
  removeTranslateButton,
  setHoverTranslateEnabled,
  isHoverTranslateEnabled,
  enterPickerMode,
  isPickerActive,
  exitPickerMode,
  translateSection,
  showSubtitleToast,
} = vi.hoisted(() => ({
  setTextSelectionEnabled: vi.fn(),
  isTextSelectionEnabled: vi.fn(() => false),
  removeTooltip: vi.fn(),
  removeTranslateButton: vi.fn(),
  setHoverTranslateEnabled: vi.fn(),
  isHoverTranslateEnabled: vi.fn(() => false),
  enterPickerMode: vi.fn(),
  isPickerActive: vi.fn(() => false),
  exitPickerMode: vi.fn(),
  translateSection: vi.fn(),
  showSubtitleToast: vi.fn(),
}));

vi.mock('@/content/textSelection', () => ({
  setTextSelectionEnabled,
  isTextSelectionEnabled,
  removeTooltip,
  removeTranslateButton,
}));

vi.mock('@/content/hoverTranslate', () => ({
  setHoverTranslateEnabled,
  isHoverTranslateEnabled,
}));

vi.mock('@/content/sectionPicker', () => ({
  enterPickerMode,
  isPickerActive,
  exitPickerMode,
}));

vi.mock('@/content/sectionTranslate', () => ({
  translateSection,
}));

vi.mock('@/content/subtitleToast', () => ({
  showSubtitleToast,
  hideSubtitleToast: vi.fn(),
}));

import { initKeyboardShortcuts } from '@/content/keyboardShortcuts';

function dispatchKeydown(init: KeyboardEventInit): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
}

describe('initKeyboardShortcuts', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    isHoverTranslateEnabled.mockReturnValue(false);
    isTextSelectionEnabled.mockReturnValue(false);
    isPickerActive.mockReturnValue(false);
    cleanup = initKeyboardShortcuts();
  });

  afterEach(() => {
    cleanup?.();
  });

  it('toggles hover (Alt+H), selection (Alt+D), and section picker (Alt+Q) via event.code when Alt remaps event.key (Linux-style)', () => {
    // Alt+letter shortcuts often produce a remapped event.key on Linux; code stays Key*
    dispatchKeydown({ key: 'ħ', code: 'KeyH', altKey: true });
    expect(setHoverTranslateEnabled).toHaveBeenCalledWith(true);
    expect(showSubtitleToast).toHaveBeenCalledWith(expect.stringMatching(/hover/i));

    dispatchKeydown({ key: '∂', code: 'KeyD', altKey: true });
    expect(setTextSelectionEnabled).toHaveBeenCalledWith(true);
    expect(showSubtitleToast).toHaveBeenCalledWith(expect.stringMatching(/selection/i));

    dispatchKeydown({ key: 'œ', code: 'KeyQ', altKey: true });
    expect(enterPickerMode).toHaveBeenCalled();
  });

  it('dismisses tooltip on Escape', () => {
    dispatchKeydown({ key: 'Escape', code: 'Escape' });
    expect(removeTooltip).toHaveBeenCalled();
    expect(removeTranslateButton).toHaveBeenCalled();
  });

  it('does not fire when Alt is missing for letter shortcuts', () => {
    dispatchKeydown({ key: 'h', code: 'KeyH', altKey: false });
    expect(setHoverTranslateEnabled).not.toHaveBeenCalled();
  });
});
