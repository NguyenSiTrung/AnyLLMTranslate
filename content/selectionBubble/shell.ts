/**
 * Selection dialog shell — lifecycle, pin, reposition, content modes.
 */

import { getLanguageNativeName } from '@/lib/languages';
import type { SelectionDictionaryPayload } from '@/types/messages';
import {
  buildFooterActions,
  clearStatusLine,
  setStatusLine,
} from './actions';
import { buildDictionaryContent } from './contentDictionary';
import { buildErrorContent } from './contentError';
import { buildLoadingContent } from './contentLoading';
import { buildSentenceContent } from './contentSentence';
import { createIcon } from './icons';
import { computeBubblePosition } from './position';
import type {
  AnchorRect,
  BubbleActionHandlers,
  BubbleMode,
} from './types';
import { DIALOG_CLASS, DIALOG_LEGACY_CLASS } from './types';

export interface ShellShowLoadingArgs {
  anchor: AnchorRect;
  originalText: string;
  sourceLanguage: string;
  targetLanguage: string;
  handlers: BubbleActionHandlers;
}

let dialogEl: HTMLElement | null = null;
let pinned = false;
let currentAnchor: AnchorRect | null = null;
let currentHandlers: BubbleActionHandlers | null = null;
let sourceLanguage = 'auto';
let targetLanguage = 'en';
let originalExpanded = false;
let lastMode: BubbleMode = 'loading';
let lastOriginalText = '';
let lastTranslatedText = '';
let lastDictionary: SelectionDictionaryPayload | null = null;
let lastError = '';
let speaking = false;
let statusClearTimer: ReturnType<typeof setTimeout> | null = null;

function langLabel(code: string): string {
  if (code === 'auto') return 'Auto';
  try {
    return getLanguageNativeName(code) || code;
  } catch {
    return code;
  }
}

function clearBody(body: HTMLElement): void {
  while (body.firstChild) body.removeChild(body.firstChild);
}

function getBody(): HTMLElement | null {
  return dialogEl?.querySelector(
    '[data-anyllm-role="selection-body"]',
  ) as HTMLElement | null;
}

function getFooter(): HTMLElement | null {
  return dialogEl?.querySelector(
    '[data-anyllm-role="selection-footer"]',
  ) as HTMLElement | null;
}

function updatePinButton(): void {
  const pinBtn = dialogEl?.querySelector(
    '[data-action="pin"]',
  ) as HTMLButtonElement | null;
  if (!pinBtn) return;
  pinBtn.setAttribute('aria-pressed', pinned ? 'true' : 'false');
  pinBtn.classList.toggle('is-active', pinned);
  pinBtn.setAttribute('title', pinned ? 'Unpin' : 'Pin');
  pinBtn.setAttribute('aria-label', pinned ? 'Unpin' : 'Pin');
}

function rebuildFooter(): void {
  if (!dialogEl || !currentHandlers) return;
  const old = getFooter();
  const next = buildFooterActions({
    handlers: {
      onCopy: currentHandlers.onCopy,
      onRetry: currentHandlers.onRetry,
      onSpeakOriginal: currentHandlers.onSpeakOriginal,
      onSpeakTranslation: currentHandlers.onSpeakTranslation,
      onGlossary: currentHandlers.onGlossary,
    },
    speaking,
    disabled: {
      copy: lastMode === 'loading' || (!lastTranslatedText && lastMode !== 'error'),
      retry: lastMode === 'loading',
      'speak-original':
        lastMode === 'loading' || !lastOriginalText,
      'speak-translation':
        lastMode === 'loading' || !lastTranslatedText,
      glossary: lastMode === 'loading' || !lastTranslatedText || !lastOriginalText,
    },
  });
  if (old) {
    old.replaceWith(next);
  } else {
    dialogEl.appendChild(next);
  }
}

function fillBodyFromState(): void {
  const body = getBody();
  if (!body || !currentHandlers) return;
  clearBody(body);

  if (lastMode === 'loading') {
    body.appendChild(buildLoadingContent(lastOriginalText));
  } else if (lastMode === 'error') {
    body.appendChild(buildErrorContent(lastError));
  } else if (lastMode === 'dictionary' && lastDictionary) {
    body.appendChild(
      buildDictionaryContent(lastOriginalText, lastDictionary, lastTranslatedText),
    );
  } else {
    body.appendChild(
      buildSentenceContent({
        translatedText: lastTranslatedText,
        originalText: lastOriginalText,
        originalExpanded,
        onToggleOriginal: () => {
          originalExpanded = !originalExpanded;
          fillBodyFromState();
          reposition();
        },
      }),
    );
  }
  rebuildFooter();
}

