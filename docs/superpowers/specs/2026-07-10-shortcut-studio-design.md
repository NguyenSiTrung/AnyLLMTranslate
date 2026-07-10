# Shortcut Studio — Design Spec

> **Date:** 2026-07-10  
> **Scope:** Settings → Shortcuts tab — full “Shortcut Studio” redesign (accuracy + command bar + grouped cheatsheet)  
> **Status:** Approved (user chose Approach B; layout Approach 1)  
> **Related:** `ShortcutsSection.tsx`, `content/keyboardShortcuts.ts`, `wxt.config.ts` commands, Inline tab gesture labels

---

## 1. Context

The Shortcuts tab (`ShortcutsSection`) is a thin static panel while **General, Themes, Inline, Providers, Dictionary, Site Rules** have richer IA and craft.

### Current UI

1. Section header — “Keyboard Shortcuts”
2. Card — three hardcoded rows: **Alt+T**, **Alt+O**, **Space × 3**
3. Card — “Customize Shortcuts” → open Chrome shortcuts page

### Pain points

| Severity | Issue |
|----------|--------|
| **Critical** | Wrong global shortcuts in UI (`Alt+T` / `Alt+O`). Real defaults: **Alt+A**, **Alt+S**, **Alt+Z**, **Alt+X**. |
| **Critical** | Missing `translate-input-box` (inline command; often unbound by default). |
| **High** | Missing page shortcuts: **Alt+H**, **Alt+D**, **Alt+Q**, **Escape**. |
| **High** | Static list — never calls `chrome.commands.getAll()`, so user remaps are invisible. |
| **Medium** | Space×N is an Inline **gesture**, mixed into a generic list with no link to Inline settings. |
| **Medium** | Weak scannability (single mono string, no key-cap chips, no categories). |
| **Low** | Redundant Customize card title/body; silent failure if opening `chrome://` fails. |

### Locked product decisions

| Decision | Value |
|----------|--------|
| Ambition | **B — Shortcut Studio** (search, filter, copy cheatsheet, status, manage CTA, full craft) |
| Layout | **1 — Command bar + grouped rows** (not Theme Studio split; not reference-card-first) |
| Rebinding | **Out of scope** — Chrome owns global keys; page keys remain fixed |
| Schema | **No new settings keys** — UI-only state (search / scope filter) |

---

## 2. Goals

1. **Truthful** — live browser bindings + complete page + gesture inventory.
2. **Scannable** — categories, key-cap chips, status badges.
3. **Actionable** — search, scope filter, copy cheatsheet, open browser shortcut manager.
4. **Craft parity** — matches Inline / Providers quality bar; orange section accent retained.
5. **No behavior change** to content-script or background command handlers (display + navigation only).

## 3. Non-Goals

- In-app rebind of `chrome.commands` or page shortcuts.
- Conflict detection with other extensions.
- Changing default key bindings in `wxt.config.ts` or `keyboardShortcuts.ts`.
- Popup redesign; sidebar / tab navigation redesign.
- New persisted config fields or schema migration.
- Firefox-specific polish beyond best-effort API use.
- Animated “keyboard legend” or split-pane detail panel (deferred; Approach 2).

---

## 4. Product metaphor

**Shortcut Studio** — a live cheatsheet and control strip for every trigger in AnyLLMTranslate:

- **Learn** what keys exist and where they work.
- **Verify** what the browser currently assigned.
- **Act** — copy the list or open browser management.

---

## 5. Information architecture

```
Shortcuts (Settings tab)
│
├─ SectionHeader          Shortcut Studio
├─ 1. StudioBar           search · scope · bound count · Copy · Manage
├─ 2. Global commands     chrome.commands (live)
├─ 3. On this page        content-script keys (fixed)
├─ 4. Gestures            Space×N + link to Inline
└─ 5. Tips                compact platform / Chrome limits
```

### 5.1 Section header

| Field | Value |
|-------|--------|
| Title | Shortcut Studio |
| Description | See every trigger — live browser bindings, page keys, and gestures. |
| Icon | `Keyboard` |
| Accent | `orange` |

### 5.2 StudioBar

Strip or bordered card at the top of the content stack.

| Control | Behavior |
|---------|----------|
| **Search** | Case-insensitive filter on action label, description, and key label |
| **Scope chips** | `All` · `Global` · `Page` · `Gesture` — show/hide groups (and empty the filtered group when no matches) |
| **Status** | e.g. `4/5 global bound` when at least one global command is unbound; omit or show `5/5 bound` when all set |
| **Copy all** | Secondary button — copies markdown-friendly text for **currently visible** rows (respects search + scope) |
| **Manage** | Primary button — opens browser extension shortcuts page |

**Manage open path**

1. Prefer `chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })`.
2. On failure: toast with short copy that the URL must be opened manually (`chrome://extensions/shortcuts`).
3. Do not rely on plain `<a href="chrome://...">` navigation (blocked in extension pages).

### 5.3 Global commands

