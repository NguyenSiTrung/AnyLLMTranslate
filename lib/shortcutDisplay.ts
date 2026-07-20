/**
 * Pure display helpers for Shortcut Studio (Settings → Shortcuts).
 * Keep aligned with chrome.commands in wxt.config.ts and page keys in
 * content/keyboardShortcuts.ts (display only — no runtime wiring here).
 */

export type ShortcutScope = 'global' | 'page' | 'gesture';
export type ScopeFilter = 'all' | ShortcutScope;

export interface ShortcutDisplayRow {
  id: string;
  scope: ShortcutScope;
  label: string;
  description: string;
  where: string;
  /** Raw shortcut string from API or fixed binding (may be empty). */
  shortcut: string;
  /** Searchable / cheatsheet key text. */
  keyLabel: string;
}

export const GLOBAL_COMMAND_ORDER = [
  'translate-page',
  'translate-subtitles',
  'toggle-display',
  'restore-page',
  'translate-input-box',
] as const;

export const GLOBAL_COMMAND_META: Record<string, { label: string; description: string }> = {
  'translate-page': {
    label: 'Translate page',
    description: 'Start page translation on the active tab',
  },
  'translate-subtitles': {
    label: 'Translate subtitles',
    description: 'Start video subtitle translation',
  },
  'toggle-display': {
    label: 'Toggle display',
    description: 'Show or hide existing translations',
  },
  'restore-page': {
    label: 'Restore page',
    description: 'Remove translations and restore the original page',
  },
  'translate-input-box': {
    label: 'Inline translate',
    description: 'Translate the focused input box',
  },
};

/** Documented defaults when chrome.commands is unavailable (tests / non-extension). */
export const DEFAULT_GLOBAL_SHORTCUTS: Record<string, string> = {
  'translate-page': 'Alt+A',
  'translate-subtitles': 'Alt+S',
  'toggle-display': 'Alt+Z',
  'restore-page': 'Alt+X',
  'translate-input-box': '',
};

const GLOBAL_WHERE = 'Any tab (when the page is focused)';
/** Content-script keys only run on normal web pages — not Settings/popup. */
const PAGE_WHERE = 'Normal websites only (http/https) — not this Settings page';

/** Mirrors content/keyboardShortcuts.ts defaults (labels only). */
export const PAGE_SHORTCUT_ROWS: ShortcutDisplayRow[] = [
  {
    id: 'page-hover',
    scope: 'page',
    label: 'Toggle hover translate',
    description: 'Turn hover translate on/off (toast confirms). Default is often off until you toggle.',
    where: PAGE_WHERE,
    shortcut: 'Alt+H',
    keyLabel: 'Alt+H',
  },
  {
    id: 'page-selection',
    scope: 'page',
    label: 'Toggle selection translate',
    description: 'Turn selection translate on/off (toast confirms)',
    where: PAGE_WHERE,
    shortcut: 'Alt+D',
    keyLabel: 'Alt+D',
  },
  {
    id: 'page-section-picker',
    scope: 'page',
    label: 'Translate section (picker)',
    description: 'Enter or exit section picker mode, then click a block to translate',
    where: PAGE_WHERE,
    shortcut: 'Alt+Q',
    keyLabel: 'Alt+Q',
  },
  {
    id: 'page-dismiss',
    scope: 'page',
    label: 'Dismiss tooltip',
    description: 'Closes the selection tooltip or floating translate button when one is open',
    where: PAGE_WHERE,
    shortcut: 'Escape',
    keyLabel: 'Escape',
  },
];

export function formatGestureLabel(tapCount: number): string {
  return `Space × ${tapCount}`;
}

export function buildGestureRow(tapCount: number, timeWindowMs: number): ShortcutDisplayRow {
  const shortcut = formatGestureLabel(tapCount);
  return {
    id: 'gesture-inline',
    scope: 'gesture',
    label: 'Inline input gesture',
    description: `Translate focused input after the gesture (within ${timeWindowMs}ms). Same pipeline as Inline translate global command.`,
    where: 'Text fields on pages that are not blocklisted',
    shortcut,
    keyLabel: shortcut,
  };
}

function keyLabelFor(shortcut: string): string {
  return shortcut.trim() || '(not set)';
}

export function parseShortcutKeys(shortcut: string): string[] {
  const s = shortcut.trim();
  if (!s) return [];
  // Gesture / compound labels that must not split on +
  if (/×/.test(s) || /^space\b/i.test(s)) return [s];
  if (!s.includes('+')) return [s];
  return s
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);
}

export function buildGlobalRows(
  commands: Array<{ name: string; description?: string; shortcut?: string }>,
): ShortcutDisplayRow[] {
  const byName = new Map(commands.map((c) => [c.name, c]));
  const rows: ShortcutDisplayRow[] = [];

  for (const id of GLOBAL_COMMAND_ORDER) {
    const meta = GLOBAL_COMMAND_META[id];
    if (!meta) continue;
    const api = byName.get(id);
    const hasApi = Boolean(api);
    const shortcut = hasApi
      ? (api?.shortcut ?? '').trim()
      : (DEFAULT_GLOBAL_SHORTCUTS[id] ?? '');
    rows.push({
      id,
      scope: 'global',
      label: meta.label,
      description: meta.description,
      where: GLOBAL_WHERE,
      shortcut,
      keyLabel: keyLabelFor(shortcut),
    });
    byName.delete(id);
  }

  // Unknown future commands from API
  for (const [name, api] of byName) {
    if (!name || name.startsWith('_')) continue;
    const shortcut = (api.shortcut ?? '').trim();
    rows.push({
      id: name,
      scope: 'global',
      label: api.description?.trim() || name,
      description: api.description?.trim() || name,
      where: GLOBAL_WHERE,
      shortcut,
      keyLabel: keyLabelFor(shortcut),
    });
  }

  return rows;
}

export function countGlobalBound(rows: ShortcutDisplayRow[]): { bound: number; total: number } {
  const global = rows.filter((r) => r.scope === 'global');
  const total = global.length;
  const bound = global.filter((r) => r.shortcut.trim().length > 0).length;
  return { bound, total };
}

export function filterShortcutRows(
  rows: ShortcutDisplayRow[],
  query: string,
  scope: ScopeFilter,
): ShortcutDisplayRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter((r) => {
    if (scope !== 'all' && r.scope !== scope) return false;
    if (!q) return true;
    const hay = [r.label, r.description, r.keyLabel, r.shortcut, r.id, r.where]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

export function groupRowsByScope(rows: ShortcutDisplayRow[]): {
  global: ShortcutDisplayRow[];
  page: ShortcutDisplayRow[];
  gesture: ShortcutDisplayRow[];
} {
  return {
    global: rows.filter((r) => r.scope === 'global'),
    page: rows.filter((r) => r.scope === 'page'),
    gesture: rows.filter((r) => r.scope === 'gesture'),
  };
}

const SCOPE_HEADERS: Record<ShortcutScope, string> = {
  global: 'Global',
  page: 'Page',
  gesture: 'Gestures',
};

export function formatCheatsheet(rows: ShortcutDisplayRow[]): string {
  const lines = ['AnyLLMTranslate shortcuts', ''];
  const grouped = groupRowsByScope(rows);
  for (const scope of ['global', 'page', 'gesture'] as const) {
    const list = grouped[scope];
    if (list.length === 0) continue;
    lines.push(SCOPE_HEADERS[scope]);
    for (const r of list) {
      const key = r.shortcut.trim() ? r.shortcut.trim() : '(not set)';
      lines.push(`- ${r.label}: ${key}`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}
