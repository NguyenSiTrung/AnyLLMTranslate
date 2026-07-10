# Shortcut Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Settings → Shortcuts into Shortcut Studio: live `chrome.commands` bindings, page + gesture inventory, search/scope filter, copy cheatsheet, and Manage CTA — with accurate keys and craft parity with other 2026-07 options tabs.

**Architecture:** Pure helpers in `lib/shortcutDisplay.ts` own metadata, key parsing, filtering, and cheatsheet text. Presentational pieces (`KeyCapSequence`, `ShortcutRow`, `ShortcutGroup`, `ShortcutStudioBar`) compose into a rewritten `ShortcutsSection`. Global bindings load via `chrome.commands.getAll()` on mount and `visibilitychange`; gesture data reads `inlineTranslate` from the settings store. No new schema keys; no handler/rebinding changes.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Lucide React, Zustand, Vitest + Testing Library (jsdom for `entrypoints/**`), WXT / Chrome extension APIs.

**Spec:** `docs/superpowers/specs/2026-07-10-shortcut-studio-design.md`  
**Beads:** ALT-ia6

## Global Constraints

- No new settings schema keys — UI-only state (`searchQuery`, `scopeFilter`).
- Do **not** change `wxt.config.ts` command defaults or `content/keyboardShortcuts.ts` behavior.
- Do **not** implement in-app rebinding.
- Global rows must never show stale **Alt+T** / **Alt+O** as defaults; use Alt+A/S/Z/X + unbound inline.
- Prefer pure functions for parse/filter/format (unit-test without DOM).
- Chrome API access only in section/bar side effects — not inside `lib/shortcutDisplay.ts`.
- Zinc dark chrome; section accent **orange**; Manage uses primary `Button`; **Not set** uses `Badge` `warning`.
- No purple-first styling.
- Toast via `useToast()` from `@/ui/ToastProvider` for copy success/failure and Manage failure.

---

## File map

| File | Action | Responsibility |
|------|--------|----------------|
| `lib/shortcutDisplay.ts` | Create | Command/page metadata, parse keys, filter, cheatsheet, bound count |
| `lib/__tests__/shortcutDisplay.test.ts` | Create | Unit tests for pure helpers |
| `entrypoints/options/components/KeyCapSequence.tsx` | Create | Key chip sequence UI |
| `entrypoints/options/components/ShortcutRow.tsx` | Create | Single shortcut row |
| `entrypoints/options/components/ShortcutGroup.tsx` | Create | Card + list of rows |
| `entrypoints/options/components/ShortcutStudioBar.tsx` | Create | Search, scope, status, Copy, Manage |
| `entrypoints/options/sections/ShortcutsSection.tsx` | Rewrite | Compose studio IA |
| `entrypoints/options/App.tsx` | Modify | Pass `onNavigateToInline` into Shortcuts |
| `entrypoints/options/sections/__tests__/ShortcutsSection.test.tsx` | Create | Section smoke + filter/copy/manage |

**Do not modify:** `content/keyboardShortcuts.ts` handlers, `entrypoints/background.ts` command routing, `wxt.config.ts` commands, `types/config` schema.

---

### Task 1: Pure display helpers (TDD)

**Files:**
- Create: `lib/shortcutDisplay.ts`
- Create: `lib/__tests__/shortcutDisplay.test.ts`

**Interfaces:**
- Consumes: none (pure)
- Produces:
  - `export type ShortcutScope = 'global' | 'page' | 'gesture'`
  - `export type ScopeFilter = 'all' | ShortcutScope`
  - `export interface ShortcutDisplayRow { id: string; scope: ShortcutScope; label: string; description: string; where: string; shortcut: string; keyLabel: string }`
  - `export const GLOBAL_COMMAND_META: Record<string, { label: string; description: string }>`
  - `export const GLOBAL_COMMAND_ORDER: string[]`
  - `export const DEFAULT_GLOBAL_SHORTCUTS: Record<string, string>`
  - `export const PAGE_SHORTCUT_ROWS: ShortcutDisplayRow[]`
  - `export function parseShortcutKeys(shortcut: string): string[]`
  - `export function formatGestureLabel(tapCount: number): string`
  - `export function buildGestureRow(tapCount: number, timeWindowMs: number): ShortcutDisplayRow`
  - `export function buildGlobalRows(commands: Array<{ name: string; description?: string; shortcut?: string }>): ShortcutDisplayRow[]`
  - `export function countGlobalBound(rows: ShortcutDisplayRow[]): { bound: number; total: number }`
  - `export function filterShortcutRows(rows: ShortcutDisplayRow[], query: string, scope: ScopeFilter): ShortcutDisplayRow[]`
  - `export function formatCheatsheet(rows: ShortcutDisplayRow[]): string`
  - `export function groupRowsByScope(rows: ShortcutDisplayRow[]): { global: ShortcutDisplayRow[]; page: ShortcutDisplayRow[]; gesture: ShortcutDisplayRow[] }`

