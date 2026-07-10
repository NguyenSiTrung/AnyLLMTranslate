# Dictionary Glossary UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Settings → Dictionary into a glossary-only term library: command bar, empty hero, card rows, elevated verify — without schema or selection-dictionary changes.

**Architecture:** Extract pure list helpers into `lib/glossary.ts`. Split the monolithic `DictionarySection` into focused presentational components (command bar, add form, empty hero, entry list/row) composed by a thin section shell. Polish `GlossaryTranslatePreview` in place (copy, default-open, hide when empty). Ephemeral UI state stays in React local state; glossary data remains `settings.glossary` via `useSettingsStore`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Lucide React, Zustand (`useSettingsStore`), Vitest + Testing Library, existing `ui/*` primitives (`Card`, `Button`, `Input`, `Textarea`, `Modal`, `Badge`, `SectionHeader`, `EmptyState`, `ToastProvider`).

**Spec:** `docs/superpowers/specs/2026-07-10-dictionary-glossary-ui-design.md`

## Global Constraints

- No new `chrome.storage` / settings schema keys — only existing `glossary: GlossaryEntry[]`.
- Do not change `GlossaryEntry` shape (`id`, `source`, `target` only).
- Do not change `formatGlossary`, prompt injection, or background translate APIs.
- Do not surface `selectionDictionaryEnabled` on this tab (stays Advanced).
- Do not rename nav id `dictionary` or tab label **Dictionary**.
- Section title copy: **Custom terms**; description from spec copy kit.
- New interactive adds **prepend**; imports **append**.
- Duplicate source (case-insensitive) **blocked** on add/edit (edit excludes self).
- Verify panel **hidden** when empty; **expanded by default** when ≥1 term.
- While mismatch set non-empty, mismatched rows sort **first**.
- TDD for pure helpers; component smoke tests for section behavior.
- DRY: reuse `@/lib/glossary` parse/export and `checkGlossaryMismatches`.
- Options zinc dark chrome; section accent **emerald**.

---

## File map

| File | Responsibility |
|------|----------------|
| Modify `lib/glossary.ts` | Pure helpers: duplicate check, filter, mismatch-first sort |
| Modify `lib/__tests__/glossary.test.ts` | Tests for new helpers |
| Create `entrypoints/options/components/DictionaryEmptyHero.tsx` | Zero-state education + CTAs |
| Create `entrypoints/options/components/DictionaryAddForm.tsx` | Inline add form |
| Create `entrypoints/options/components/DictionaryCommandBar.tsx` | Search + Add + Import + Export |
| Create `entrypoints/options/components/GlossaryEntryRow.tsx` | View/edit row |
| Create `entrypoints/options/components/GlossaryEntryList.tsx` | List shell, footer, search-miss, mismatch sort |
| Modify `entrypoints/options/sections/GlossaryTranslatePreview.tsx` | Verify polish |
| Rewrite `entrypoints/options/sections/DictionarySection.tsx` | Compose shell + store wiring |
| Create `entrypoints/options/sections/__tests__/DictionarySection.test.tsx` | Section smoke tests |

**Do not modify:** `types/config.ts` glossary shape, `services/background.ts` translate path, Advanced selection-dictionary UI, `App.tsx` nav (unless import path breaks — it should not).

---

### Task 1: Glossary pure helpers

**Files:**
- Modify: `lib/glossary.ts`
- Modify: `lib/__tests__/glossary.test.ts`

**Interfaces:**
- Consumes: `GlossaryEntry` from `@/types/config`
- Produces:
  - `export function findDuplicateSource(entries: GlossaryEntry[], source: string, excludeId?: string): GlossaryEntry | undefined`
  - `export function filterGlossaryEntries(entries: GlossaryEntry[], query: string): GlossaryEntry[]`
  - `export function sortMismatchesFirst(entries: GlossaryEntry[], mismatchedIds: ReadonlySet<string>): GlossaryEntry[]`

- [ ] **Step 1: Write the failing tests**

Append to `lib/__tests__/glossary.test.ts`:

```typescript
import {
  // existing imports...
  findDuplicateSource,
  filterGlossaryEntries,
  sortMismatchesFirst,
} from '@/lib/glossary';

describe('findDuplicateSource', () => {
  const entries: GlossaryEntry[] = [
    { id: '1', source: 'React', target: 'React' },
    { id: '2', source: 'API', target: 'API' },
  ];

  it('finds case-insensitive duplicates and respects excludeId', () => {
    expect(findDuplicateSource(entries, 'react')?.id).toBe('1');
    expect(findDuplicateSource(entries, '  API  ')?.id).toBe('2');
    expect(findDuplicateSource(entries, 'Vue')).toBeUndefined();
    expect(findDuplicateSource(entries, 'React', '1')).toBeUndefined();
    expect(findDuplicateSource(entries, 'React', '2')?.id).toBe('1');
  });
});

describe('filterGlossaryEntries', () => {
  it('filters source and target; empty query returns all', () => {
    expect(filterGlossaryEntries(sampleEntries, '')).toHaveLength(3);
    expect(filterGlossaryEntries(sampleEntries, '  ').map((e) => e.id)).toEqual(
      sampleEntries.map((e) => e.id),
    );
    expect(filterGlossaryEntries(sampleEntries, 'học').map((e) => e.id)).toEqual(['2']);
    expect(filterGlossaryEntries(sampleEntries, 'react').map((e) => e.id)).toEqual(['1']);
  });
});

describe('sortMismatchesFirst', () => {
  it('stable-sorts mismatched ids to the front', () => {
    const entries: GlossaryEntry[] = [
      { id: 'a', source: 'a', target: 'a' },
      { id: 'b', source: 'b', target: 'b' },
      { id: 'c', source: 'c', target: 'c' },
    ];
    const sorted = sortMismatchesFirst(entries, new Set(['c', 'a']));
    expect(sorted.map((e) => e.id)).toEqual(['a', 'c', 'b']);
    // empty set preserves order
    expect(sortMismatchesFirst(entries, new Set()).map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run lib/__tests__/glossary.test.ts -v`

Expected: FAIL — `findDuplicateSource` / `filterGlossaryEntries` / `sortMismatchesFirst` not exported.

- [ ] **Step 3: Implement helpers in `lib/glossary.ts`**

```typescript
/** Case-insensitive duplicate source lookup; optional excludeId for edit-self. */
export function findDuplicateSource(
  entries: GlossaryEntry[],
  source: string,
  excludeId?: string,
): GlossaryEntry | undefined {
  const needle = source.trim().toLowerCase();
  if (!needle) return undefined;
  return entries.find(
    (e) => e.id !== excludeId && e.source.trim().toLowerCase() === needle,
  );
}

/** Filter entries by substring match on source or target (case-insensitive). */
export function filterGlossaryEntries(
  entries: GlossaryEntry[],
  query: string,
): GlossaryEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter(
    (e) =>
      e.source.toLowerCase().includes(q) || e.target.toLowerCase().includes(q),
  );
}

/**
 * Returns a new array with mismatched entries first, preserving relative order
 * within each partition (stable partition).
 */
export function sortMismatchesFirst(
  entries: GlossaryEntry[],
  mismatchedIds: ReadonlySet<string>,
): GlossaryEntry[] {
  if (mismatchedIds.size === 0) return entries;
  const hit: GlossaryEntry[] = [];
  const rest: GlossaryEntry[] = [];
  for (const e of entries) {
    if (mismatchedIds.has(e.id)) hit.push(e);
    else rest.push(e);
  }
  return [...hit, ...rest];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run lib/__tests__/glossary.test.ts -v`

Expected: PASS (all glossary tests).

- [ ] **Step 5: Commit**

```bash
git add lib/glossary.ts lib/__tests__/glossary.test.ts
git commit -m "feat(glossary): pure helpers for filter, duplicate, mismatch sort"
```

---

### Task 2: DictionaryEmptyHero

**Files:**
- Create: `entrypoints/options/components/DictionaryEmptyHero.tsx`
- Create: `entrypoints/options/components/__tests__/DictionaryEmptyHero.test.tsx`

**Interfaces:**
- Consumes: `Button`, `Card` from `@/ui/*`; `BookOpen` from lucide
- Produces:
  ```typescript
  export interface DictionaryEmptyHeroProps {
    onAddFirst: () => void;
    onImport: () => void;
    onUseExamples?: () => void;
  }
  export function DictionaryEmptyHero(props: DictionaryEmptyHeroProps): JSX.Element;
  ```

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DictionaryEmptyHero } from '../DictionaryEmptyHero';