Source: `chrome.commands.getAll()` on mount and when the document becomes visible again (`visibilitychange` → visible), so returning from the browser shortcuts page refreshes bindings.

#### Command metadata map

| Command ID | Label | Description |
|------------|--------|-------------|
| `translate-page` | Translate page | Start page translation on the active tab |
| `translate-subtitles` | Translate subtitles | Start video subtitle translation |
| `toggle-display` | Toggle display | Show or hide existing translations |
| `restore-page` | Restore page | Remove translations and restore the original page |
| `translate-input-box` | Inline translate | Translate the focused input box |

**Unknown command IDs** (future): still render with `description` from the API when present; fallback label = command name.

**Documented defaults** (fallback when API unavailable — tests / non-extension host):

| Command ID | Default shortcut display |
|------------|--------------------------|
| `translate-page` | `Alt+A` |
| `translate-subtitles` | `Alt+S` |
| `toggle-display` | `Alt+Z` |
| `restore-page` | `Alt+X` |
| `translate-input-box` | *(empty — Not set)* |

Note: Chrome allows at most **four** `suggested_key` entries; the fifth command is intentionally unbound by default (see `wxt.config.ts`).

#### Row fields

- Title + description  
- Badge: `Global`  
- Where line: *Any tab (when the page is focused)*  
- Key caps from `shortcut` string, or **Not set** badge (`warning`) when empty  
- Unbound hint: *Set in browser shortcuts* (visual only; Manage is in StudioBar)

### 5.4 On this page

Static inventory mirroring `content/keyboardShortcuts.ts` (labels only; no runtime wiring change).

| Action | Keys | Description |
|--------|------|-------------|
| Toggle hover translate | `Alt+H` | Enable/disable hover translate on the page |
| Toggle selection translate | `Alt+D` | Enable/disable selection translate on the page |
| Translate section (picker) | `Alt+Q` | Enter/exit section picker mode |
| Dismiss tooltip | `Escape` | Close translate tooltip / floating button |

- Badge: `Page`  
- Where: *Web pages with the extension active*  
- Note under group or header description: *Not customizable here*  
- Keep this list in one shared metadata module so future handler changes update display in one place when maintainers edit the map (display map may lag handlers; comment points to `keyboardShortcuts.ts`).

### 5.5 Gestures

| Action | Display | Source |
|--------|---------|--------|
| Inline input gesture | `Space × N` | `settings.inlineTranslate.tapCount` (live) |
| Window (secondary text) | e.g. within `X` ms | `settings.inlineTranslate.timeWindowMs` |

- Badge: `Gesture`  
- CTA: **Configure on Inline** — navigates to the Inline settings tab via existing App tab navigation prop pattern (same idea as General → Themes).  
- Cross-reference in description: browser shortcut for the same pipeline is **Inline translate** under Global (`translate-input-box`). Do not duplicate the full global row here.

If Inline is disabled, still show the gesture row (users may enable later); optional muted badge `Inline off` is **optional polish** — implement if cheap with existing store; not required for v1.

### 5.6 Tips

Compact tip list (bullet or icon rows), not a paragraph wall:

1. Global shortcuts are managed by the browser; this studio shows live assignments.  
2. Chrome allows only four default suggested keys — the fifth command may need manual binding.  
3. Page shortcuts work when a web page is focused (not while typing only in the options UI).  
4. Chromium-based browsers use `chrome://extensions/shortcuts` (Edge included).

---

## 6. Visual design

### 6.1 Row layout

```
[optional icon]  Title                         [Global]   [Alt] [A]
                 Description · where it works
```

- Hover: soft `zinc` wash  
- Group containers: `Card` `variant="bordered"` with `title` + `description`  
- Empty filter state: centered short empty message + control to clear search/scope  

### 6.2 KeyCap

New display helper (shared under `ui/` if reusable; otherwise section-local + pure parse in `lib/`):

**Parse inputs**

| Input | Chips |
|-------|--------|
| `Alt+A` | `Alt` · `A` |
| `Ctrl+Shift+Y` | `Ctrl` · `Shift` · `Y` |
| `MediaNextTrack` | single chip with friendly label |
| `Space × 3` / gesture compound | special compound presentation (not false multi-modifier split) |
| `""` / missing | no chips — parent shows **Not set** |

**Style**

- Mono, compact padding, raised border, subtle top highlight  
- Hover micro-lift optional; respect `prefers-reduced-motion`  
- `aria-label` on sequence: e.g. `Shortcut Alt+A`

### 6.3 Color & status

| Use | Token |
|-----|--------|
| Section accent | orange (`SectionHeader`) |
| Bound / success chips | emerald when emphasizing completeness |
| Not set | `Badge` `warning` (amber) |
| Scope badges | `Badge` `info` or neutral zinc; optional experimental/sky only if needed for Gesture |
| Manage CTA | primary `Button` (blue brand CTA — not every control orange) |
| Copy | secondary `Button` |

