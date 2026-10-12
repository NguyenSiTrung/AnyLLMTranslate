/**
 * Target-language bar shown after an inline write (refer `zR` / `Qce`):
 * language chip with a searchable menu, the source of the target language,
 * and Undo. Picking a language persists it and re-translates the original
 * draft; the bar auto-hides after a few idle seconds and reopens on field
 * focus while our translation is still in the field.
 */

import { getTargetLanguages, type Language } from '@/lib/languages';
import type { InlineTargetSource } from './orchestrate';

export const LANGUAGE_BAR_AUTO_HIDE_MS = 5000;

export interface LanguageBarOptions {
  field: HTMLElement;
  targetLanguage: string;
  source: InlineTargetSource;
  /** Original draft (from `undoMap`) for re-translation. */
  getOriginalDraft: () => string | undefined;
  /** True while the field still holds the translation we wrote. */
  isUnchanged: () => boolean;
  onRetarget: (lang: string, originalDraft: string) => void;
  onUndo: () => void;
  persistTargetLanguage: (lang: string) => void | Promise<void>;
  languages?: readonly Language[];
  autoHideMs?: number;
}

const BADGE: Record<InlineTargetSource, string> = {
  explicit: 'explicit',
  auto_selector: 'auto',
  auto_page: 'auto',
  default: 'default',
};

const BAR_CSS = `
:host { all: initial; }
.bar { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-radius: 8px;
  background: #18181b; border: 1px solid #3f3f46; color: #e4e4e7;
  font: 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
  box-shadow: 0 4px 16px rgba(0,0,0,.35); position: relative; }
button { all: unset; cursor: pointer; padding: 2px 8px; border-radius: 6px; }
button:hover, button:focus-visible { background: #27272a; }
button:focus-visible { outline: 2px solid #f59e0b; }
[data-part="chip"] { color: #fbbf24; font-weight: 600; }
[data-part="badge"] { font-size: 10px; text-transform: uppercase; letter-spacing: .04em;
  color: #a1a1aa; border: 1px solid #3f3f46; border-radius: 4px; padding: 0 4px; }
[data-part="menu"] { position: absolute; left: 0; top: calc(100% + 4px); width: 220px;
  max-height: 260px; overflow: auto; background: #18181b; border: 1px solid #3f3f46;
  border-radius: 8px; padding: 4px; box-shadow: 0 8px 24px rgba(0,0,0,.4); }
[data-part="search"] { all: unset; box-sizing: border-box; width: 100%; padding: 4px 6px;
  margin-bottom: 4px; border: 1px solid #3f3f46; border-radius: 6px; color: #e4e4e7; }
[data-lang] { display: flex; justify-content: space-between; width: 100%; box-sizing: border-box; }
[data-lang][hidden], [hidden] { display: none; }
[data-lang] small { color: #71717a; }
[aria-current="true"] { color: #fbbf24; }
`;

interface BarState {
  host: HTMLElement;
  options: LanguageBarOptions;
  hideTimer: ReturnType<typeof setTimeout> | null;
  cleanup: () => void;
}

let state: BarState | null = null;
/** Reopen-on-focus listener that survives an auto-hide. */
let reopen: { field: HTMLElement; listener: () => void } | null = null;

function clearReopen(): void {
  if (!reopen) return;
  reopen.field.removeEventListener('focus', reopen.listener);
  reopen = null;
}

