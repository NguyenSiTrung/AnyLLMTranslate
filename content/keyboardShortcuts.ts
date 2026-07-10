/**
 * Keyboard Shortcuts — page-specific keydown listener for AnyLLMTranslate.
 * Handles Alt+H (toggle hover), Alt+D (toggle selection), Alt+Q (section picker),
 * Escape (dismiss tooltip).
 * Global shortcuts (Alt+A/S/Z/X) are handled via chrome.commands in background.
 *
 * Matching uses KeyboardEvent.code for letter keys so Alt combinations work when
 * the OS remaps event.key (common on Linux / non-US layouts).
 */

import {
  setTextSelectionEnabled,
  isTextSelectionEnabled,
  removeTooltip,
  removeTranslateButton,
} from '@/content/textSelection';
import { setHoverTranslateEnabled, isHoverTranslateEnabled } from '@/content/hoverTranslate';
import { enterPickerMode, isPickerActive, exitPickerMode } from '@/content/sectionPicker';
import { translateSection } from '@/content/sectionTranslate';
import { showSubtitleToast } from '@/content/subtitleToast';

/** Shortcut definitions for page-specific shortcuts */
export interface ShortcutConfig {
  /** Logical key fallback (Escape, or letter for older paths). */
  key: string;
  /**
   * Physical key code preferred for matching (e.g. KeyH).
   * When set, event.code is required to match — more reliable with Alt.
   */
  code?: string;
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  description: string;
  action: () => void;
}

/** Default page-specific shortcuts */
function getDefaultShortcuts(): ShortcutConfig[] {
  return [
    {
      key: 'h',
      code: 'KeyH',
      altKey: true,
      ctrlKey: false,
      shiftKey: false,
      description: 'Toggle hover translate',
      action: () => {
        const newState = !isHoverTranslateEnabled();
        setHoverTranslateEnabled(newState);
        showSubtitleToast(newState ? 'Hover translate: ON' : 'Hover translate: OFF');
        console.log(`[AnyLLMTranslate] Hover translate: ${newState ? 'ON' : 'OFF'}`);
      },
    },
    {
      key: 'd',
      code: 'KeyD',
      altKey: true,
      ctrlKey: false,
      shiftKey: false,
      description: 'Toggle text selection translate',
      action: () => {
        const newState = !isTextSelectionEnabled();
        setTextSelectionEnabled(newState);
        showSubtitleToast(newState ? 'Selection translate: ON' : 'Selection translate: OFF');
        console.log(`[AnyLLMTranslate] Text selection translate: ${newState ? 'ON' : 'OFF'}`);
      },
    },
    {
      key: 'q',
      code: 'KeyQ',
      altKey: true,
      ctrlKey: false,
      shiftKey: false,
      description: 'Translate section (picker mode)',
      action: () => {
        if (isPickerActive()) {
          exitPickerMode();
          showSubtitleToast('Section picker: OFF');
        } else {
          enterPickerMode((el) => translateSection(el));
          showSubtitleToast('Section picker: click a block');
        }
      },
    },
    {
      key: 'Escape',
      code: 'Escape',
      altKey: false,
      ctrlKey: false,
      shiftKey: false,
      description: 'Dismiss tooltip',
      action: () => {
        removeTooltip();
        removeTranslateButton();
      },
    },
  ];
}

/** Active shortcuts (can be customized) */
let activeShortcuts: ShortcutConfig[] = [];

/** Match key using code (preferred) or key string; respect modifiers. */
export function matchesShortcut(event: KeyboardEvent, shortcut: ShortcutConfig): boolean {
  if (
    event.altKey !== shortcut.altKey ||
    event.ctrlKey !== shortcut.ctrlKey ||
    event.shiftKey !== shortcut.shiftKey
  ) {
    return false;
  }

  if (shortcut.code) {
    return event.code === shortcut.code;
  }

  return event.key.toLowerCase() === shortcut.key.toLowerCase();
}

/** Handle keydown events */
function onKeyDown(event: KeyboardEvent): void {
  for (const shortcut of activeShortcuts) {
    if (matchesShortcut(event, shortcut)) {
      event.preventDefault();
      event.stopPropagation();
      shortcut.action();
      return;
    }
  }
}

/** Initialize keyboard shortcuts */
export function initKeyboardShortcuts(): () => void {
  activeShortcuts = getDefaultShortcuts();
  document.addEventListener('keydown', onKeyDown, true);

  return () => {
    document.removeEventListener('keydown', onKeyDown, true);
    activeShortcuts = [];
  };
}

/** Update shortcuts config (for customization from settings) */
export function updateShortcuts(shortcuts: ShortcutConfig[]): void {
  activeShortcuts = shortcuts;
}

/** Get current active shortcuts for display */
export function getActiveShortcuts(): ShortcutConfig[] {
  return [...activeShortcuts];
}

export { getDefaultShortcuts };
