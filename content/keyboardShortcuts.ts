/**
 * Keyboard Shortcuts — page-specific keydown listener for LinguaLens.
 * Handles Alt+H (toggle hover), Alt+D (toggle selection), Escape (dismiss tooltip).
 * Global shortcuts (Alt+A/S/Z/X) are handled via chrome.commands in background.
 */

import { setTextSelectionEnabled, isTextSelectionEnabled, removeTooltip, removeTranslateButton } from '@/content/textSelection';
import { setHoverTranslateEnabled, isHoverTranslateEnabled } from '@/content/hoverTranslate';

/** Shortcut definitions for page-specific shortcuts */
export interface ShortcutConfig {
  key: string;
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
      altKey: true,
      ctrlKey: false,
      shiftKey: false,
      description: 'Toggle hover translate',
      action: () => {
        const newState = !isHoverTranslateEnabled();
        setHoverTranslateEnabled(newState);
        console.log(`[LinguaLens] Hover translate: ${newState ? 'ON' : 'OFF'}`);
      },
    },
    {
      key: 'd',
      altKey: true,
      ctrlKey: false,
      shiftKey: false,
      description: 'Toggle text selection translate',
      action: () => {
        const newState = !isTextSelectionEnabled();
        setTextSelectionEnabled(newState);
        console.log(`[LinguaLens] Text selection translate: ${newState ? 'ON' : 'OFF'}`);
      },
    },
    {
      key: 'Escape',
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

/** Handle keydown events */
function onKeyDown(event: KeyboardEvent): void {
  for (const shortcut of activeShortcuts) {
    if (
      event.key.toLowerCase() === shortcut.key.toLowerCase() &&
      event.altKey === shortcut.altKey &&
      event.ctrlKey === shortcut.ctrlKey &&
      event.shiftKey === shortcut.shiftKey
    ) {
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