describe('DictionaryEmptyHero', () => {
  it('renders copy and fires CTAs', () => {
    const onAddFirst = vi.fn();
    const onImport = vi.fn();
    const onUseExamples = vi.fn();
    render(
      <DictionaryEmptyHero
        onAddFirst={onAddFirst}
        onImport={onImport}
        onUseExamples={onUseExamples}
      />,
    );
    expect(screen.getByRole('heading', { name: 'No custom terms yet' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add first term' }));
    expect(onAddFirst).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Import file' }));
    expect(onImport).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Use examples' }));
    expect(onUseExamples).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run entrypoints/options/components/__tests__/DictionaryEmptyHero.test.tsx -v`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `DictionaryEmptyHero.tsx`**

```tsx
/**
 * First-run empty state for Settings → Dictionary (glossary).
 */

import { BookOpen, Plus, Upload, Sparkles } from 'lucide-react';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';

export interface DictionaryEmptyHeroProps {
  onAddFirst: () => void;
  onImport: () => void;
  onUseExamples?: () => void;
}

export function DictionaryEmptyHero({
  onAddFirst,
  onImport,
  onUseExamples,
}: DictionaryEmptyHeroProps) {
  return (
    <Card variant="bordered" className="border-emerald-500/20">
      <div className="flex flex-col items-center text-center py-8 px-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-600/10 text-emerald-400 mb-4">
          <BookOpen className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-zinc-100">No custom terms yet</h3>
        <p className="text-sm text-zinc-400 mt-2 max-w-md leading-relaxed">
          Pin exact translations for names, brands, and jargon. The model will prefer these
          over freestyle wording.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
          <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={onAddFirst}>
            Add first term
          </Button>
          <Button variant="secondary" icon={<Upload className="w-4 h-4" />} onClick={onImport}>
            Import file
          </Button>
          {onUseExamples && (
            <Button
              variant="ghost"
              size="sm"
              icon={<Sparkles className="w-3.5 h-3.5" />}
              onClick={onUseExamples}
            >
              Use examples
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run entrypoints/options/components/__tests__/DictionaryEmptyHero.test.tsx -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/options/components/DictionaryEmptyHero.tsx \
  entrypoints/options/components/__tests__/DictionaryEmptyHero.test.tsx
git commit -m "feat(options): Dictionary empty hero for glossary tab"
```

---

### Task 3: DictionaryAddForm

**Files:**
- Create: `entrypoints/options/components/DictionaryAddForm.tsx`
- Create: `entrypoints/options/components/__tests__/DictionaryAddForm.test.tsx`

**Interfaces:**
- Consumes: `Input`, `Button`; optional `findDuplicateSource` used by parent (form can receive `error` string)
- Produces:
  ```typescript
  export interface DictionaryAddFormProps {
    source: string;
    target: string;
    error?: string;
    onSourceChange: (v: string) => void;
    onTargetChange: (v: string) => void;
    onSubmit: () => void;
    onCancel: () => void;
  }
  export function DictionaryAddForm(props: DictionaryAddFormProps): JSX.Element;
  ```

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DictionaryAddForm } from '../DictionaryAddForm';

describe('DictionaryAddForm', () => {
  it('submits on Enter when both fields filled; shows error; cancel fires', () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    const onSourceChange = vi.fn();
    const onTargetChange = vi.fn();
    const { rerender } = render(
      <DictionaryAddForm
        source="foo"
        target="bar"
        onSourceChange={onSourceChange}
        onTargetChange={onTargetChange}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(screen.getByLabelText('Source term'), { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();

    rerender(
      <DictionaryAddForm
        source="foo"
        target="bar"
        error="This source term already exists"
        onSourceChange={onSourceChange}
        onTargetChange={onTargetChange}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText('This source term already exists')).toBeInTheDocument();
  });

  it('disables Add when a field is empty', () => {
    render(
      <DictionaryAddForm
        source="foo"
        target="  "
        onSourceChange={vi.fn()}
        onTargetChange={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run entrypoints/options/components/__tests__/DictionaryAddForm.test.tsx -v`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement form**

```tsx
/**
 * Inline add form for glossary terms (source → target).
 */

import { useEffect, useRef } from 'react';
import { Plus, X, ArrowRight } from 'lucide-react';
import { Input } from '@/ui/Input';
import { Button } from '@/ui/Button';

export interface DictionaryAddFormProps {
  source: string;
  target: string;
  error?: string;
  onSourceChange: (v: string) => void;
  onTargetChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function DictionaryAddForm({
  source,
  target,
  error,
  onSourceChange,
  onTargetChange,
  onSubmit,
  onCancel,
}: DictionaryAddFormProps) {
  const sourceRef = useRef<HTMLInputElement>(null);
  const canSubmit = Boolean(source.trim() && target.trim());

  useEffect(() => {
    sourceRef.current?.focus();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (canSubmit) onSubmit();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="space-y-2 animate-fade-in-up">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[8rem]">
          <Input
            ref={sourceRef as never}
            id="dict-source"
            type="text"
            placeholder="Source term"
            aria-label="Source term"
            value={source}
            onChange={(e) => onSourceChange(e.target.value)}
            onKeyDown={onKeyDown}
            error={error ? ' ' : undefined}
          />
        </div>
        <ArrowRight className="w-4 h-4 text-zinc-600 shrink-0 hidden sm:block" aria-hidden />
        <div className="flex-1 min-w-[8rem]">
          <Input
            id="dict-target"
            type="text"
            placeholder="Preferred translation"
            aria-label="Preferred translation"
            value={target}
            onChange={(e) => onTargetChange(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <Button
          id="dict-add-btn"
          onClick={onSubmit}
          disabled={!canSubmit}
          icon={<Plus className="w-4 h-4" />}
        >
          Add
        </Button>
        <Button variant="ghost" onClick={onCancel} icon={<X className="w-4 h-4" />}>
          Cancel
        </Button>
      </div>
      {error && (
        <p className="text-xs text-rose-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
```

**Note:** If `Input` does not forward `ref`, drop `ref`/`sourceRef` and use `autoFocus` on the source input instead (preferred if ref is unsupported — check `ui/Input.tsx`; use `autoFocus` when no forwardRef).

- [ ] **Step 4: Run tests to pass**

Run: `pnpm exec vitest run entrypoints/options/components/__tests__/DictionaryAddForm.test.tsx -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/options/components/DictionaryAddForm.tsx \
  entrypoints/options/components/__tests__/DictionaryAddForm.test.tsx
git commit -m "feat(options): Dictionary inline add form"
```

---

### Task 4: DictionaryCommandBar

**Files:**
- Create: `entrypoints/options/components/DictionaryCommandBar.tsx`
- Create: `entrypoints/options/components/__tests__/DictionaryCommandBar.test.tsx`

**Interfaces:**
- Produces:
  ```typescript
  export interface DictionaryCommandBarProps {
    searchQuery: string;
    onSearchChange: (q: string) => void;
    showSearch: boolean;
    onAddClick: () => void;
    addOpen: boolean;
    onImportClick: () => void;
    onExportJson: () => void;
    onExportCsv: () => void;
    exportDisabled: boolean;
    termCount: number;
  }
  export function DictionaryCommandBar(props: DictionaryCommandBarProps): JSX.Element;
  ```

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DictionaryCommandBar } from '../DictionaryCommandBar';

const base = {
  searchQuery: '',
  onSearchChange: vi.fn(),
  showSearch: true,
  onAddClick: vi.fn(),
  addOpen: false,
  onImportClick: vi.fn(),
  onExportJson: vi.fn(),
  onExportCsv: vi.fn(),
  exportDisabled: false,
  termCount: 3,
};

describe('DictionaryCommandBar', () => {
  it('hides search when showSearch is false; disables export when empty', () => {
    const { rerender } = render(<DictionaryCommandBar {...base} showSearch={false} />);
    expect(screen.queryByLabelText('Search terms')).not.toBeInTheDocument();
    rerender(<DictionaryCommandBar {...base} exportDisabled />);
    // Export menu trigger disabled — implement as button "Export" disabled when exportDisabled
    expect(screen.getByRole('button', { name: /Export/i })).toBeDisabled();
  });

  it('fires add and import', () => {
    render(<DictionaryCommandBar {...base} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add term' }));
    expect(base.onAddClick).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(base.onImportClick).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (module missing)**

Run: `pnpm exec vitest run entrypoints/options/components/__tests__/DictionaryCommandBar.test.tsx -v`

- [ ] **Step 3: Implement command bar**

Use a `Card variant="bordered"` (or toolbar strip) with:

- Search `Input` (`type="search"`, placeholder `Search terms…`, `aria-label="Search terms"`, Search icon) when `showSearch`
- Primary **Add term** (label can show as toggle when `addOpen` — still `Add term`)
- Secondary **Import**
- **Export** as a small disclosure: either two buttons in a `details`/popover, or a single button that expands a menu with “Export JSON” / “Export CSV”. Simplest acceptable: one **Export** button that is not disabled toggles a local `exportMenuOpen` state showing two menu buttons; when `exportDisabled`, the Export control is disabled.

```tsx
// Skeleton — full file should match interfaces and a11y labels in tests
export function DictionaryCommandBar(props: DictionaryCommandBarProps) {
  const [exportOpen, setExportOpen] = useState(false);
  // ... layout: flex wrap gap-2
  // Export: button disabled={exportDisabled} aria-expanded={exportOpen}
  // when open: buttons "Export JSON" / "Export CSV" calling props handlers then setExportOpen(false)
}
```

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add entrypoints/options/components/DictionaryCommandBar.tsx \
  entrypoints/options/components/__tests__/DictionaryCommandBar.test.tsx
git commit -m "feat(options): Dictionary command bar"
```

---

### Task 5: GlossaryEntryRow + GlossaryEntryList

**Files:**
- Create: `entrypoints/options/components/GlossaryEntryRow.tsx`
- Create: `entrypoints/options/components/GlossaryEntryList.tsx`
- Create: `entrypoints/options/components/__tests__/GlossaryEntryList.test.tsx`

**Interfaces:**
- Consumes: `GlossaryEntry`; `filterGlossaryEntries`, `sortMismatchesFirst` from `@/lib/glossary`; `Badge`, `Button`, `Input`
- Produces:
  ```typescript
  export interface GlossaryEntryRowProps {
    entry: GlossaryEntry;
    isEditing: boolean;
    isMismatched: boolean;
    editSource: string;
    editTarget: string;
    onEditSourceChange: (v: string) => void;
    onEditTargetChange: (v: string) => void;
    onStartEdit: () => void;
    onSaveEdit: () => void;
    onCancelEdit: () => void;
    onRequestDelete: () => void;
    editError?: string;
  }
  export function GlossaryEntryRow(props: GlossaryEntryRowProps): JSX.Element;

  export interface GlossaryEntryListProps {
    entries: GlossaryEntry[]; // full glossary
    searchQuery: string;
    mismatchedIds: ReadonlySet<string>;
    editingId: string | null;
    editSource: string;
    editTarget: string;
    editError?: string;
    onEditSourceChange: (v: string) => void;
    onEditTargetChange: (v: string) => void;
    onStartEdit: (entry: GlossaryEntry) => void;
    onSaveEdit: (id: string) => void;
    onCancelEdit: () => void;
    onRequestDelete: (id: string) => void;
    onClearSearch: () => void;
  }
  export function GlossaryEntryList(props: GlossaryEntryListProps): JSX.Element;
  ```

- [ ] **Step 1: Write list tests**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GlossaryEntryList } from '../GlossaryEntryList';
import type { GlossaryEntry } from '@/types/config';

const entries: GlossaryEntry[] = [
  { id: '1', source: 'Alpha', target: 'A1' },
  { id: '2', source: 'Beta', target: 'B1' },
  { id: '3', source: 'Gamma', target: 'G1' },
];

const noopHandlers = {
  editSource: '',
  editTarget: '',
  onEditSourceChange: vi.fn(),
  onEditTargetChange: vi.fn(),
  onStartEdit: vi.fn(),
  onSaveEdit: vi.fn(),
  onCancelEdit: vi.fn(),
  onRequestDelete: vi.fn(),
  onClearSearch: vi.fn(),
};

describe('GlossaryEntryList', () => {
  it('shows footer count and mismatch chip; sorts mismatches first', () => {
    render(
      <GlossaryEntryList
        entries={entries}
        searchQuery=""
        mismatchedIds={new Set(['3'])}
        editingId={null}
        {...noopHandlers}
      />,
    );
    expect(screen.getByText('3 terms')).toBeInTheDocument();
    expect(screen.getByText('Not honoured')).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveAttribute('aria-label', expect.stringContaining('Gamma'));
  });

  it('shows search miss empty state', () => {
    render(
      <GlossaryEntryList
        entries={entries}
        searchQuery="zzz"
        mismatchedIds={new Set()}
        editingId={null}
        {...noopHandlers}
      />,
    );
    expect(screen.getByText(/No terms match/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(noopHandlers.onClearSearch).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm exec vitest run entrypoints/options/components/__tests__/GlossaryEntryList.test.tsx -v`

- [ ] **Step 3: Implement row + list**

**Row (view):**  
`role` not required on row if parent listitem wraps it. Display:

- If `isMismatched`: `AlertTriangle` + `<Badge variant="warning">Not honoured</Badge>` with `title` from spec tooltip.
- `entry.source` · `ArrowRight` · `entry.target`
- `aria-label={`${entry.source} translates to ${entry.target}`}`
- Buttons: Edit (`PenLine`), Delete (`Trash2`) — ghost sm
- Click on text area → `onStartEdit`

**Row (edit):** inputs + Save/Cancel; Enter/Esc; `editError` as alert text.

**List:**

```tsx
const filtered = useMemo(
  () => filterGlossaryEntries(entries, searchQuery),
  [entries, searchQuery],
);
const ordered = useMemo(
  () => sortMismatchesFirst(filtered, mismatchedIds),
  [filtered, mismatchedIds],
);
```

- Card `p-0 overflow-hidden`
- `role="list"` + each row wrapper `role="listitem"`
- Footer count strings from spec
- Search miss: message + Clear search button

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add entrypoints/options/components/GlossaryEntryRow.tsx \
  entrypoints/options/components/GlossaryEntryList.tsx \
  entrypoints/options/components/__tests__/GlossaryEntryList.test.tsx
git commit -m "feat(options): glossary entry list and row UI"
```

---

### Task 6: GlossaryTranslatePreview polish

**Files:**
- Modify: `entrypoints/options/sections/GlossaryTranslatePreview.tsx`
- Create: `entrypoints/options/sections/__tests__/GlossaryTranslatePreview.test.tsx`

**Interfaces:**
- Consumes: same `onMismatchUpdate: (ids: Set<string>) => void`
- Produces: same export; add optional `defaultOpen?: boolean` (parent passes `glossary.length > 0` and only mounts when length > 0, so defaultOpen true is fine)
- Parent will **not mount** this component when `glossary.length === 0` (hide when empty).

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DEFAULT_SETTINGS } from '@/types/config';

vi.stubGlobal('chrome', {
  runtime: {
    sendMessage: vi.fn(async () => ({
      success: true,
      results: [{ id: 'preview', translatedText: 'hola React' }],
    })),
  },
  storage: {
    local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
});

import { useSettingsStore } from '@/stores/settingsStore';
import { GlossaryTranslatePreview } from '../GlossaryTranslatePreview';

describe('GlossaryTranslatePreview', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      ...DEFAULT_SETTINGS,
      isLoaded: true,
      glossary: [{ id: '1', source: 'React', target: 'React' }],
      sourceLanguage: 'en',
      targetLanguage: 'es',
    });
    vi.clearAllMocks();
  });

  it('is expanded by default and uses Verify copy', () => {
    render(<GlossaryTranslatePreview onMismatchUpdate={vi.fn()} />);
    expect(screen.getByText('Verify terms')).toBeInTheDocument();
    expect(screen.getByLabelText('Preview input text')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Verify/i })).toBeInTheDocument();
  });

  it('calls onMismatchUpdate after successful verify', async () => {
    const onMismatchUpdate = vi.fn();
    render(<GlossaryTranslatePreview onMismatchUpdate={onMismatchUpdate} />);
    fireEvent.change(screen.getByLabelText('Preview input text'), {
      target: { value: 'I love React' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Verify$/i }));
    await waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalled();
      expect(onMismatchUpdate).toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run — may FAIL on copy / collapsed default**

Run: `pnpm exec vitest run entrypoints/options/sections/__tests__/GlossaryTranslatePreview.test.tsx -v`

- [ ] **Step 3: Update component**

Changes vs current:

1. `const [isOpen, setIsOpen] = useState(true);` // expanded by default  
2. Header title **Verify terms**; subtitle **Check that preferred translations show up in the output.**  
3. Button label **Verify** / **Verifying…**  
4. Success/fail copy from spec: *All terms honoured* / *{M} terms missing from output — marked in the list*  
5. Replace raw textarea with `@/ui/Textarea` where practical  
6. Keep `id="glossary-preview-toggle"`, `id="glossary-preview-input"`, `id="glossary-preview-btn"` for stability  
7. Optional: `sm:grid sm:grid-cols-2` for input | result when both present  

Do not change mismatch detection logic.

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add entrypoints/options/sections/GlossaryTranslatePreview.tsx \
  entrypoints/options/sections/__tests__/GlossaryTranslatePreview.test.tsx
git commit -m "feat(options): elevate glossary verify panel UX"
```

---

### Task 7: Rewrite DictionarySection + section tests

**Files:**
- Rewrite: `entrypoints/options/sections/DictionarySection.tsx`
- Create: `entrypoints/options/sections/__tests__/DictionarySection.test.tsx`

**Interfaces:**
- Consumes: all components above; `useSettingsStore`; glossary helpers; import/export from `@/lib/glossary`
- Produces: `export function DictionarySection(): JSX.Element` (no props)

**Example terms for “Use examples”:**

```typescript
const EXAMPLE_TERMS: Omit<GlossaryEntry, 'id'>[] = [
  { source: 'React', target: 'React' },
  { source: 'API', target: 'API' },
  { source: 'machine learning', target: 'machine learning' },
];
```

(ids via `crypto.randomUUID()` on insert; append or prepend — use **prepend** each or batch-prepend).

- [ ] **Step 1: Write section tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DEFAULT_SETTINGS } from '@/types/config';
import { ToastProvider } from '@/ui/ToastProvider';

vi.stubGlobal('chrome', {
  runtime: { sendMessage: vi.fn() },
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: undefined })),
      set: vi.fn(async () => {}),
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
});

import { useSettingsStore } from '@/stores/settingsStore';
import { DictionarySection } from '../DictionarySection';

function renderSection() {
  return render(
    <ToastProvider>
      <DictionarySection />
    </ToastProvider>,
  );
}

describe('DictionarySection', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      ...DEFAULT_SETTINGS,
      isLoaded: true,
      glossary: [],
    });
    vi.clearAllMocks();
  });

  it('shows empty hero and custom terms header', () => {
    renderSection();
    expect(screen.getByRole('heading', { name: 'Custom terms' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No custom terms yet' })).toBeInTheDocument();
    expect(screen.queryByText('Verify terms')).not.toBeInTheDocument();
  });

  it('opens add form from empty hero and prepends a term', async () => {
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'Add first term' }));
    fireEvent.change(screen.getByLabelText('Source term'), { target: { value: 'Foo' } });
    fireEvent.change(screen.getByLabelText('Preferred translation'), {
      target: { value: 'Bar' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => {
      const g = useSettingsStore.getState().glossary;
      expect(g).toHaveLength(1);
      expect(g[0].source).toBe('Foo');
      expect(g[0].target).toBe('Bar');
    });
    expect(screen.getByText('Verify terms')).toBeInTheDocument();
  });

  it('blocks duplicate source terms', async () => {
    useSettingsStore.setState({
      glossary: [{ id: '1', source: 'Foo', target: 'Bar' }],
    });
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'Add term' }));
    fireEvent.change(screen.getByLabelText('Source term'), { target: { value: 'foo' } });
    fireEvent.change(screen.getByLabelText('Preferred translation'), {
      target: { value: 'Other' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This source term already exists',
    );
    expect(useSettingsStore.getState().glossary).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (old UI titles / missing empty hero)

Run: `pnpm exec vitest run entrypoints/options/sections/__tests__/DictionarySection.test.tsx -v`

- [ ] **Step 3: Rewrite `DictionarySection.tsx`**

Composition sketch:

```tsx
export function DictionarySection() {
  const glossary = useSettingsStore((s) => s.glossary);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  // local: searchQuery, addOpen, newSource, newTarget, addError,
  // editingId, editSource, editTarget, editError,
  // mismatchedIds, pendingDeleteId, fileInputRef
  // toast

  const handleAdd = () => {
    const dup = findDuplicateSource(glossary, newSource);
    if (dup) {
      setAddError('This source term already exists');
      return;
    }
    if (!newSource.trim() || !newTarget.trim()) return;
    const entry = { id: crypto.randomUUID(), source: newSource.trim(), target: newTarget.trim() };
    updateSettings({ glossary: [entry, ...glossary] }); // PREPEND
    setNewSource('');
    setNewTarget('');
    setAddError(undefined);
    setMismatchedIds(new Set());
  };

  // handleEditSave: findDuplicateSource(glossary, editSource, id); map update; clear edit
  // handleImport: parse + append [...glossary, ...entries]
  // handleUseExamples: prepend example batch
  // drag-drop optional: onDragOver preventDefault + highlight; onDrop files

  return (
    <div className="animate-fade-in-up">
      <SectionHeader
        title="Custom terms"
        description="Pin exact translations for names, brands, and jargon so the model doesn’t improvise."
        icon={<BookOpen className="w-4 h-4" />}
        accentColor="emerald"
      />
      {glossary.length > 0 && (
        <p className="text-xs text-zinc-500 mb-3">
          {glossary.length} {glossary.length === 1 ? 'term' : 'terms'}
          {mismatchedIds.size > 0 && (
            <span className="text-amber-400">
              {' '}· {mismatchedIds.size} not honoured in last check
            </span>
          )}
          <span className="text-zinc-600"> · Terms are applied on the next translation.</span>
        </p>
      )}
      <div className="space-y-4">
        <DictionaryCommandBar /* ... */ showSearch={glossary.length > 0} exportDisabled={glossary.length === 0} />
        {addOpen && <DictionaryAddForm /* ... */ />}
        {glossary.length === 0 ? (
          <DictionaryEmptyHero
            onAddFirst={() => setAddOpen(true)}
            onImport={() => fileInputRef.current?.click()}
            onUseExamples={handleUseExamples}
          />
        ) : (
          <GlossaryEntryList /* ... */ />
        )}
        {glossary.length > 0 && (
          <GlossaryTranslatePreview onMismatchUpdate={setMismatchedIds} />
        )}
      </div>
      <input ref={fileInputRef} type="file" accept=".json,.csv" className="hidden" onChange={...} />
      {pendingDeleteId && <Modal /* delete copy from spec */ />}
    </div>
  );
}
```

Keep import/export blob download logic from the current file (move into handlers). Use toast for import/export/examples only.

- [ ] **Step 4: Run section tests — PASS**

Run: `pnpm exec vitest run entrypoints/options/sections/__tests__/DictionarySection.test.tsx -v`

- [ ] **Step 5: Commit**

```bash
git add entrypoints/options/sections/DictionarySection.tsx \
  entrypoints/options/sections/__tests__/DictionarySection.test.tsx
git commit -m "feat(options): redesign Dictionary section as term library"
```

---

### Task 8: Full verification + handoff

**Files:** none new — quality gate only.

- [ ] **Step 1: Run focused + compile**

```bash
pnpm exec vitest run lib/__tests__/glossary.test.ts \
  entrypoints/options/components/__tests__/DictionaryEmptyHero.test.tsx \
  entrypoints/options/components/__tests__/DictionaryAddForm.test.tsx \
  entrypoints/options/components/__tests__/DictionaryCommandBar.test.tsx \
  entrypoints/options/components/__tests__/GlossaryEntryList.test.tsx \
  entrypoints/options/sections/__tests__/GlossaryTranslatePreview.test.tsx \
  entrypoints/options/sections/__tests__/DictionarySection.test.tsx -v
pnpm run compile
```

Expected: all PASS; `tsc --noEmit` clean.

- [ ] **Step 2: Manual checklist (options UI)**

1. Empty → hero, no Verify, no search.  
2. Add first term → list + Verify open; status strip shows 1 term.  
3. Duplicate blocked.  
4. Edit / delete confirm.  
5. Import JSON/CSV; export both formats.  
6. Search miss + clear.  
7. Verify with provider (if key configured) → mismatch chip + sort.  
8. Advanced still has selection dictionary toggle; unchanged.

- [ ] **Step 3: Commit any fixes; push per project session rules when ending session**

```bash
git status
# if fixes: commit
git pull --rebase
bd dolt push  # if beads used for this work
git push
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| IA: header → status → command bar → body → verify | 7 |
| Copy kit (Custom terms, Verify terms, etc.) | 2, 6, 7 |
| Empty hero + examples CTA | 2, 7 |
| Command bar search/add/import/export | 4, 7 |
| Inline add, prepend, duplicate block | 3, 1, 7 |
| List rows source → target, mismatch chip | 5 |
| Mismatch sort first | 1, 5 |
| Verify hidden empty / open by default | 6, 7 |
| No schema / selection-dict changes | Global + all tasks |
| Component split | 2–7 |
| A11y labels, not color-only mismatch | 5, 6 |
| Drag-drop import | Optional in Task 7 (Import button required) |

## Self-review notes

- No TBD placeholders in task code.  
- Helper names consistent: `findDuplicateSource`, `filterGlossaryEntries`, `sortMismatchesFirst`.  
- `Input` ref: Task 3 notes `autoFocus` fallback if no `forwardRef`.  
- Drag-drop is progressive enhancement; Import button is the a11y path.
