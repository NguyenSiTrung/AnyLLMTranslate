# Glossary Import Format Hints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add always-visible format hints, an expandable guide, and downloadable JSON/CSV templates on Custom terms and Named lists so users know which files import accepts and what content looks like.

**Architecture:** Pure template strings + download helper in `lib/glossaryImportTemplates.ts` (unit-tested through existing parsers). Shared presentational `GlossaryImportHint` component mounted under Dictionary command bar, empty hero, and named-list detail Import row. No parse/append behavior changes.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Lucide React, Vitest + Testing Library, existing `ui/Button`, Blob+anchor download pattern from Dictionary export.

**Spec:** `docs/superpowers/specs/2026-07-21-glossary-import-format-hints-design.md`

## Global Constraints

- Do **not** change `parseGlossaryJSON` / `parseGlossaryCSV` / append merge semantics.
- Do **not** touch Advanced → Data Portability settings import.
- Do **not** add i18n or new settings schema fields.
- Template sample terms must match dictionary examples: `React`, `API`, `machine learning`.
- Template file bytes and on-screen samples must come from the same constants (no duplicated sample strings in the component).
- Track work with **bd**; do not use TodoWrite.
- Prefer non-interactive shell flags; run targeted vitest paths listed per task.
- TDD: pure helpers first, then component tests, then UI wiring.

---

## File map

| File | Responsibility |
|------|----------------|
| Create `lib/glossaryImportTemplates.ts` | Template string constants, filenames, `downloadGlossaryTemplate` |
| Create `lib/__tests__/glossaryImportTemplates.test.ts` | Parser round-trip + download helper smoke |
| Create `entrypoints/options/components/GlossaryImportHint.tsx` | Collapsed line, expand panel, samples, download buttons |
| Create `entrypoints/options/components/__tests__/GlossaryImportHint.test.tsx` | Expand, samples visible, downloads, optional choose-file |
| Modify `entrypoints/options/sections/DictionarySection.tsx` | Mount hint under command bar with `onChooseFile` |
| Modify `entrypoints/options/components/DictionaryEmptyHero.tsx` | Mount hint under CTAs |
| Modify `entrypoints/options/components/NamedGlossaryListDetail.tsx` | Mount hint under Import header row |
| Modify `entrypoints/options/components/__tests__/DictionaryEmptyHero.test.tsx` | Assert hint collapsed line present |
| Spec (already done) | `docs/superpowers/specs/2026-07-21-glossary-import-format-hints-design.md` |

**Do not modify:** `lib/glossary.ts` parsers, Advanced settings import UI, export menus (except reusing icon patterns), named-list push/cap logic.

---

### Task 1: Template constants + download helper + unit tests

**Files:**
- Create: `lib/glossaryImportTemplates.ts`
- Create: `lib/__tests__/glossaryImportTemplates.test.ts`

**Interfaces:**
- Consumes: `parseGlossaryJSON`, `parseGlossaryCSV` from `@/lib/glossary` (tests only)
- Produces:
  - `export const GLOSSARY_JSON_TEMPLATE: string`
  - `export const GLOSSARY_CSV_TEMPLATE: string`
  - `export const GLOSSARY_JSON_TEMPLATE_FILENAME = 'anyllm-glossary-template.json'`
  - `export const GLOSSARY_CSV_TEMPLATE_FILENAME = 'anyllm-glossary-template.csv'`
  - `export type GlossaryTemplateFormat = 'json' | 'csv'`
  - `export function downloadGlossaryTemplate(format: GlossaryTemplateFormat): void`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/__tests__/glossaryImportTemplates.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseGlossaryCSV, parseGlossaryJSON } from '@/lib/glossary';
import {
  GLOSSARY_CSV_TEMPLATE,
  GLOSSARY_CSV_TEMPLATE_FILENAME,
  GLOSSARY_JSON_TEMPLATE,
  GLOSSARY_JSON_TEMPLATE_FILENAME,
  downloadGlossaryTemplate,
} from '@/lib/glossaryImportTemplates';

