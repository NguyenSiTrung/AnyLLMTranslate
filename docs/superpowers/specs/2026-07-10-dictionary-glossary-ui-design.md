# Dictionary (Glossary) Tab UI Redesign

**Date:** 2026-07-10  
**Status:** Approved (user chose A — glossary only / Approach B)  
**Surfaces:** Settings → Dictionary (`DictionarySection`, `GlossaryTranslatePreview`)

## Goal

Redesign the Settings → Dictionary tab into a polished **custom term library**: clear hierarchy, stronger empty state, command-bar actions, card-style rows, and an elevated verify panel. Improve UI/UX without changing glossary schema, prompt injection, or selection-dictionary mode.

## Scope decision

| Choice | Meaning |
|--------|---------|
| **In scope** | Glossary term CRUD UI, import/export presentation, verify panel presentation |
| **Out of scope** | Selection dictionary mode (`selectionDictionaryEnabled`) — stays in Advanced |
| **Out of scope** | Nav rename, new `GlossaryEntry` fields, bulk multi-select, output diff highlighting |

**Approach:** Command bar + term library (B), not minimal polish-only (A) and not a full Dictionary studio (C).

## Current problems

1. **Conceptual copy** — “injected into the system prompt” is jargon; tab feels like admin forms.
2. **Layout** — Always-visible Add card + separate Import/Export card + table; weaker than Providers / Site Rules.
3. **Empty state** — Minimal text; no education or primary CTAs.
4. **Verify buried** — Collapsed preview at bottom; mismatch badges under-explained.
5. **Table UX** — No clear source → target mapping; inconsistent action controls.

## Information architecture

Vertical order:

1. **Section header** — title + human description (emerald accent retained).
2. **Status strip** — only when `glossary.length > 0`: term count; optional mismatch summary after verify; muted helper.
3. **Command bar** — search (when non-empty) · Add term · Import · Export menu.
4. **Main body**
   - **Empty:** empty hero.
   - **Has terms:** term list (card rows).
5. **Verify panel** — live translate check; hidden when empty; **expanded by default** when ≥1 term.

### Fold / remove

| Today | After |
|-------|-------|
| Always-visible Add Entry card | Inline add form toggled by **Add term** |
| Separate Import / Export card | Command bar actions |
| HTML `<table>` | List of term rows |
| Preview always shown collapsed | Hidden if empty; open by default if terms exist |

## Copy kit

| Surface | String |
|---------|--------|
| Nav tab | **Dictionary** (unchanged) |
| Section title | **Custom terms** |
| Section description | Pin exact translations for names, brands, and jargon so the model doesn’t improvise. |
| Status helper | Terms are applied on the next translation. |
| Search placeholder | Search terms… |
| Add button | Add term / Add first term |
| Empty title | No custom terms yet |
| Empty body | Pin exact translations for names, brands, and jargon. The model will prefer these over freestyle wording. |
| Verify title | Verify terms |
| Verify description | Check that preferred translations show up in the output. |
| Verify placeholder | Type a sentence that includes your terms… |
| Verify button | Verify / Verifying… |
| Verify OK | All terms honoured |
| Verify fail | {M} terms missing from output — marked in the list |
| Mismatch chip | Not honoured |
| Mismatch tooltip | This preferred translation was not found in the preview output. Try a clearer sample sentence or adjust the term. |
| Delete title | Delete term? |
| Delete body | Remove “{source}” → “{target}”? This cannot be undone. |
| Search miss | No terms match “{query}” |
| Duplicate error | This source term already exists |
| Import toast | Imported {N} terms |
| Export toast | Dictionary exported as {FORMAT} (or “Terms exported as …”) |
| Examples toast | Added {N} example terms — edit or delete anytime. |

## Command bar

When `glossary.length > 0`:

- **Search** — filter source + target (case-insensitive); clearable.
- **Add term** — primary; toggles inline add form.
- **Import** — secondary; file picker `.json`, `.csv`; optional drag-and-drop onto list/hero with dashed highlight.
- **Export** — secondary menu/split: JSON | CSV; disabled when empty.

When empty: search hidden; export hidden/disabled; Import + empty-hero CTAs remain.

## Add flow

- Form hidden by default; revealed under command bar (or under empty hero primary action).
- Layout: `[ Source ] → [ Preferred translation ] [ Add ] [ Cancel ]`
- Enter submits; Esc / Cancel closes and clears; focus Source on open.
- Add disabled until both fields non-empty after trim.
- On success: clear fields, **keep form open** for rapid entry; **no toast** on single add.
- **Prepend** new interactive adds: `glossary: [entry, ...glossary]`.
- **Duplicate source** (case-insensitive): block with inline error. Edit excludes current id.