function buildShellChrome(handlers: BubbleActionHandlers): HTMLElement {
  const root = document.createElement('div');
  root.className = `${DIALOG_CLASS} ${DIALOG_LEGACY_CLASS}`;
  root.setAttribute('data-anyllm-role', 'selection-dialog');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Translation');
  root.setAttribute('aria-modal', 'false');

  const caret = document.createElement('div');
  caret.className = 'anyllm-selection-caret';
  caret.setAttribute('data-anyllm-role', 'selection-caret');
  caret.setAttribute('aria-hidden', 'true');
  root.appendChild(caret);

  const header = document.createElement('div');
  header.className = 'anyllm-selection-header';
  header.setAttribute('data-anyllm-role', 'selection-header');

  const lang = document.createElement('div');
  lang.className = 'anyllm-selection-lang';
  lang.setAttribute('data-anyllm-role', 'selection-lang');
  lang.textContent = `${langLabel(sourceLanguage)} → ${langLabel(targetLanguage)}`;
  header.appendChild(lang);

  const headerActions = document.createElement('div');
  headerActions.className = 'anyllm-selection-header-actions';

  const pinBtn = document.createElement('button');
  pinBtn.type = 'button';
  pinBtn.className = 'anyllm-selection-header-btn';
  pinBtn.setAttribute('data-action', 'pin');
  pinBtn.setAttribute('aria-pressed', 'false');
  pinBtn.setAttribute('aria-label', 'Pin');
  pinBtn.setAttribute('title', 'Pin');
  pinBtn.appendChild(createIcon('pin'));
  pinBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handlers.onPin();
  });
  headerActions.appendChild(pinBtn);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'anyllm-selection-header-btn';
  closeBtn.setAttribute('data-action', 'close');
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.setAttribute('title', 'Close');
  closeBtn.appendChild(createIcon('close'));
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handlers.onClose();
  });
  headerActions.appendChild(closeBtn);

  header.appendChild(headerActions);
  root.appendChild(header);

  const body = document.createElement('div');
  body.className = 'anyllm-selection-body';
  body.setAttribute('data-anyllm-role', 'selection-body');
  body.setAttribute('aria-live', 'polite');
  root.appendChild(body);

  return root;
}

export function getDialogEl(): HTMLElement | null {
  return dialogEl;
}

export function isPinned(): boolean {
  return pinned;
}

export function setPinned(next: boolean): void {
  pinned = next;
  updatePinButton();
}

export function shouldDismissOnOutsideClick(): boolean {
  return !pinned;
}

export function setSpeakingState(next: boolean): void {
  speaking = next;
  rebuildFooter();
}

export function showStatus(
  message: string,
  kind: 'info' | 'success' | 'error' = 'info',
): void {
  const footer = getFooter();
  if (!footer) return;
  setStatusLine(footer, message, kind);
  if (statusClearTimer) clearTimeout(statusClearTimer);
  if (kind !== 'error' && message) {
    statusClearTimer = setTimeout(() => {
      const f = getFooter();
      if (f) clearStatusLine(f);
    }, 2000);
  }
}

export function reposition(): void {
  if (!dialogEl || !currentAnchor) return;
  const rect = dialogEl.getBoundingClientRect();
  const size = {
    width: rect.width || 320,
    height: rect.height || 120,
  };
  const result = computeBubblePosition({
    anchor: currentAnchor,
    size,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  });
  dialogEl.style.left = `${result.left}px`;
  dialogEl.style.top = `${result.top}px`;
  dialogEl.setAttribute('data-placement', result.placement);
}

export function showLoading(args: ShellShowLoadingArgs): HTMLElement {
  const keepPin = pinned;
  // Remove previous DOM but preserve pin if already pinned (in-place replace)
  if (dialogEl) {
    dialogEl.remove();
    dialogEl = null;
  }

  currentAnchor = args.anchor;
  currentHandlers = args.handlers;
  sourceLanguage = args.sourceLanguage;
  targetLanguage = args.targetLanguage;
  lastOriginalText = args.originalText;
  lastTranslatedText = '';
  lastDictionary = null;
  lastError = '';
  lastMode = 'loading';
  originalExpanded = false;
  speaking = false;
  pinned = keepPin;

  const root = buildShellChrome(args.handlers);
  document.body.appendChild(root);
  dialogEl = root;

  fillBodyFromState();
  updatePinButton();
  reposition();
  // Second pass after layout
  requestAnimationFrame(() => reposition());

  return root;
}

export function applySentence(args: {
  translatedText: string;
  originalText: string;
}): void {
  if (!dialogEl) return;
  lastMode = 'sentence';
  lastTranslatedText = args.translatedText;
  lastOriginalText = args.originalText;
  lastDictionary = null;
  lastError = '';
  fillBodyFromState();
  reposition();
  requestAnimationFrame(() => reposition());
}

export function applyDictionary(args: {
  originalText: string;
  dict: SelectionDictionaryPayload;
  translatedText: string;
}): void {
  if (!dialogEl) return;
  lastMode = 'dictionary';
  lastOriginalText = args.originalText;
  lastDictionary = args.dict;
  lastTranslatedText =
    args.dict.translation || args.translatedText || args.originalText;
  lastError = '';
  fillBodyFromState();
  reposition();
  requestAnimationFrame(() => reposition());
}

export function applyError(message: string): void {
  if (!dialogEl) return;
  lastMode = 'error';
  lastError = message;
  lastTranslatedText = '';
  lastDictionary = null;
  fillBodyFromState();
  reposition();
  requestAnimationFrame(() => reposition());
}

export function removeDialog(): void {
  if (statusClearTimer) {
    clearTimeout(statusClearTimer);
    statusClearTimer = null;
  }
  if (dialogEl) {
    dialogEl.remove();
    dialogEl = null;
  }
  pinned = false;
  currentAnchor = null;
  currentHandlers = null;
  lastMode = 'loading';
  lastOriginalText = '';
  lastTranslatedText = '';
  lastDictionary = null;
  lastError = '';
  originalExpanded = false;
  speaking = false;
}

export function getPrimaryText(): string {
  return lastTranslatedText;
}

export function getOriginalText(): string {
  return lastOriginalText;
}

export function getTargetLanguage(): string {
  return targetLanguage;
}

export function getSourceLanguage(): string {
  return sourceLanguage;
}

/** Test-only: set module dialog reference for applySelectionResponse unit tests. */
export function __setDialogForTest(el: HTMLElement | null): void {
  dialogEl = el;
  if (el) {
    currentHandlers = currentHandlers ?? {
      onCopy: () => {},
      onRetry: () => {},
      onSpeakOriginal: () => {},
      onSpeakTranslation: () => {},
      onGlossary: () => {},
      onPin: () => {},
      onClose: () => {},
    };
  }
}