function languageName(code: string, languages: readonly Language[]): string {
  return languages.find((l) => l.code === code)?.name ?? code;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

function position(host: HTMLElement, field: HTMLElement): void {
  const rect = field.getBoundingClientRect();
  host.style.left = `${Math.max(4, Math.min(rect.left, window.innerWidth - 260))}px`;
  const below = rect.bottom + 4;
  host.style.top = `${below + 36 <= window.innerHeight ? below : Math.max(4, rect.top - 40)}px`;
}

/** Remove the bar. `soft` keeps the reopen-on-focus listener (auto-hide). */
function teardown(soft: boolean): void {
  if (state) {
    if (state.hideTimer != null) clearTimeout(state.hideTimer);
    state.cleanup();
    state.host.remove();
    state = null;
  }
  if (!soft) clearReopen();
}

function armAutoHide(): void {
  if (!state) return;
  if (state.hideTimer != null) clearTimeout(state.hideTimer);
  const ms = state.options.autoHideMs ?? LANGUAGE_BAR_AUTO_HIDE_MS;
  state.hideTimer = setTimeout(() => teardown(true), ms);
}

function render(options: LanguageBarOptions): HTMLElement {
  const languages = options.languages ?? getTargetLanguages();
  const host = document.createElement('div');
  host.setAttribute('data-anyllm-owned', '1');
  host.setAttribute('data-anyllm-role', 'inline-language-bar');
  Object.assign(host.style, { position: 'fixed', zIndex: '2147483647' });

  const items = languages
    .map(
      (l) =>
        `<button type="button" role="option" data-lang="${escapeHtml(l.code)}"${
          l.code === options.targetLanguage ? ' aria-current="true"' : ''
        }><span>${escapeHtml(l.name)}</span><small>${escapeHtml(l.nativeName)}</small></button>`,
    )
    .join('');
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>${BAR_CSS}</style>
<div class="bar" role="toolbar" aria-label="Inline translation">
  <button type="button" data-part="chip" aria-haspopup="listbox" aria-expanded="false" title="Change target language">${escapeHtml(
    languageName(options.targetLanguage, languages),
  )} ▾</button>
  <span data-part="badge" title="Where the target language came from">${BADGE[options.source]}</span>
  <button type="button" data-part="undo" title="Restore the original text">Undo</button>
  <div data-part="menu" role="listbox" hidden>
    <input data-part="search" type="text" placeholder="Search language" aria-label="Search language">
    ${items}
  </div>
</div>`;
  return host;
}

function part<T extends Element>(root: ParentNode, name: string): T {
  const el = root.querySelector<T>(`[data-part="${name}"]`);
  if (!el) throw new Error(`language bar: missing ${name}`);
  return el;
}

function wire(host: HTMLElement, options: LanguageBarOptions): () => void {
  const root = host.shadowRoot;
  if (!root) return () => {};
  const menu = part<HTMLElement>(root, 'menu');
  const chip = part<HTMLElement>(root, 'chip');
  const search = part<HTMLInputElement>(root, 'search');
  const items = Array.from(root.querySelectorAll<HTMLElement>('[data-lang]'));

  const setMenu = (open: boolean) => {
    menu.hidden = !open;
    chip.setAttribute('aria-expanded', String(open));
    if (open) search.focus();
  };

  chip.addEventListener('click', () => setMenu(menu.hidden));
  part(root, 'undo').addEventListener('click', () => {
    teardown(false);
    options.onUndo();
  });
  search.addEventListener('input', () => {
    const term = search.value.trim().toLowerCase();
    for (const item of items) {
      const label = `${item.dataset.lang} ${item.textContent ?? ''}`.toLowerCase();
      item.hidden = term !== '' && !label.includes(term);
    }
  });
  for (const item of items) {
    item.addEventListener('click', () => {
      const lang = item.dataset.lang ?? '';
      const draft = options.getOriginalDraft();
      teardown(false);
      void Promise.resolve(options.persistTargetLanguage(lang)).catch(() => {});
      if (draft != null) options.onRetarget(lang, draft);
    });
  }
  root.addEventListener('keydown', (event) => {
    if ((event as KeyboardEvent).key !== 'Escape') return;
    if (!menu.hidden) setMenu(false);
    else teardown(false);
  });
  for (const type of ['pointermove', 'pointerdown', 'keydown', 'input', 'focusin']) {
    root.addEventListener(type, armAutoHide);
  }

  const onMove = () => position(host, options.field);
  window.addEventListener('scroll', onMove, true);
  window.addEventListener('resize', onMove);
  return () => {
    window.removeEventListener('scroll', onMove, true);
    window.removeEventListener('resize', onMove);
  };
}

/** Show the bar for `options.field`, replacing any bar already shown. */
export function showLanguageBar(options: LanguageBarOptions): void {
  teardown(false);
  if (!options.field.isConnected) return;

  const host = render(options);
  document.body.appendChild(host);
  position(host, options.field);
  state = { host, options, hideTimer: null, cleanup: wire(host, options) };
  armAutoHide();

  const listener = () => {
    if (state) return;
    if (!options.isUnchanged()) {
      clearReopen();
      return;
    }
    showLanguageBar(options);
  };
  options.field.addEventListener('focus', listener);
  reopen = { field: options.field, listener };
}

/** Close the bar and stop reopening it. */
export function hideLanguageBar(): void {
  teardown(false);
}

/** Test helper: the bar host, if shown. */
export function getLanguageBar(): HTMLElement | null {
  return state?.host ?? null;
}