describe('glossary import templates', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('JSON template parses to the three example terms', () => {
    const entries = parseGlossaryJSON(GLOSSARY_JSON_TEMPLATE);
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.source)).toEqual([
      'React',
      'API',
      'machine learning',
    ]);
    expect(entries.map((e) => e.target)).toEqual([
      'React',
      'API',
      'machine learning',
    ]);
  });

  it('CSV template parses to the three example terms', () => {
    const entries = parseGlossaryCSV(GLOSSARY_CSV_TEMPLATE);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({ source: 'React', target: 'React' });
    expect(entries[1]).toMatchObject({ source: 'API', target: 'API' });
    expect(entries[2]).toMatchObject({
      source: 'machine learning',
      target: 'machine learning',
    });
  });

  it('downloadGlossaryTemplate creates a blob download with the right name', () => {
    const createObjectURL = vi.fn(() => 'blob:template');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', {
      createObjectURL,
      revokeObjectURL,
    });

    const click = vi.fn();
    const anchor = {
      href: '',
      download: '',
      click,
    } as unknown as HTMLAnchorElement;
    const createElement = vi
      .spyOn(document, 'createElement')
      .mockReturnValue(anchor);

    downloadGlossaryTemplate('json');

    expect(createElement).toHaveBeenCalledWith('a');
    expect(createObjectURL).toHaveBeenCalledOnce();
    const blob = createObjectURL.mock.calls[0]![0] as Blob;
    expect(blob.type).toBe('application/json');
    expect(anchor.download).toBe(GLOSSARY_JSON_TEMPLATE_FILENAME);
    expect(anchor.href).toBe('blob:template');
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:template');

    downloadGlossaryTemplate('csv');
    expect(anchor.download).toBe(GLOSSARY_CSV_TEMPLATE_FILENAME);
    const csvBlob = createObjectURL.mock.calls[1]![0] as Blob;
    expect(csvBlob.type).toBe('text/csv');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run lib/__tests__/glossaryImportTemplates.test.ts`

Expected: FAIL — module `@/lib/glossaryImportTemplates` not found

- [ ] **Step 3: Implement minimal module**

```typescript
// lib/glossaryImportTemplates.ts
/**
 * Downloadable glossary import templates + helper.
 * Samples must stay in sync with UI (GlossaryImportHint) and parse via lib/glossary.
 */

export type GlossaryTemplateFormat = 'json' | 'csv';

export const GLOSSARY_JSON_TEMPLATE_FILENAME = 'anyllm-glossary-template.json';
export const GLOSSARY_CSV_TEMPLATE_FILENAME = 'anyllm-glossary-template.csv';

/** Pretty-printed JSON array of { source, target } — authoritative sample bytes. */
export const GLOSSARY_JSON_TEMPLATE = `[
  { "source": "React", "target": "React" },
  { "source": "API", "target": "API" },
  { "source": "machine learning", "target": "machine learning" }
]
`;

/** CSV with header source,target — authoritative sample bytes. */
export const GLOSSARY_CSV_TEMPLATE = `source,target
React,React
API,API
machine learning,machine learning
`;

