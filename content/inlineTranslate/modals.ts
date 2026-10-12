/**
 * Inline-translate modals: long-text confirm (refer `kce`) and the one-time
 * first-use guide. Shadow-DOM dialogs owned by the extension; settings writes
 * go through the injected `persist` callback.
 */

import type { InlineTranslateSettings } from '@/types/config';

export type InlineSettingsPatch = Partial<
  Pick<InlineTranslateSettings, 'confirmLongText' | 'inlineGuideShown' | 'enabled'>
>;
export type PersistInlineSettings = (patch: InlineSettingsPatch) => void | Promise<void>;

interface ModalAction<T> {
  id: string;
  label: string;
  value: T;
  primary?: boolean;
  onChoose?: () => void;
}

interface ModalSpec<T> {
  title: string;
  /** Trusted markup built in this module only. */
  bodyHtml: string;
  actions: ModalAction<T>[];
  /** Result for Escape, backdrop click or replacement by another modal. */
  dismissValue: T;
  onDismiss?: () => void;
}

const MODAL_CSS = `
:host { all: initial; }
.backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex;
  align-items: center; justify-content: center; }
[role="dialog"] { max-width: 380px; width: calc(100vw - 32px); box-sizing: border-box;
  background: #18181b; color: #e4e4e7; border: 1px solid #3f3f46; border-radius: 12px;
  padding: 18px; font: 13px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  box-shadow: 0 16px 48px rgba(0,0,0,.5); }
h2 { margin: 0 0 8px; font-size: 15px; color: #fafafa; }
p, ul { margin: 0 0 12px; } ul { padding-left: 18px; }
kbd { font-family: ui-monospace, monospace; font-size: 11px; padding: 1px 5px;
  border: 1px solid #52525b; border-radius: 4px; background: #27272a; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
button { all: unset; cursor: pointer; padding: 6px 12px; border-radius: 8px;
  border: 1px solid #3f3f46; color: #e4e4e7; }
button:hover { background: #27272a; }
button:focus-visible { outline: 2px solid #f59e0b; outline-offset: 1px; }
button.primary { background: #f59e0b; border-color: #f59e0b; color: #18181b; font-weight: 600; }
button.primary:hover { background: #fbbf24; }
`;

let active: { host: HTMLElement; dismiss: () => void } | null = null;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

function openModal<T>(spec: ModalSpec<T>): Promise<T> {
  closeInlineModal();

  return new Promise<T>((resolve) => {
    const host = document.createElement('div');
    host.setAttribute('data-anyllm-owned', '1');
    host.setAttribute('data-anyllm-role', 'inline-modal');
    Object.assign(host.style, { position: 'fixed', inset: '0', zIndex: '2147483647' });
    const shadow = host.attachShadow({ mode: 'open' });
    const buttons = spec.actions
      .map(
        (a) =>
          `<button type="button" data-action="${a.id}"${a.primary ? ' class="primary"' : ''}>${escapeHtml(a.label)}</button>`,
      )
      .join('');
    shadow.innerHTML = `<style>${MODAL_CSS}</style>
<div class="backdrop">
  <div role="dialog" aria-modal="true" aria-labelledby="anyllm-modal-title" tabindex="-1">
    <h2 id="anyllm-modal-title">${escapeHtml(spec.title)}</h2>
    ${spec.bodyHtml}
    <div class="actions">${buttons}</div>
  </div>
</div>`;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let settled = false;
    const settle = (value: T, effect?: () => void) => {
      if (settled) return;
      settled = true;
      if (active?.host === host) active = null;
      host.remove();
      effect?.();
      previousFocus?.focus?.();
      resolve(value);
    };

    for (const action of spec.actions) {
      shadow
        .querySelector(`[data-action="${action.id}"]`)
        ?.addEventListener('click', () => settle(action.value, action.onChoose));
    }
    const backdrop = shadow.querySelector('.backdrop');
    backdrop?.addEventListener('click', (event) => {
      if (event.target === backdrop) settle(spec.dismissValue, spec.onDismiss);
    });
    shadow.addEventListener('keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Escape') {
        event.stopPropagation();
        settle(spec.dismissValue, spec.onDismiss);
      }
    });

    document.body.appendChild(host);
    active = { host, dismiss: () => settle(spec.dismissValue, spec.onDismiss) };
    shadow.querySelector<HTMLElement>('button.primary')?.focus();
  });
}

/** Close the open modal, settling it with its dismiss value. */
export function closeInlineModal(): void {
  active?.dismiss();
  active = null;
}

/** Test helper: the modal host, if open. */
export function getInlineModal(): HTMLElement | null {
  return active?.host ?? null;
}

/** Long requests ask first; `confirmLongTextLength` 0 turns the prompt off. */
export function needsLongTextConfirm(
  textLength: number,
  cfg: Pick<InlineTranslateSettings, 'confirmLongText' | 'confirmLongTextLength'>,
): boolean {
  return cfg.confirmLongText !== false && cfg.confirmLongTextLength > 0 && textLength > cfg.confirmLongTextLength;
}

/** Resolves true to translate. "Don't ask again" translates and turns the prompt off. */
export function confirmLongText(options: {
  textLength: number;
  persist: PersistInlineSettings;
}): Promise<boolean> {
  return openModal<boolean>({
    title: 'Translate long text?',
    bodyHtml: `<p>This draft has ${options.textLength} characters. Translate it anyway?</p>`,
    actions: [
      {
        id: 'dont-ask',
        label: "Don't ask again",
        value: true,
        onChoose: () => void Promise.resolve(options.persist({ confirmLongText: false })).catch(() => {}),
      },
      { id: 'cancel', label: 'Cancel', value: false },
      { id: 'translate', label: 'Translate', value: true, primary: true },
    ],
    dismissValue: false,
  });
}

export function shouldShowFirstUseGuide(cfg: Pick<InlineTranslateSettings, 'inlineGuideShown'>): boolean {
  return cfg.inlineGuideShown !== true;
}

/** One-time guide on the first gesture fire. `'off'` disables the feature. */
export function showFirstUseGuide(options: {
  gestureLabel: string;
  shortcutLabel: string;
  persist: PersistInlineSettings;
}): Promise<'enable' | 'off'> {
  const markShown = () => void Promise.resolve(options.persist({ inlineGuideShown: true })).catch(() => {});
  return openModal<'enable' | 'off'>({
    title: 'Inline translation',
    bodyHtml: `<p>Translate what you type, right in the field:</p>
<ul>
  <li>Type, then press <kbd>${escapeHtml(options.gestureLabel)}</kbd> at the end of the text</li>
  <li>Or press <kbd>${escapeHtml(options.shortcutLabel)}</kbd></li>
  <li>Changed your mind? <kbd>Ctrl+Z</kbd> or the Undo button restores your draft</li>
</ul>`,
    actions: [
      {
        id: 'turn-off',
        label: 'Turn off',
        value: 'off',
        onChoose: () =>
          void Promise.resolve(options.persist({ inlineGuideShown: true, enabled: false })).catch(() => {}),
      },
      { id: 'enable', label: 'Enable', value: 'enable', primary: true, onChoose: markShown },
    ],
    dismissValue: 'enable',
    onDismiss: markShown,
  });
}