## Empty hero

- Bordered card; `BookOpen` in accent well.
- Title + body from copy kit.
- Actions: **Add first term** (primary), **Import file** (secondary).
- Optional **Use examples**: one click appends 2–3 demo pairs + toast; user can edit/delete later.

## Term list

- Single bordered card; vertical list with dividers (no table).
- Footer: `N terms` or `Showing M of N terms`.
- Search miss: inline empty + **Clear search** (not full empty hero).
- While `mismatchedIds` non-empty: **mismatched rows sort first**.

### Row (view)

`[Not honoured?] Source → Target  [Edit] [Delete]`

- Click row body enters edit (not action buttons).
- Actions use design-system `Button` ghost/sm; visible on hover/focus-within; always keyboard-reachable.
- Mismatch: amber icon + **Not honoured** text (not color-only).

### Row (edit)

`[ Source input ] → [ Target input ] [Save] [Cancel]`

- Enter save; Esc cancel; autofocus source.
- Same duplicate rule as add (exclude self).
- On save/delete/add: clear mismatch set (existing behavior).

### Delete

- Existing danger `Modal`; updated copy from kit.

## Verify panel

- File: `GlossaryTranslatePreview.tsx` (polish in place).
- **Hidden** when `glossary.length === 0`.
- **Expanded by default** when ≥1 term; session-only collapse (`useState`).
- Logic unchanged: `chrome.runtime.sendMessage` translate + `checkGlossaryMismatches` + `onMismatchUpdate`.
- Button label **Verify**; loading **Verifying…**.
- Wide: optional two-column Input | Result; narrow: stack.
- Uses global source/target languages from settings (no panel-level language overrides).
- Prefer shared focus tokens (cyan/teal brand) over one-off blue-only styles where easy.

### Behavior deltas summary

| Behavior | Today | After |
|----------|-------|--------|
| New term insert | Append | **Prepend** |
| Import | Append | Append |
| Duplicate source | Allowed | **Block** (case-insensitive) |
| Verify default | Collapsed | **Expanded** if ≥1 term |
| Verify when empty | Shown | **Hidden** |
| List UI | Table | **Rows** |
| Mismatch order | Unchanged | **Mismatches first** |

## Component map

| Module | Responsibility |
|--------|----------------|
| `DictionarySection.tsx` | Store wiring, compose, delete modal |
| `DictionaryCommandBar.tsx` | Search, Add, Import, Export |
| `DictionaryAddForm.tsx` | Inline add + validation |
| `DictionaryEmptyHero.tsx` | Zero state + CTAs (+ examples) |
| `GlossaryEntryList.tsx` | List shell, filter empty, footer, mismatch sort |
| `GlossaryEntryRow.tsx` | View/edit row, actions, mismatch chip |
| `GlossaryTranslatePreview.tsx` | Verify UI polish |

Shared: `@/types/config`, `@/lib/glossary`, `@/ui/*`, toast provider.

**No** changes to `GlossaryEntry`, `formatGlossary`, background prompt path, or Advanced selection-dictionary toggle.

## Visual tokens

- Section accent: **emerald** (retain).
- Primary actions: existing `Button` primary.
- Mismatch: amber chip + text.
- Success: emerald.
- Surfaces: bordered `Card`, zinc hierarchy consistent with Options.

## Accessibility

- Keyboard add/edit (Enter/Esc); focus Source on open.
- Focus visible on all controls.
- Mismatch not color-only.
- Delete via Modal; Escape cancels.
- Import via button (drag-drop is progressive enhancement).
- Contrast ≥ 4.5:1 for body and chips.
- Row accessible names: “{source} translates to {target}”.

## Testing

- Pure helpers if extracted: duplicate source check; sort mismatches first; filter.
- Component: empty hero CTAs; add open/close; prepend order; export disabled when empty; search miss state; verify hidden when empty.
- Existing glossary parse/export + `checkGlossaryMismatches` regressions.
- Manual: import/export, live verify with provider, badges clear on edit.

## Success criteria

1. Empty state explains why + offers Add / Import immediately.
2. With terms, list + search dominate; add is opt-in.
3. Import/export live in the command bar (no dedicated third card).
4. Rows read as `source → target` at a glance.
5. Verify is visible by default when terms exist and drives list badges.
6. No glossary schema or selection-dictionary changes.

## Non-goals

- Selection dictionary mode on this tab
- Tags, notes, per-entry language, enable/disable flags
- Bulk multi-select delete
- Diff highlighting inside verify output
- Persisted verify collapsed preference
- Backend / prompt format changes
- Renaming nav id `dictionary`