- [ ] **Step 1: Write the failing unit test**

Create `lib/__tests__/shortcutDisplay.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  parseShortcutKeys,
  formatGestureLabel,
  buildGestureRow,
  buildGlobalRows,
  countGlobalBound,
  filterShortcutRows,
  formatCheatsheet,
  groupRowsByScope,
  PAGE_SHORTCUT_ROWS,
  DEFAULT_GLOBAL_SHORTCUTS,
  GLOBAL_COMMAND_ORDER,
} from '@/lib/shortcutDisplay';

describe('parseShortcutKeys', () => {
  it('splits modifier chords', () => {
    expect(parseShortcutKeys('Alt+A')).toEqual(['Alt', 'A']);
    expect(parseShortcutKeys('Ctrl+Shift+Y')).toEqual(['Ctrl', 'Shift', 'Y']);
  });

  it('returns empty for blank', () => {
    expect(parseShortcutKeys('')).toEqual([]);
    expect(parseShortcutKeys('   ')).toEqual([]);
  });

  it('keeps gesture compounds as a single token', () => {
    expect(parseShortcutKeys('Space × 3')).toEqual(['Space × 3']);
  });

  it('keeps media keys as a single token', () => {
    expect(parseShortcutKeys('MediaNextTrack')).toEqual(['MediaNextTrack']);
  });
});

describe('formatGestureLabel / buildGestureRow', () => {
  it('formats Space × N', () => {
    expect(formatGestureLabel(3)).toBe('Space × 3');
  });

  it('builds gesture row with window meta in description', () => {
    const row = buildGestureRow(3, 800);
    expect(row.scope).toBe('gesture');
    expect(row.shortcut).toBe('Space × 3');
    expect(row.keyLabel).toBe('Space × 3');
    expect(row.description).toMatch(/800/);
  });
});

describe('buildGlobalRows', () => {
  it('maps known commands and uses API shortcut when present', () => {
    const rows = buildGlobalRows([
      { name: 'translate-page', shortcut: 'Alt+B', description: 'ignored if meta exists' },
      { name: 'translate-input-box', shortcut: '' },
    ]);
    const page = rows.find((r) => r.id === 'translate-page');
    const inline = rows.find((r) => r.id === 'translate-input-box');
    expect(page?.shortcut).toBe('Alt+B');
    expect(page?.label).toBe('Translate page');
    expect(inline?.shortcut).toBe('');
    expect(inline?.label).toBe('Inline translate');
  });

  it('fills missing known commands with defaults when API omits them', () => {
    const rows = buildGlobalRows([]);
    expect(rows.map((r) => r.id)).toEqual(GLOBAL_COMMAND_ORDER);
    expect(rows.find((r) => r.id === 'translate-page')?.shortcut).toBe(
      DEFAULT_GLOBAL_SHORTCUTS['translate-page'],
    );
    expect(rows.find((r) => r.id === 'translate-input-box')?.shortcut).toBe('');
  });

  it('never uses Alt+T or Alt+O as defaults', () => {
    const rows = buildGlobalRows([]);
    for (const r of rows) {
      expect(r.shortcut).not.toMatch(/Alt\+T/i);
      expect(r.shortcut).not.toMatch(/Alt\+O/i);
    }
  });
});

describe('PAGE_SHORTCUT_ROWS', () => {
  it('includes hover, selection, section picker, escape', () => {
    const labels = PAGE_SHORTCUT_ROWS.map((r) => r.shortcut);
    expect(labels).toEqual(expect.arrayContaining(['Alt+H', 'Alt+D', 'Alt+Q', 'Escape']));
    expect(PAGE_SHORTCUT_ROWS.every((r) => r.scope === 'page')).toBe(true);
  });
});

describe('countGlobalBound', () => {
  it('counts non-empty shortcuts', () => {
    const rows = buildGlobalRows([
      { name: 'translate-page', shortcut: 'Alt+A' },
      { name: 'translate-input-box', shortcut: '' },
    ]);
    // all five commands present; only those with non-empty shortcut count as bound
    const { bound, total } = countGlobalBound(rows);
    expect(total).toBe(5);
    expect(bound).toBeGreaterThanOrEqual(1);
    expect(bound).toBeLessThan(total);
  });
});

describe('filterShortcutRows', () => {
  const sample = [
    ...buildGlobalRows([]),
    ...PAGE_SHORTCUT_ROWS,
    buildGestureRow(3, 800),
  ];

  it('filters by scope', () => {
    expect(filterShortcutRows(sample, '', 'page').every((r) => r.scope === 'page')).toBe(true);
  });

  it('filters by query on label and key', () => {
    const hover = filterShortcutRows(sample, 'hover', 'all');
    expect(hover.some((r) => r.label.toLowerCase().includes('hover'))).toBe(true);
    const byKey = filterShortcutRows(sample, 'alt+h', 'all');
    expect(byKey.some((r) => r.id.includes('hover') || r.shortcut.toLowerCase() === 'alt+h')).toBe(
      true,
    );
  });
});

describe('formatCheatsheet + groupRowsByScope', () => {
  it('formats grouped plain text', () => {
    const rows = filterShortcutRows(
      [...buildGlobalRows([]), ...PAGE_SHORTCUT_ROWS, buildGestureRow(3, 800)],
      '',
      'all',
    );
    const text = formatCheatsheet(rows);
    expect(text).toContain('AnyLLMTranslate shortcuts');
    expect(text).toContain('Global');
    expect(text).toContain('Translate page:');
    expect(text).toContain('Page');
    expect(text).toContain('Gestures');
    expect(text).toMatch(/not set/i);
  });

  it('groups by scope', () => {
    const g = groupRowsByScope([
      ...buildGlobalRows([]).slice(0, 1),
      PAGE_SHORTCUT_ROWS[0]!,
      buildGestureRow(2, 500),
    ]);
    expect(g.global).toHaveLength(1);
    expect(g.page).toHaveLength(1);
    expect(g.gesture).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/__tests__/shortcutDisplay.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

Create `lib/shortcutDisplay.ts`:

```typescript
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
const PAGE_WHERE = 'Web pages with the extension active';

