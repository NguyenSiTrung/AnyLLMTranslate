# Glossary Import Format Hints — Design

Date: 2026-07-21  
Status: Approved (pending user spec file review)

## Problem

Settings → **Custom terms** and **Named lists** both support file import (`.json` / `.csv`), but the UI only exposes an **Import** button (and drag-drop on Custom terms). Users get no guidance on:

1. Which file types are supported  
2. What the file content must look like (field names, header, array vs object)  
3. A ready-made template they can download, edit, and re-import  

Today the only discovery path is trial-and-error (or reading `lib/glossary.ts`). Failed imports surface a toast, but that is reactive, not educational.

Advanced → Data Portability (settings JSON) is **out of scope** for this change.

## Goal

Make glossary import self-explanatory on both screens that accept glossary files:

- Always-visible short hint: supported formats  
- Expandable guide: exact JSON/CSV shape + short rules  
- Downloadable templates: separate JSON and CSV sample files  

Import/parse/append behavior stays unchanged.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | Custom terms + Named lists only | Same parsers (`parseGlossaryJSON` / `parseGlossaryCSV`); highest confusion |
| Presentation | **C** — short inline line + expandable panel | Low friction when known; full help when not |
| Templates | **A** — separate Download JSON + Download CSV | Matches `accept` list; simple; no zip dependency |
| Implementation | Shared `GlossaryImportHint` component | One source of truth for both screens |
| Behavior change | None (append-only import, same parsers) | UX-only; no risk to existing data |

## Approach comparison

| Approach | Summary | Verdict |
|----------|---------|---------|
| 1. Shared hint component + template helpers | One component, two mount points, shared download helpers | **Chosen** |
| 2. Duplicate copy in each screen | Fast but drifts | Rejected |
| 3. Import modal only (no always-visible line) | Clear but extra click for experts | Rejected (user chose C) |

## Current behavior (unchanged)

| Surface | Accept | Parser selection | Merge |
|---------|--------|------------------|-------|
| Custom terms (`DictionarySection`) | `.json,.csv` | extension `.json` → JSON, else CSV | Append to `settings.glossary` |
| Named list detail (`NamedGlossaryListDetail`) | `.csv,.json` | same | `pushEntriesIntoList` (cap + dedupe rules) |
| Drag-drop | Custom terms container only | same as file input | same |

Canonical shapes already enforced by `lib/glossary.ts`:

**JSON** — top-level array of objects with string `source` and `target`:

```json
[
  { "source": "React", "target": "React" },
  { "source": "API", "target": "API" }
]
```

**CSV** — two columns; optional header `source,target` (or `target,source`); quoted fields supported:

```csv
source,target
React,React
API,API
```

## UX design

### Collapsed (always visible)

One muted line near Import:

> Supports **JSON** or **CSV** · [See format]

- “See format” toggles the expanded panel (local React state; not persisted).  
- Chevron or similar affordance optional; text link is enough if it matches existing patterns.

### Expanded panel

Bordered/subtle panel (`text-xs`, zinc palette, monospaced samples) containing:

1. **Supported files**  
   - `.json` — array of `{ source, target }` objects  
   - `.csv` — two columns; header optional but recommended  

2. **JSON example** — fenced mini sample (same content as downloadable template)  

3. **CSV example** — fenced mini sample (same content as downloadable template)  

4. **Rules (short bullet list)**  
   - Required: `source` and `target` as strings  
   - CSV header `source,target` optional; skipped when present  
   - Import **appends** terms (does not replace the whole list)  
   - Named lists still enforce existing max entry cap / validation via `pushEntriesIntoList`  
   - Invalid files keep current error toast path  

5. **Actions**  
   - **Download JSON template** → `anyllm-glossary-template.json`  
   - **Download CSV template** → `anyllm-glossary-template.csv`  
   - Optional: **Choose file…** that invokes the existing hidden file input (nice-to-have if it fits layout; not required if Import button remains adjacent)

### Placement

| Screen | Where |
|--------|--------|
| Custom terms — command bar area | Directly under `DictionaryCommandBar` (or under the Import cluster), always when section is shown |
| Custom terms — empty hero | Same `GlossaryImportHint` under action buttons (collapsed by default) so first-run users see formats without hunting |
| Named list detail | Under the header row that contains **Import** (list name + term count + Import) |

Visual language matches options UI: `text-zinc-500` body, `bg-zinc-900/40` or dashed border panel, `FileJson` / `FileText` icons on download buttons (same as Export menu).

### Accessibility

- Expand control is a real `<button>` with `aria-expanded`  
- Panel region has accessible name (e.g. `aria-label="Glossary import format"`)  
- Code samples are selectable text (not images)  
- Download buttons have clear labels (“Download JSON template”, “Download CSV template”)  
- Existing file inputs keep / gain clear `aria-label`s where missing  