### 6.4 Motion

- Existing `animate-fade-in-up` on section root  
- `stagger` on groups  
- No novel motion systems  

---

## 7. Data flow

```
chrome.commands.getAll()     →  Global rows (shortcut strings)
settings.inlineTranslate     →  Gesture Space × N + window
PAGE_SHORTCUT_META (static)  →  Page rows
App onNavigateToInline       →  Gestures CTA
UI state (local)             →  searchQuery, scopeFilter
```

### 7.1 Visibility refresh

```
mount → loadCommands()
document.visibilitychange → if visible → loadCommands()
```

### 7.2 Cheatsheet copy format

Plain text (clipboard):

```text
AnyLLMTranslate shortcuts

Global
- Translate page: Alt+A
- Translate subtitles: Alt+S
- Toggle display: Alt+Z
- Restore page: Alt+X
- Inline translate: (not set)

Page
- Toggle hover translate: Alt+H
- Toggle selection translate: Alt+D
- Translate section (picker): Alt+Q
- Dismiss tooltip: Escape

Gestures
- Inline input gesture: Space × 3 (within 800ms)
```

Only **visible after filter** rows are included. Toast on success: *Cheatsheet copied*. On clipboard failure: toast error.

### 7.3 Filtering rules

A row matches search if query is empty **or** any of label, description, joined key label, command id (global) contains the query (case-insensitive).

Scope:

| Scope | Shows |
|-------|--------|
| All | All groups with at least one matching row |
| Global | Global group only |
| Page | Page group only |
| Gesture | Gesture group only |

Hide entire group card when zero matching rows after filter.

---

## 8. Component structure

| Piece | Responsibility |
|-------|----------------|
| `ShortcutsSection.tsx` | Compose header, bar, groups, tips; wire store + navigation |
| `ShortcutStudioBar.tsx` | Search, scope, status, Copy, Manage |
| `ShortcutGroup.tsx` | Card wrapper + list of rows |
| `ShortcutRow.tsx` | Single binding row |
| `KeyCapSequence.tsx` (or `ui/KeyCap.tsx`) | Render chip sequence |
| `lib/shortcutDisplay.ts` | Command metadata, page meta, parse keys, format cheatsheet, filter helpers |

**App wiring**

- `App.tsx`: pass `onNavigateToInline` (or generic `onNavigate('inline')`) into `ShortcutsSection`, parallel to General ↔ Themes.

**Tests**

| Layer | Coverage |
|-------|----------|
| `lib/shortcutDisplay` unit | parse keycaps; cheatsheet text; filter by query/scope; unbound label |
| Section component | mock `chrome.commands.getAll`; unbound badge; search hides rows; Copy invokes clipboard mock; Manage calls `tabs.create` |
| Snapshot optional | not required |

---

## 9. Accessibility

- Search: labeled input (`htmlFor` / `aria-label`)  
- Groups: `role="list"` / rows `role="listitem"` (or semantic list)  
- Key sequences: accessible name via `aria-label`  
- Copy / Manage: real `<button>` via `Button`  
- Focus rings: shared component styles  
- Do not convey “not set” by color alone — badge text required  

---

## 10. Migration & compatibility

- No storage migration.  
- No change to command IDs or handlers.  
- First ship may reveal users who learned wrong Alt+T/O from the old UI — correct display is intentional.  

---

## 11. Implementation notes

1. **Single source of display truth** for page shortcuts: `lib/shortcutDisplay.ts` page meta should stay aligned with `getDefaultShortcuts()` in `keyboardShortcuts.ts` (comment cross-link both files).  
2. Prefer pure functions for parse/filter/format for easy unit tests without DOM.  
3. `chrome.commands` / `chrome.tabs` access only in section/bar side effects; keep `lib/shortcutDisplay` pure.  
4. Do not invent new default bindings; only display API + documented fallbacks.  
5. Space×N formatting should reuse the same mental model as Inline (`Space × ${tapCount}`).  

---

## 12. Success criteria

1. No remaining Alt+T or Alt+O as documented defaults on this tab.  
2. All five global commands listed; unbound shows **Not set**.  
3. All four page shortcuts listed.  
4. Gesture reflects live `tapCount` (and window).  
5. Search and scope filter work.  
6. Copy produces correct filtered text.  
7. Manage opens shortcuts page (or toast on failure).  
8. Inline navigation CTA works.  
9. Visual polish consistent with other 2026-07 options redesigns.  
10. Unit + component tests cover critical display/filter paths.  

---

## 13. Out-of-scope follow-ups (optional later)

- Approach 2 split pane + mini keyboard legend  
- In-app page-shortcut customization (Approach C)  
- Detect OS (Mac ⌥ vs Alt labeling)  
- Popup mini-cheatsheet  
- Sync display map automatically from handler source (codegen)  

---

## 14. Approval record

- User chose **B** (Shortcut Studio).  
- User approved design (**Ok**) for layout Approach 1 + IA above before implementation plan.  