/** Mirrors content/keyboardShortcuts.ts defaults (labels only). */
export const PAGE_SHORTCUT_ROWS: ShortcutDisplayRow[] = [
  {
    id: 'page-hover',
    scope: 'page',
    label: 'Toggle hover translate',
    description: 'Enable or disable hover translate on the page',
    where: PAGE_WHERE,
    shortcut: 'Alt+H',
    keyLabel: 'Alt+H',
  },
  {
    id: 'page-selection',
    scope: 'page',
    label: 'Toggle selection translate',
    description: 'Enable or disable selection translate on the page',
    where: PAGE_WHERE,
    shortcut: 'Alt+D',
    keyLabel: 'Alt+D',
  },
  {
    id: 'page-section-picker',
    scope: 'page',
    label: 'Translate section (picker)',
    description: 'Enter or exit section picker mode',
    where: PAGE_WHERE,
    shortcut: 'Alt+Q',
    keyLabel: 'Alt+Q',
  },
  {
    id: 'page-dismiss',
    scope: 'page',
    label: 'Dismiss tooltip',
    description: 'Close translate tooltip or floating button',
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
  return s.split('+').map((p) => p.trim()).filter(Boolean);
}

export function buildGlobalRows(
  commands: Array<{ name: string; description?: string; shortcut?: string }>,
): ShortcutDisplayRow[] {
  const byName = new Map(commands.map((c) => [c.name, c]));
  const rows: ShortcutDisplayRow[] = [];

  for (const id of GLOBAL_COMMAND_ORDER) {
    const meta = GLOBAL_COMMAND_META[id]!;
    const api = byName.get(id);
    const hasApi = Boolean(api);
    const shortcut = hasApi
      ? (api!.shortcut ?? '').trim()
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/__tests__/shortcutDisplay.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/shortcutDisplay.ts lib/__tests__/shortcutDisplay.test.ts
git commit -m "feat(shortcuts): pure Shortcut Studio display helpers"
```

---

### Task 2: KeyCapSequence component

**Files:**
- Create: `entrypoints/options/components/KeyCapSequence.tsx`
- Create: `entrypoints/options/components/__tests__/KeyCapSequence.test.tsx` (only if other component tests live here; otherwise cover via section tests — prefer a tiny unit test)

**Interfaces:**
- Consumes: `parseShortcutKeys` from `@/lib/shortcutDisplay`
- Produces: `export function KeyCapSequence(props: { shortcut: string; className?: string }): JSX.Element | null`

- [ ] **Step 1: Write the failing test**

Create `entrypoints/options/components/__tests__/KeyCapSequence.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KeyCapSequence } from '../KeyCapSequence';

describe('KeyCapSequence', () => {
  it('renders nothing for empty shortcut', () => {
    const { container } = render(<KeyCapSequence shortcut="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders chips for Alt+A with accessible name', () => {
    render(<KeyCapSequence shortcut="Alt+A" />);
    expect(screen.getByLabelText('Shortcut Alt+A')).toBeInTheDocument();
    expect(screen.getByText('Alt')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- entrypoints/options/components/__tests__/KeyCapSequence.test.tsx`

Expected: FAIL (module not found)

- [ ] **Step 3: Implement KeyCapSequence**

Create `entrypoints/options/components/KeyCapSequence.tsx`:

```tsx
/**
 * Key cap chips for Shortcut Studio rows.
 */

import { parseShortcutKeys } from '@/lib/shortcutDisplay';

export interface KeyCapSequenceProps {
  shortcut: string;
  className?: string;
}

export function KeyCapSequence({ shortcut, className = '' }: KeyCapSequenceProps) {
  const keys = parseShortcutKeys(shortcut);
  if (keys.length === 0) return null;

  const aria = `Shortcut ${shortcut.trim()}`;

  return (
    <span
      className={`inline-flex items-center gap-1 shrink-0 ${className}`}
      aria-label={aria}
    >
      {keys.map((key, i) => (
        <kbd
          key={`${key}-${i}`}
          className="min-w-[1.5rem] px-2 py-1 text-center bg-zinc-800 border border-zinc-600/80 rounded-md text-[11px] text-zinc-200 font-mono shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-transform duration-150 hover:-translate-y-px hover:shadow-md active:translate-y-px motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test -- entrypoints/options/components/__tests__/KeyCapSequence.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add entrypoints/options/components/KeyCapSequence.tsx entrypoints/options/components/__tests__/KeyCapSequence.test.tsx
git commit -m "feat(shortcuts): add KeyCapSequence chip component"
```

---

### Task 3: ShortcutRow + ShortcutGroup

**Files:**
- Create: `entrypoints/options/components/ShortcutRow.tsx`
- Create: `entrypoints/options/components/ShortcutGroup.tsx`

**Interfaces:**
- Consumes: `ShortcutDisplayRow` from `@/lib/shortcutDisplay`; `KeyCapSequence`; `Badge` from `@/ui/Badge`
- Produces:
  - `export function ShortcutRow(props: { row: ShortcutDisplayRow; action?: ReactNode }): JSX.Element`
  - `export function ShortcutGroup(props: { title: string; description?: string; icon?: ReactNode; rows: ShortcutDisplayRow[]; emptyMessage?: string; rowAction?: (row: ShortcutDisplayRow) => ReactNode }): JSX.Element | null`

- [ ] **Step 1: Implement ShortcutRow**

Create `entrypoints/options/components/ShortcutRow.tsx`:

```tsx
/**
 * Single shortcut binding row for Shortcut Studio.
 */

import type { ReactNode } from 'react';
import type { ShortcutDisplayRow } from '@/lib/shortcutDisplay';
import { Badge } from '@/ui/Badge';
import { KeyCapSequence } from './KeyCapSequence';

const SCOPE_BADGE: Record<ShortcutDisplayRow['scope'], string> = {
  global: 'Global',
  page: 'Page',
  gesture: 'Gesture',
};

export interface ShortcutRowProps {
  row: ShortcutDisplayRow;
  action?: ReactNode;
}

export function ShortcutRow({ row, action }: ShortcutRowProps) {
  const unbound = !row.shortcut.trim();

  return (
    <div
      role="listitem"
      className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-5 py-3.5 hover:bg-zinc-800/30 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-zinc-200">{row.label}</p>
          <Badge variant="info">{SCOPE_BADGE[row.scope]}</Badge>
          {unbound ? <Badge variant="warning">Not set</Badge> : null}
        </div>
        <p className="text-xs text-zinc-500 mt-0.5">{row.description}</p>
        <p className="text-[11px] text-zinc-600 mt-1">{row.where}</p>
        {unbound ? (
          <p className="text-[11px] text-amber-500/90 mt-1">Set in browser shortcuts</p>
        ) : null}
      </div>
      <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
        {!unbound ? <KeyCapSequence shortcut={row.shortcut} /> : null}
        {action}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement ShortcutGroup**

Create `entrypoints/options/components/ShortcutGroup.tsx`:

```tsx
/**
 * Card group of shortcut rows.
 */

import type { ReactNode } from 'react';
import type { ShortcutDisplayRow } from '@/lib/shortcutDisplay';
import { Card } from '@/ui/Card';
import { ShortcutRow } from './ShortcutRow';

export interface ShortcutGroupProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  rows: ShortcutDisplayRow[];
  /** When rows empty after filter, return null (hide group) unless forceEmpty. */
  forceEmpty?: boolean;
  emptyMessage?: string;
  rowAction?: (row: ShortcutDisplayRow) => ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function ShortcutGroup({
  title,
  description,
  icon,
  rows,
  forceEmpty = false,
  emptyMessage = 'No shortcuts match.',
  rowAction,
  className = '',
  style,
}: ShortcutGroupProps) {
  if (rows.length === 0 && !forceEmpty) return null;

  return (
    <Card
      title={title}
      description={description}
      icon={icon}
      variant="bordered"
      className={`p-0 overflow-hidden ${className}`}
      style={style}
    >
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-zinc-500 text-center">{emptyMessage}</p>
      ) : (
        <div className="divide-y divide-zinc-800" role="list" aria-label={title}>
          {rows.map((row) => (
            <ShortcutRow key={row.id} row={row} action={rowAction?.(row)} />
          ))}
        </div>
      )}
    </Card>
  );
}
```

Note: `Card` always applies `p-5`; the existing Shortcuts section used `className="p-0 overflow-hidden"`. If padding still applies from Card base, match whatever pattern other sections use for flush lists (Inspect `Card` — if `p-5` always wins, wrap list with `-m-5` or adjust Card usage like other flush lists in the codebase). Prefer matching `Providers`/`Dictionary` flush-list patterns if any; otherwise keep `className` override and ensure row horizontal padding still looks correct.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | head -40`

Expected: No errors in new files

- [ ] **Step 4: Commit**

```bash
git add entrypoints/options/components/ShortcutRow.tsx entrypoints/options/components/ShortcutGroup.tsx
git commit -m "feat(shortcuts): add ShortcutRow and ShortcutGroup"
```

---

### Task 4: ShortcutStudioBar

**Files:**
- Create: `entrypoints/options/components/ShortcutStudioBar.tsx`

**Interfaces:**
- Consumes: `ScopeFilter` from `@/lib/shortcutDisplay`; `Input`, `Button`, `Badge`, Lucide icons
- Produces:
  - `export interface ShortcutStudioBarProps { searchQuery: string; onSearchChange: (q: string) => void; scope: ScopeFilter; onScopeChange: (s: ScopeFilter) => void; bound: number; total: number; onCopy: () => void; onManage: () => void; copyBusy?: boolean }`
  - `export function ShortcutStudioBar(props: ShortcutStudioBarProps): JSX.Element`

- [ ] **Step 1: Implement StudioBar**

Create `entrypoints/options/components/ShortcutStudioBar.tsx`:

```tsx
/**
 * Shortcut Studio command bar — search, scope, status, Copy, Manage.
 */

import { Search, Copy, ExternalLink } from 'lucide-react';
import type { ScopeFilter } from '@/lib/shortcutDisplay';
import { Input } from '@/ui/Input';
import { Button } from '@/ui/Button';
import { Badge } from '@/ui/Badge';
import { Card } from '@/ui/Card';

const SCOPES: { id: ScopeFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'global', label: 'Global' },
  { id: 'page', label: 'Page' },
  { id: 'gesture', label: 'Gesture' },
];

export interface ShortcutStudioBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  scope: ScopeFilter;
  onScopeChange: (s: ScopeFilter) => void;
  bound: number;
  total: number;
  onCopy: () => void;
  onManage: () => void;
}

export function ShortcutStudioBar({
  searchQuery,
  onSearchChange,
  scope,
  onScopeChange,
  bound,
  total,
  onCopy,
  onManage,
}: ShortcutStudioBarProps) {
  const allBound = total > 0 && bound === total;
  const statusLabel =
    total === 0 ? 'No global commands' : `${bound}/${total} global bound`;

  return (
    <Card variant="bordered" className="!p-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="flex-1 min-w-0">
            <label htmlFor="shortcut-studio-search" className="sr-only">
              Search shortcuts
            </label>
            <Input
              id="shortcut-studio-search"
              type="search"
              icon={<Search className="w-4 h-4" />}
              placeholder="Search actions or keys…"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Badge variant={allBound ? 'success' : 'warning'}>{statusLabel}</Badge>
            <Button type="button" variant="secondary" size="sm" icon={<Copy className="w-3.5 h-3.5" />} onClick={onCopy}>
              Copy all
            </Button>
            <Button type="button" variant="primary" size="sm" icon={<ExternalLink className="w-3.5 h-3.5" />} onClick={onManage}>
              Manage
            </Button>
          </div>
        </div>

        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label="Filter by scope"
        >
          {SCOPES.map((s) => {
            const active = scope === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onScopeChange(s.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  active
                    ? 'bg-orange-500/15 text-orange-300 border border-orange-500/30'
                    : 'bg-zinc-800/60 text-zinc-400 border border-zinc-700/50 hover:text-zinc-200'
                }`}
                aria-pressed={active}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | head -40`

Expected: clean for this file

- [ ] **Step 3: Commit**

```bash
git add entrypoints/options/components/ShortcutStudioBar.tsx
git commit -m "feat(shortcuts): add ShortcutStudioBar command strip"
```

---

### Task 5: Rewrite ShortcutsSection + App navigation

**Files:**
- Rewrite: `entrypoints/options/sections/ShortcutsSection.tsx`
- Modify: `entrypoints/options/App.tsx` (shortcuts case + prop)

**Interfaces:**
- Consumes: all helpers/components above; `useSettingsStore` for `inlineTranslate`; `useToast`; `SectionHeader`; `stagger`
- Produces: `export function ShortcutsSection(props?: { onNavigateToInline?: () => void }): JSX.Element`

- [ ] **Step 1: Rewrite ShortcutsSection**

Replace `entrypoints/options/sections/ShortcutsSection.tsx` with:

```tsx
/**
 * Shortcut Studio — live global commands, page keys, gestures, copy & manage.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Keyboard as KeyboardIcon,
  Globe2,
  AppWindow,
  Hand,
  Lightbulb,
  ExternalLink,
} from 'lucide-react';
import { SectionHeader } from '@/ui/SectionHeader';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { stagger } from '@/lib/styleUtils';
import { useSettingsStore } from '@/stores/settingsStore';
import { useToast } from '@/ui/ToastProvider';
import {
  type ScopeFilter,
  type ShortcutDisplayRow,
  PAGE_SHORTCUT_ROWS,
  buildGestureRow,
  buildGlobalRows,
  countGlobalBound,
  filterShortcutRows,
  formatCheatsheet,
  groupRowsByScope,
} from '@/lib/shortcutDisplay';
import { ShortcutStudioBar } from '../components/ShortcutStudioBar';
import { ShortcutGroup } from '../components/ShortcutGroup';

const BROWSER_SHORTCUTS_URL = 'chrome://extensions/shortcuts';

export interface ShortcutsSectionProps {
  onNavigateToInline?: () => void;
}

async function loadChromeCommands(): Promise<
  Array<{ name: string; description?: string; shortcut?: string }>
> {
  try {
    if (typeof chrome !== 'undefined' && chrome.commands?.getAll) {
      const list = await chrome.commands.getAll();
      return list.map((c) => ({
        name: c.name ?? '',
        description: c.description,
        shortcut: c.shortcut,
      }));
    }
  } catch {
    // fall through to defaults
  }
  return [];
}

export function ShortcutsSection({ onNavigateToInline }: ShortcutsSectionProps = {}) {
  const tapCount = useSettingsStore((s) => s.inlineTranslate.tapCount);
  const timeWindowMs = useSettingsStore((s) => s.inlineTranslate.timeWindowMs);
  const { success: showSuccess, error: showError } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [scope, setScope] = useState<ScopeFilter>('all');
  const [globalRows, setGlobalRows] = useState<ShortcutDisplayRow[]>(() => buildGlobalRows([]));

  const refreshCommands = useCallback(async () => {
    const commands = await loadChromeCommands();
    setGlobalRows(buildGlobalRows(commands));
  }, []);

  useEffect(() => {
    void refreshCommands();
  }, [refreshCommands]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void refreshCommands();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [refreshCommands]);

  const gestureRow = useMemo(
    () => buildGestureRow(tapCount, timeWindowMs),
    [tapCount, timeWindowMs],
  );

  const allRows = useMemo(
    () => [...globalRows, ...PAGE_SHORTCUT_ROWS, gestureRow],
    [globalRows, gestureRow],
  );

  const visibleRows = useMemo(
    () => filterShortcutRows(allRows, searchQuery, scope),
    [allRows, searchQuery, scope],
  );

  const grouped = useMemo(() => groupRowsByScope(visibleRows), [visibleRows]);
  const { bound, total } = useMemo(() => countGlobalBound(globalRows), [globalRows]);

  const handleCopy = async () => {
    const text = formatCheatsheet(visibleRows);
    try {
      await navigator.clipboard.writeText(text);
      showSuccess('Cheatsheet copied');
    } catch {
      showError('Could not copy cheatsheet');
    }
  };

  const handleManage = () => {
    try {
      chrome.tabs.create({ url: BROWSER_SHORTCUTS_URL });
    } catch {
      showError(`Open ${BROWSER_SHORTCUTS_URL} manually in the address bar`);
    }
  };

  const clearFilters = () => {
    setSearchQuery('');
    setScope('all');
  };

  const noMatches = visibleRows.length === 0;

  return (
    <div className="animate-fade-in-up">
      <SectionHeader
        title="Shortcut Studio"
        description="See every trigger — live browser bindings, page keys, and gestures."
        icon={<KeyboardIcon className="w-4 h-4" />}
        accentColor="orange"
      />

      <div className="space-y-4">
        <div className="animate-stagger" style={stagger(0)}>
          <ShortcutStudioBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            scope={scope}
            onScopeChange={setScope}
            bound={bound}
            total={total}
            onCopy={() => void handleCopy()}
            onManage={handleManage}
          />
        </div>

        {noMatches ? (
          <div className="animate-stagger rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-10 text-center" style={stagger(1)}>
            <p className="text-sm text-zinc-400">No shortcuts match your filters.</p>
            <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={clearFilters}>
              Clear filters
            </Button>
          </div>
        ) : (
          <>
            <div className="animate-stagger" style={stagger(1)}>
              <ShortcutGroup
                title="Global commands"
                description="Managed by the browser. Values refresh when you return to this tab."
                icon={<Globe2 className="w-3.5 h-3.5" />}
                rows={grouped.global}
              />
            </div>
            <div className="animate-stagger" style={stagger(2)}>
              <ShortcutGroup
                title="On this page"
                description="Content-script keys while a web page is focused. Not customizable here."
                icon={<AppWindow className="w-3.5 h-3.5" />}
                rows={grouped.page}
              />
            </div>
            <div className="animate-stagger" style={stagger(3)}>
              <ShortcutGroup
                title="Gestures"
                description="Input-field gesture from Inline settings."
                icon={<Hand className="w-3.5 h-3.5" />}
                rows={grouped.gesture}
                rowAction={
                  onNavigateToInline
                    ? (row) =>
                        row.id === 'gesture-inline' ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={onNavigateToInline}
                          >
                            Configure on Inline
                          </Button>
                        ) : null
                    : undefined
                }
              />
            </div>
          </>
        )}

        <div className="animate-stagger" style={stagger(4)}>
          <Card
            title="Tips"
            description="How shortcuts work in Chromium browsers."
            icon={<Lightbulb className="w-3.5 h-3.5" />}
            variant="bordered"
          >
            <ul className="space-y-2 text-xs text-zinc-400 list-disc pl-4">
              <li>Global shortcuts are managed by the browser; this studio shows live assignments.</li>
              <li>Chrome allows only four default suggested keys — the fifth command may need manual binding.</li>
              <li>Page shortcuts work when a web page is focused (not only inside this options UI).</li>
              <li>
                Open{' '}
                <button
                  type="button"
                  className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1"
                  onClick={handleManage}
                >
                  browser shortcuts
                  <ExternalLink className="w-3 h-3" />
                </button>{' '}
                to rebind global commands.
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire App.tsx**

In `entrypoints/options/App.tsx`, change the shortcuts case:

```tsx
case 'shortcuts':
  return <ShortcutsSection onNavigateToInline={() => setActiveTab('inline')} />;
```

- [ ] **Step 3: Manual sanity (optional in CI)**

Run: `npx tsc --noEmit 2>&1 | head -40`

- [ ] **Step 4: Commit**

```bash
git add entrypoints/options/sections/ShortcutsSection.tsx entrypoints/options/App.tsx
git commit -m "feat(shortcuts): rewrite Shortcuts tab as Shortcut Studio"
```

---

### Task 6: Section tests

**Files:**
- Create: `entrypoints/options/sections/__tests__/ShortcutsSection.test.tsx`

**Interfaces:**
- Consumes: section + chrome mocks + settings store
- Produces: vitest coverage for render, unbound badge, filter, copy, manage, navigate

- [ ] **Step 1: Write section tests**

Create `entrypoints/options/sections/__tests__/ShortcutsSection.test.tsx`:

```typescript
/**
 * ShortcutsSection — Shortcut Studio smoke tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DEFAULT_SETTINGS } from '@/types/config';

const mockGetAll = vi.fn(async () => [
  { name: 'translate-page', shortcut: 'Alt+A', description: 'Translate the current page' },
  { name: 'translate-subtitles', shortcut: 'Alt+S', description: 'Translate video subtitles' },
  { name: 'toggle-display', shortcut: 'Alt+Z', description: 'Toggle translation display' },
  { name: 'restore-page', shortcut: 'Alt+X', description: 'Restore original page' },
  { name: 'translate-input-box', shortcut: '', description: 'Translate the focused input box' },
]);

const mockTabsCreate = vi.fn();

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => {}),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  commands: {
    getAll: mockGetAll,
  },
  tabs: {
    create: mockTabsCreate,
  },
});

const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('@/ui/ToastProvider', () => ({
  useToast: () => ({
    success: toastSuccess,
    error: toastError,
    info: vi.fn(),
    warning: vi.fn(),
  }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { useSettingsStore } from '@/stores/settingsStore';
import { ShortcutsSection } from '../ShortcutsSection';

describe('ShortcutsSection', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      ...DEFAULT_SETTINGS,
      isLoaded: true,
      inlineTranslate: {
        ...DEFAULT_SETTINGS.inlineTranslate,
        tapCount: 3,
        timeWindowMs: 800,
      },
    });
    mockGetAll.mockClear();
    mockTabsCreate.mockClear();
    toastSuccess.mockClear();
    toastError.mockClear();
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: {
        writeText: vi.fn(async () => undefined),
      },
    });
  });

  it('renders studio header and live global + page + gesture shortcuts', async () => {
    render(<ShortcutsSection />);
    expect(screen.getByText('Shortcut Studio')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Translate page')).toBeInTheDocument();
    });
    expect(screen.getByText('Toggle hover translate')).toBeInTheDocument();
    expect(screen.getByText('Space × 3')).toBeInTheDocument();
    expect(screen.queryByText('Alt+T')).not.toBeInTheDocument();
    expect(screen.queryByText('Alt+O')).not.toBeInTheDocument();
  });

  it('shows Not set for unbound global command', async () => {
    render(<ShortcutsSection />);
    await waitFor(() => {
      expect(screen.getByText('Inline translate')).toBeInTheDocument();
    });
    expect(screen.getAllByText('Not set').length).toBeGreaterThanOrEqual(1);
  });

  it('filters by search query', async () => {
    render(<ShortcutsSection />);
    await waitFor(() => expect(screen.getByText('Translate page')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/search shortcuts/i), {
      target: { value: 'hover' },
    });
    expect(screen.getByText('Toggle hover translate')).toBeInTheDocument();
    expect(screen.queryByText('Translate page')).not.toBeInTheDocument();
  });

  it('copies cheatsheet and opens manage URL', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<ShortcutsSection />);
    await waitFor(() => expect(screen.getByText('Translate page')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /copy all/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(String(writeText.mock.calls[0]?.[0])).toContain('AnyLLMTranslate shortcuts');
    expect(toastSuccess).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^manage$/i }));
    expect(mockTabsCreate).toHaveBeenCalledWith({
      url: 'chrome://extensions/shortcuts',
    });
  });

  it('navigates to Inline from gesture action', async () => {
    const onNav = vi.fn();
    render(<ShortcutsSection onNavigateToInline={onNav} />);
    await waitFor(() => expect(screen.getByText('Space × 3')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /configure on inline/i }));
    expect(onNav).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL only if section incomplete; fix until PASS**

Run: `npm test -- entrypoints/options/sections/__tests__/ShortcutsSection.test.tsx`

Expected: PASS

If Card padding / duplicate “Manage” buttons break queries, tighten selectors (`getByRole` with exact name) as needed without weakening assertions on Alt+T/O absence.

- [ ] **Step 3: Run related unit tests**

Run: `npm test -- lib/__tests__/shortcutDisplay.test.ts entrypoints/options/components/__tests__/KeyCapSequence.test.tsx entrypoints/options/sections/__tests__/ShortcutsSection.test.tsx`

Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git add entrypoints/options/sections/__tests__/ShortcutsSection.test.tsx
git commit -m "test(shortcuts): Shortcut Studio section coverage"
```

---

### Task 7: Polish, Card flush-list fix, quality gates

**Files:**
- Modify as needed: `ShortcutGroup.tsx` / `Card` usage if list padding is wrong
- Possibly: `ui/Card.tsx` only if a non-breaking `contentClassName` already exists — **prefer local layout fix over changing Card API**

- [ ] **Step 1: Visual/layout fix if list has double padding**

If `Card` forces `p-5` and list looks inset twice, change `ShortcutGroup` to:

```tsx
<Card title={title} description={description} icon={icon} variant="bordered" className={className} style={style}>
  <div className="-mx-5 -mb-5 mt-0 border-t border-zinc-800/80">
    <div className="divide-y divide-zinc-800" role="list" aria-label={title}>
      {rows.map((row) => (
        <ShortcutRow key={row.id} row={row} action={rowAction?.(row)} />
      ))}
    </div>
  </div>
</Card>
```

(Adjust `-mb-5` only if Card padding applies on all sides.)

- [ ] **Step 2: Run full targeted suite + tsc**

```bash
npm test -- lib/__tests__/shortcutDisplay.test.ts entrypoints/options/components/__tests__/KeyCapSequence.test.tsx entrypoints/options/sections/__tests__/ShortcutsSection.test.tsx
npx tsc --noEmit 2>&1 | head -40
```

Expected: tests PASS; no new tsc errors

- [ ] **Step 3: Close beads issue when done**

```bash
bd close ALT-ia6 --reason="Shortcut Studio implemented per plan"
```

- [ ] **Step 4: Final commit if polish changes remain**

```bash
git add -A
git status
git commit -m "fix(shortcuts): polish Shortcut Studio layout"
```

- [ ] **Step 5: Push (session completion)**

```bash
git pull --rebase
git push
git status
```

Expected: `up to date with origin`

---

## Spec coverage checklist (plan self-review)

| Spec requirement | Task |
|------------------|------|
| Live `chrome.commands.getAll` | Task 5 |
| visibility refresh | Task 5 |
| Correct defaults Alt+A/S/Z/X, unbound inline | Task 1 + 5 |
| No Alt+T / Alt+O | Task 1 tests + Task 6 |
| Page shortcuts Alt+H/D/Q/Esc | Task 1 |
| Gesture Space×N live | Task 5 |
| Search + scope filter | Task 4 + 5 + 6 |
| Bound status | Task 4 + 1 |
| Copy cheatsheet | Task 1 + 5 + 6 |
| Manage → chrome:// + toast fallback | Task 5 + 6 |
| Configure on Inline | Task 5 + 6 |
| Key caps | Task 2 |
| Tips card | Task 5 |
| No schema / no rebind / no handler changes | Global constraints |
| Tests | Tasks 1, 2, 6 |

**Placeholder scan:** none intentional.  
**Type consistency:** `ShortcutDisplayRow`, `ScopeFilter`, `buildGlobalRows`, `formatCheatsheet` names stable across tasks.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-10-shortcut-studio.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — this session with executing-plans and checkpoints  

**Which approach?**