## Implementation

### 1. Template constants + download helper

Prefer a small dedicated module so UI and tests share one source:

`lib/glossaryImportTemplates.ts` (or thin exports from `lib/glossary.ts` if preferred for locality):

- `GLOSSARY_JSON_TEMPLATE: string` — pretty-printed JSON array, 2–3 sample rows  
- `GLOSSARY_CSV_TEMPLATE: string` — header + 2–3 sample rows  
- `downloadGlossaryTemplate(format: 'json' | 'csv'): void` — Blob + temporary `<a download>` + revoke, mirroring `DictionarySection` export pattern  
- Filenames:  
  - `anyllm-glossary-template.json`  
  - `anyllm-glossary-template.csv`  

**Invariant:** templates must successfully parse via existing `parseGlossaryJSON` / `parseGlossaryCSV` (unit-tested).

Sample content (authoritative for UI + files):

```json
[
  { "source": "React", "target": "React" },
  { "source": "API", "target": "API" },
  { "source": "machine learning", "target": "machine learning" }
]
```

```csv
source,target
React,React
API,API
machine learning,machine learning
```

(Examples intentionally match dictionary “Use examples” terms — `React`, `API`, `machine learning` — so the mental model stays consistent.)

### 2. Shared component

`entrypoints/options/components/GlossaryImportHint.tsx`

```ts
export interface GlossaryImportHintProps {
  className?: string;
  /** When set, show a "Choose file…" control that calls this (opens existing file input). */
  onChooseFile?: () => void;
  /** Default collapsed. */
  defaultExpanded?: boolean;
}
```

Responsibilities:

- Collapsed line + expand toggle  
- Expanded format guide (copy + samples)  
- Wire download buttons to `downloadGlossaryTemplate`  
- Optional choose-file action  

No knowledge of glossary store or named lists.

### 3. Wire-up

| File | Change |
|------|--------|
| `DictionarySection.tsx` | Render `<GlossaryImportHint onChooseFile={…} />` under command bar; pass file-input click handler |
| `DictionaryEmptyHero.tsx` | Render compact hint under action buttons (or accept optional `hint` slot / shared component) |
| `NamedGlossaryListDetail.tsx` | Render `<GlossaryImportHint onChooseFile={…} />` under Import header row |

Do **not** change:

- Parse logic  
- Append vs replace semantics  
- `accept` attribute values (already correct)  
- Advanced settings import UI  

### 4. Copy source of truth

All user-facing format strings live in the shared component (or a tiny adjacent constants object), not duplicated in section files. Template **file** bytes come from `lib/glossaryImportTemplates.ts` so UI samples and downloads cannot drift.

## Testing

1. **Unit — templates**  
   - `parseGlossaryJSON(GLOSSARY_JSON_TEMPLATE)` returns 3 entries with expected source/target  
   - `parseGlossaryCSV(GLOSSARY_CSV_TEMPLATE)` same  
   - Round-trip sanity: export helpers still covered by existing glossary tests  

2. **Component — `GlossaryImportHint`**  
   - Renders collapsed line with “JSON” and “CSV”  
   - Expand shows both sample blocks  
   - Download buttons call helper (mock `URL.createObjectURL` / anchor click if needed)  
   - Optional Choose file fires `onChooseFile`  

3. **Regression**  
   - Existing Dictionary import/export tests  
   - Named list import tests (`DictionarySection.namedLists` / detail tests)  
   - Empty hero Import button test still finds control  

## Out of scope

- Advanced settings JSON schema hints / template  
- Replace-on-import mode  
- Drag-drop on named lists  
- i18n / localization  
- Validating file MIME beyond extension (current behavior)  
- Showing format errors inline in the panel (toasts remain)  

## Success criteria

- A new user on Custom terms or Named lists can answer without leaving Settings:  
  1. What file types work?  
  2. What must each row/object contain?  
  3. Can I download a starter file?  
- Templates import cleanly with zero edits (except optional term edits).  
- No change to successful import counts or error messages for existing valid files.  

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Copy drifts from parsers | Unit test templates through real parsers |
| Cluttered command bar | Collapsed by default; one muted line |
| Empty hero vs command bar inconsistency | Same shared component both places |
| Download blocked in extension page | Same Blob+anchor pattern already used for export |

## Implementation order

1. Add template module + parser unit tests (red → green)  
2. Build `GlossaryImportHint` + component tests  
3. Mount on Dictionary section + empty hero  
4. Mount on Named list detail  
5. Manual smoke: expand, download both templates, import each into both surfaces  