export function downloadGlossaryTemplate(format: GlossaryTemplateFormat): void {
  const isJson = format === 'json';
  const content = isJson ? GLOSSARY_JSON_TEMPLATE : GLOSSARY_CSV_TEMPLATE;
  const filename = isJson
    ? GLOSSARY_JSON_TEMPLATE_FILENAME
    : GLOSSARY_CSV_TEMPLATE_FILENAME;
  const mime = isJson ? 'application/json' : 'text/csv';

  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run lib/__tests__/glossaryImportTemplates.test.ts`

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/glossaryImportTemplates.ts lib/__tests__/glossaryImportTemplates.test.ts
git commit -m "$(cat <<'EOF'
feat(glossary): add import template constants and download helper

JSON/CSV samples parse through existing glossary parsers and download
via the same Blob+anchor pattern as dictionary export.
EOF
)"
```

---

### Task 2: `GlossaryImportHint` component + tests

**Files:**
- Create: `entrypoints/options/components/GlossaryImportHint.tsx`
- Create: `entrypoints/options/components/__tests__/GlossaryImportHint.test.tsx`

**Interfaces:**
- Consumes:
  - `GLOSSARY_JSON_TEMPLATE`, `GLOSSARY_CSV_TEMPLATE`, `downloadGlossaryTemplate` from `@/lib/glossaryImportTemplates`
  - `Button` from `@/ui/Button`
  - Lucide: `ChevronDown`, `ChevronRight`, `FileJson`, `FileText`, `Upload` (Upload only if `onChooseFile` shown)
- Produces:
  - `export interface GlossaryImportHintProps { className?: string; onChooseFile?: () => void; defaultExpanded?: boolean }`
  - `export function GlossaryImportHint(props: GlossaryImportHintProps): JSX.Element`

- [ ] **Step 1: Write the failing component tests**

```typescript
// entrypoints/options/components/__tests__/GlossaryImportHint.test.tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GlossaryImportHint } from '../GlossaryImportHint';
import * as templates from '@/lib/glossaryImportTemplates';

vi.mock('@/lib/glossaryImportTemplates', async () => {
  const actual = await vi.importActual<typeof import('@/lib/glossaryImportTemplates')>(
    '@/lib/glossaryImportTemplates',
  );
  return {
    ...actual,
    downloadGlossaryTemplate: vi.fn(),
  };
});

describe('GlossaryImportHint', () => {
  beforeEach(() => {
    vi.mocked(templates.downloadGlossaryTemplate).mockClear();
  });

  it('shows collapsed format line and expands to samples + downloads', () => {
    render(<GlossaryImportHint />);

    expect(screen.getByText(/Supports/i)).toBeInTheDocument();
    expect(screen.getByText(/JSON/i)).toBeInTheDocument();
    expect(screen.getByText(/CSV/i)).toBeInTheDocument();

    // Samples hidden until expand
    expect(screen.queryByText(/"source": "React"/)).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: /See format/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    expect(screen.getByLabelText('Glossary import format')).toBeInTheDocument();
    expect(screen.getByText(/"source": "React"/)).toBeInTheDocument();
    expect(screen.getByText(/source,target/)).toBeInTheDocument();
    expect(screen.getByText(/appends/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Download JSON template' }));
    expect(templates.downloadGlossaryTemplate).toHaveBeenCalledWith('json');

    fireEvent.click(screen.getByRole('button', { name: 'Download CSV template' }));
    expect(templates.downloadGlossaryTemplate).toHaveBeenCalledWith('csv');
  });

  it('fires onChooseFile when Choose file is provided', () => {
    const onChooseFile = vi.fn();
    render(<GlossaryImportHint defaultExpanded onChooseFile={onChooseFile} />);

    fireEvent.click(screen.getByRole('button', { name: /Choose file/i }));
    expect(onChooseFile).toHaveBeenCalledOnce();
  });

  it('hides Choose file when onChooseFile is omitted', () => {
    render(<GlossaryImportHint defaultExpanded />);
    expect(screen.queryByRole('button', { name: /Choose file/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run entrypoints/options/components/__tests__/GlossaryImportHint.test.tsx`

Expected: FAIL — `GlossaryImportHint` not found

- [ ] **Step 3: Implement the component**

```tsx
// entrypoints/options/components/GlossaryImportHint.tsx
/**
 * Glossary import format hint — collapsed line + expandable guide + templates.
 * Used on Custom terms and Named lists (same JSON/CSV shapes).
 */

import { useId, useState } from 'react';
import { ChevronDown, ChevronRight, FileJson, FileText, Upload } from 'lucide-react';
import {
  GLOSSARY_CSV_TEMPLATE,
  GLOSSARY_JSON_TEMPLATE,
  downloadGlossaryTemplate,
} from '@/lib/glossaryImportTemplates';
import { Button } from '@/ui/Button';

export interface GlossaryImportHintProps {
  className?: string;
  /** When set, show a "Choose file…" control that opens the existing file input. */
  onChooseFile?: () => void;
  /** Default collapsed. */
  defaultExpanded?: boolean;
}

export function GlossaryImportHint({
  className = '',
  onChooseFile,
  defaultExpanded = false,
}: GlossaryImportHintProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const panelId = useId();

  return (
    <div className={`text-xs text-zinc-500 ${className}`.trim()}>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <span>
          Supports <span className="font-medium text-zinc-400">JSON</span> or{' '}
          <span className="font-medium text-zinc-400">CSV</span>
        </span>
        <span className="text-zinc-600" aria-hidden="true">
          ·
        </span>
        <button
          type="button"
          className="inline-flex items-center gap-0.5 text-zinc-400 hover:text-zinc-200 cursor-pointer underline-offset-2 hover:underline"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (
            <ChevronDown className="w-3 h-3" aria-hidden="true" />
          ) : (
            <ChevronRight className="w-3 h-3" aria-hidden="true" />
          )}
          See format
        </button>
      </div>

      {expanded && (
        <div
          id={panelId}
          role="region"
          aria-label="Glossary import format"
          className="mt-2 rounded-lg border border-dashed border-zinc-700/80 bg-zinc-900/40 px-3 py-2.5 space-y-3"
        >
          <div>
            <p className="font-medium text-zinc-400 mb-1">Supported files</p>
            <ul className="list-disc list-inside space-y-0.5 text-zinc-500">
              <li>
                <code className="text-zinc-400">.json</code> — array of{' '}
                <code className="text-zinc-400">{'{ source, target }'}</code> objects
              </li>
              <li>
                <code className="text-zinc-400">.csv</code> — two columns; header optional but
                recommended
              </li>
            </ul>
          </div>

          <div>
            <p className="font-medium text-zinc-400 mb-1">JSON example</p>
            <pre className="overflow-x-auto rounded-md border border-zinc-800 bg-zinc-950/60 p-2 font-mono text-[11px] leading-relaxed text-zinc-300 whitespace-pre">
              {GLOSSARY_JSON_TEMPLATE.trimEnd()}
            </pre>
          </div>

          <div>
            <p className="font-medium text-zinc-400 mb-1">CSV example</p>
            <pre className="overflow-x-auto rounded-md border border-zinc-800 bg-zinc-950/60 p-2 font-mono text-[11px] leading-relaxed text-zinc-300 whitespace-pre">
              {GLOSSARY_CSV_TEMPLATE.trimEnd()}
            </pre>
          </div>

          <div>
            <p className="font-medium text-zinc-400 mb-1">Rules</p>
            <ul className="list-disc list-inside space-y-0.5 text-zinc-500">
              <li>
                Required fields: <code className="text-zinc-400">source</code> and{' '}
                <code className="text-zinc-400">target</code> (strings)
              </li>
              <li>
                CSV header <code className="text-zinc-400">source,target</code> is optional; skipped
                when present
              </li>
              <li>Import appends terms — it does not replace the whole list</li>
              <li>Invalid files show an error toast; fix the file and try again</li>
            </ul>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={<FileJson className="w-3.5 h-3.5" />}
              onClick={() => downloadGlossaryTemplate('json')}
            >
              Download JSON template
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={<FileText className="w-3.5 h-3.5" />}
              onClick={() => downloadGlossaryTemplate('csv')}
            >
              Download CSV template
            </Button>
            {onChooseFile && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={<Upload className="w-3.5 h-3.5" />}
                onClick={onChooseFile}
              >
                Choose file…
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

Notes for implementer:
- Use template constants for `<pre>` content so UI cannot drift from downloadable files.
- `Button` may or may not forward `type="button"` — if the prop is not in `Button`’s API, omit `type` (buttons inside non-form contexts are fine). Check `ui/Button.tsx` and match existing call sites.
- If `getByText(/"source": "React"/)` is flaky due to whitespace, assert with a function matcher on the `<pre>` text content or `screen.getByText((content, el) => el?.tagName === 'PRE' && content.includes('"source": "React"'))`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run entrypoints/options/components/__tests__/GlossaryImportHint.test.tsx`

Expected: PASS

If a selector fails on whitespace, adjust the test matcher only (keep component samples from constants).

- [ ] **Step 5: Commit**

```bash
git add \
  entrypoints/options/components/GlossaryImportHint.tsx \
  entrypoints/options/components/__tests__/GlossaryImportHint.test.tsx
git commit -m "$(cat <<'EOF'
feat(options): add GlossaryImportHint format guide component

Collapsed JSON/CSV line with expandable samples, rules, and
downloadable templates for dictionary import UX.
EOF
)"
```

---

### Task 3: Mount on Custom terms (Dictionary section + empty hero)

**Files:**
- Modify: `entrypoints/options/sections/DictionarySection.tsx`
- Modify: `entrypoints/options/components/DictionaryEmptyHero.tsx`
- Modify: `entrypoints/options/components/__tests__/DictionaryEmptyHero.test.tsx`

**Interfaces:**
- Consumes: `GlossaryImportHint` from `../components/GlossaryImportHint` (section) / `./GlossaryImportHint` (hero)
- Produces: no new exports

- [ ] **Step 1: Extend empty-hero test (failing until wired)**

In `DictionaryEmptyHero.test.tsx`, after existing CTA assertions, add:

```typescript
  it('shows glossary import format hint', () => {
    render(
      <DictionaryEmptyHero onAddFirst={vi.fn()} onImport={vi.fn()} />,
    );
    expect(screen.getByText(/Supports/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /See format/i })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run empty-hero test — expect fail on hint**

Run: `pnpm exec vitest run entrypoints/options/components/__tests__/DictionaryEmptyHero.test.tsx`

Expected: new test FAIL (no “Supports” / “See format”)

- [ ] **Step 3: Wire `DictionaryEmptyHero`**

Import and render under the action button row:

```tsx
import { GlossaryImportHint } from './GlossaryImportHint';

// inside the card, after the flex button row:
<div className="mt-4 w-full max-w-md">
  <GlossaryImportHint onChooseFile={onImport} />
</div>
```

Keep existing buttons unchanged (`Import file` still calls `onImport`).

- [ ] **Step 4: Wire `DictionarySection` under command bar**

Import:

```tsx
import { GlossaryImportHint } from '../components/GlossaryImportHint';
```

Immediately after the command-bar stagger block (after `</div>` that wraps `DictionaryCommandBar`), add:

```tsx
<div className="animate-stagger px-0.5" style={stagger(0.5)}>
  <GlossaryImportHint onChooseFile={() => fileInputRef.current?.click()} />
</div>
```

If `stagger(0.5)` is awkward, use `stagger(1)` and bump subsequent stagger indexes by +1, **or** place the hint inside the same stagger(0) card stack without a fractional index:

```tsx
<div className="animate-stagger" style={stagger(0)}>
  <DictionaryCommandBar ... />
  <div className="mt-2 px-0.5">
    <GlossaryImportHint onChooseFile={() => fileInputRef.current?.click()} />
  </div>
</div>
```

Prefer the **inside same stagger(0)** placement to avoid renumbering.

Ensure the hidden file input keeps `accept=".json,.csv"` and gains an explicit label if missing:

```tsx
aria-label="Import glossary terms from JSON or CSV"
```

- [ ] **Step 5: Run related tests**

```bash
pnpm exec vitest run \
  entrypoints/options/components/__tests__/DictionaryEmptyHero.test.tsx \
  entrypoints/options/components/__tests__/DictionaryCommandBar.test.tsx \
  entrypoints/options/components/__tests__/GlossaryImportHint.test.tsx \
  entrypoints/options/sections/__tests__/DictionarySection.namedLists.test.tsx
```

Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add \
  entrypoints/options/sections/DictionarySection.tsx \
  entrypoints/options/components/DictionaryEmptyHero.tsx \
  entrypoints/options/components/__tests__/DictionaryEmptyHero.test.tsx
git commit -m "$(cat <<'EOF'
feat(options): show glossary import format hints on Custom terms

Mount GlossaryImportHint under the dictionary command bar and empty
hero so supported formats and templates are discoverable.
EOF
)"
```

---

### Task 4: Mount on Named list detail

**Files:**
- Modify: `entrypoints/options/components/NamedGlossaryListDetail.tsx`
- Optionally extend: `entrypoints/options/sections/__tests__/DictionarySection.namedLists.test.tsx`

**Interfaces:**
- Consumes: `GlossaryImportHint`, existing `fileRef` click handler
- Produces: no new exports

- [ ] **Step 1: Add regression assertion to named-lists test**

In the test that opens a list (`creates and opens a named list` or the import test), after opening detail, assert:

```typescript
expect(screen.getByRole('button', { name: /See format/i })).toBeInTheDocument();
expect(screen.getByText(/Supports/i)).toBeInTheDocument();
```

- [ ] **Step 2: Run named-lists test — expect fail**

Run: `pnpm exec vitest run entrypoints/options/sections/__tests__/DictionarySection.namedLists.test.tsx`

Expected: FAIL on missing “See format” until wired

- [ ] **Step 3: Wire `NamedGlossaryListDetail`**

Import:

```tsx
import { GlossaryImportHint } from './GlossaryImportHint';
```

After the header row that contains Back / title / Import (the first `flex flex-wrap items-center gap-3` block), add:

```tsx
<GlossaryImportHint onChooseFile={() => fileRef.current?.click()} />
```

Keep the existing Import button and hidden file input. Ensure file input retains:

```tsx
accept=".csv,.json"
aria-label={`Import entries into ${list.name}`}
```

Because the file is dense one-liners today, it is OK to expand only the return JSX structure enough to insert the hint cleanly (prefer readability over preserving extreme line compression for the touched block).

- [ ] **Step 4: Run tests**

```bash
pnpm exec vitest run \
  entrypoints/options/sections/__tests__/DictionarySection.namedLists.test.tsx \
  entrypoints/options/components/__tests__/GlossaryImportHint.test.tsx \
  lib/__tests__/glossaryImportTemplates.test.ts
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add \
  entrypoints/options/components/NamedGlossaryListDetail.tsx \
  entrypoints/options/sections/__tests__/DictionarySection.namedLists.test.tsx
git commit -m "$(cat <<'EOF'
feat(options): show glossary import format hints on named lists

Reuse GlossaryImportHint under list detail Import so subtitle lock
lists share the same format guide and templates as Custom terms.
EOF
)"
```

---

### Task 5: Final verification

**Files:** none new (verification only)

- [ ] **Step 1: Run focused suite**

```bash
pnpm exec vitest run \
  lib/__tests__/glossaryImportTemplates.test.ts \
  lib/__tests__/glossary.test.ts \
  entrypoints/options/components/__tests__/GlossaryImportHint.test.tsx \
  entrypoints/options/components/__tests__/DictionaryEmptyHero.test.tsx \
  entrypoints/options/components/__tests__/DictionaryCommandBar.test.tsx \
  entrypoints/options/sections/__tests__/DictionarySection.namedLists.test.tsx
```

Expected: all PASS

- [ ] **Step 2: Typecheck (if time / CI cares)**

Run: `pnpm run compile`

Expected: no errors in touched files

- [ ] **Step 3: Manual smoke checklist (options page)**

1. Settings → Custom terms (empty): see “Supports JSON or CSV · See format” under empty hero  
2. Expand: both samples match templates; Download JSON / CSV produce files named `anyllm-glossary-template.*`  
3. Import downloaded JSON → 3 terms added; Import downloaded CSV into a fresh empty glossary path works  
4. With terms present: hint still under command bar; Import still works  
5. Named lists → create/open list → same hint under Import; import template into list works  
6. Advanced → Data Portability unchanged  

- [ ] **Step 4: Close beads issue(s) if any were filed for this work**

```bash
bd close <id> --reason="Glossary import format hints shipped"
```

- [ ] **Step 5: Final commit only if verification fixed anything; otherwise done**

If only docs/status changed, skip empty commit.

---

## Spec coverage checklist (plan self-review)

| Spec requirement | Task |
|------------------|------|
| Always-visible JSON/CSV line | Task 2, 3, 4 |
| Expandable guide with samples + rules | Task 2 |
| Download JSON + CSV templates | Task 1, 2 |
| Shared component both surfaces | Task 2–4 |
| Empty hero placement | Task 3 |
| Named list detail placement | Task 4 |
| Templates parse via real parsers | Task 1 |
| No parse/append behavior change | Global + no parser edits |
| Advanced import out of scope | Global / file map |
| a11y: aria-expanded, region label, button labels | Task 2 implementation |
| Append semantics documented in rules | Task 2 copy |
| Sample terms React/API/machine learning | Task 1 constants |

## Placeholder / consistency scan

- No TBD/TODO left in tasks  
- Filenames: `anyllm-glossary-template.json` / `.csv` consistent across tasks  
- Helper name: `downloadGlossaryTemplate` only  
- Component name: `GlossaryImportHint` only  
- Props: `onChooseFile`, `defaultExpanded`, `className` only  
