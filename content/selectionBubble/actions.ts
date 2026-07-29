/**
 * Footer action bar and status line for the selection dialog.
 */

import { createIcon } from './icons';
import type { BubbleActionHandlers, SelectionActionId } from './types';

export function buildFooterActions(args: {
  handlers: Pick<
    BubbleActionHandlers,
    'onCopy' | 'onRetry' | 'onSpeakOriginal' | 'onSpeakTranslation' | 'onGlossary'
  >;
  speaking?: boolean;
  disabled?: Partial<Record<SelectionActionId, boolean>>;
}): HTMLElement {
  const root = document.createElement('div');
  root.className = 'anyllm-selection-footer';
  root.setAttribute('data-anyllm-role', 'selection-footer');

  const row = document.createElement('div');
  row.className = 'anyllm-selection-footer-actions';

  const stopOrSpeak = args.speaking;
  const items: Array<{
    id: SelectionActionId;
    label: string;
    icon: 'copy' | 'retry' | 'speak' | 'stop' | 'glossary';
    handler: () => void | Promise<void>;
  }> = [
    { id: 'copy', label: 'Copy', icon: 'copy', handler: args.handlers.onCopy },
    { id: 'retry', label: 'Retry', icon: 'retry', handler: args.handlers.onRetry },
    {
      id: 'speak-original',
      label: stopOrSpeak ? 'Stop' : 'Speak original',
      icon: stopOrSpeak ? 'stop' : 'speak',
      handler: args.handlers.onSpeakOriginal,
    },
    {
      id: 'speak-translation',
      label: stopOrSpeak ? 'Stop' : 'Speak translation',
      icon: stopOrSpeak ? 'stop' : 'speak',
      handler: args.handlers.onSpeakTranslation,
    },
    {
      id: 'glossary',
      label: 'Add to glossary',
      icon: 'glossary',
      handler: args.handlers.onGlossary,
    },
  ];

  for (const item of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'anyllm-selection-action-btn';
    btn.setAttribute('data-anyllm-role', 'selection-action');
    btn.setAttribute('data-action', item.id);
    btn.setAttribute('aria-label', item.label);
    btn.setAttribute('title', item.label);
    if (args.disabled?.[item.id]) {
      btn.disabled = true;
    }
    // Visual hint so two speak buttons are distinguishable without text labels
    if (item.id === 'speak-original' && !stopOrSpeak) {
      btn.setAttribute('data-speak-target', 'original');
      const badge = document.createElement('span');
      badge.className = 'anyllm-selection-speak-badge';
      badge.setAttribute('aria-hidden', 'true');
      badge.textContent = 'A';
      btn.appendChild(createIcon(item.icon));
      btn.appendChild(badge);
    } else if (item.id === 'speak-translation' && !stopOrSpeak) {
      btn.setAttribute('data-speak-target', 'translation');
      const badge = document.createElement('span');
      badge.className = 'anyllm-selection-speak-badge';
      badge.setAttribute('aria-hidden', 'true');
      badge.textContent = '文';
      btn.appendChild(createIcon(item.icon));
      btn.appendChild(badge);
    } else {
      btn.appendChild(createIcon(item.icon));
    }
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      void item.handler();
    });
    row.appendChild(btn);
  }

  root.appendChild(row);

  const status = document.createElement('div');
  status.className = 'anyllm-selection-status';
  status.setAttribute('data-anyllm-role', 'selection-status');
  status.hidden = true;
  root.appendChild(status);

  return root;
}

export function setStatusLine(
  footerRoot: HTMLElement,
  message: string,
  kind: 'info' | 'success' | 'error' = 'info',
): void {
  const status = footerRoot.querySelector(
    '[data-anyllm-role="selection-status"]',
  ) as HTMLElement | null;
  if (!status) return;
  status.hidden = !message;
  status.textContent = message;
  status.dataset.kind = kind;
}

export function clearStatusLine(footerRoot: HTMLElement): void {
  setStatusLine(footerRoot, '', 'info');
  const status = footerRoot.querySelector(
    '[data-anyllm-role="selection-status"]',
  ) as HTMLElement | null;
  if (status) {
    status.hidden = true;
    delete status.dataset.kind;
  }
}
