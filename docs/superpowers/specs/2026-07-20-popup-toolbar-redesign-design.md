# Popup Toolbar UI/UX Redesign — Design Spec

> **Date:** 2026-07-20  
> **Scope:** Toolbar popup (`entrypoints/popup`) information architecture, visual hierarchy, and component structure  
> **Status:** Approved (user chose Approach B + balanced control center with translate-first bias)  
> **Beads:** AnyLLMTranslate-mvg  

---

## 1. Context

The toolbar popup is the highest-frequency UI surface: users click the extension icon to translate the current page. Today it lives almost entirely in `entrypoints/popup/App.tsx` (~1,650 lines) and presents a flat stack of equally weighted glass cards:

1. Header (brand + dual status language + settings gear)  
2. Language flow card  
3. Standalone translation status / progress card (conditional)  
4. Hero CTA / provider recovery / unsupported  
5. **Always-visible** PDF Translator card  
6. Always-translate toggle  
7. Category picker (when context-aware is on)  
8. Collapsible Display Settings (theme, mode, subtitles, nested knobs)  
9. Collapsible Advanced (context-aware, LLM category detection, PDF auto-open)  
10. Footer (provider + model, non-interactive)

### Pain points

- **Hierarchy diluted** — PDF card and secondary controls compete with Translate.  
- **Status triplicated** — header chip, status card, CTA state, footer connection dot.  
- **Visual fatigue** — repeated `bg-zinc-900/70 backdrop-blur rounded-2xl shadow-lg` surfaces.  
- **God component** — selects, category picker, effects, and render tree in one file.  
- **Underuses shared UI** — Options already has `SegmentedControl`, `Button`, `Toggle`; popup reinvents segments.  
- **Advanced toggles in 340px** — rare settings that belong in Options.

### Decision

| Choice | Selection |
|--------|-----------|
| Scope approach | **B — Restructure IA** (not polish-only, not full visual system rewrite) |
| Product optimize-for | **Balanced control center + translate-first bias** (not pure minimal, not power dashboard) |

---

## 2. Goals

1. **Translate-first** — default path is open → confirm languages → primary CTA.  
2. **One status channel** — header chip + inline progress under the action zone; no second status card.  
3. **Contextual chrome** — PDF only when relevant; category only when context-aware is on.  
4. **Balanced control center** — site toggle + quick display remain reachable without opening Options.  
5. **Shared primitives** — reuse `Toggle`, `SegmentedControl`, `Button`; split the god file.  
6. **No new settings keys** — pure IA / presentation / structure change.

## 3. Non-Goals

- Options page redesign.  
- Side panel, light theme, or new translation features.  
- Changing keyboard shortcuts, translation runtime, or category resolution logic.  
- Full combobox/listbox accessibility rewrite for `CustomSelect` (parked follow-up).  
- Schema migration or new config fields.  
- Deep-linking footer to a specific Options tab (nice-to-have follow-up).

---

## 4. Information Architecture

```
Popup (340px)
├── Header                 brand · single status chip · settings
├── Language bar           source ⇄ target
├── Action zone            CTA | recovery | unsupported
│                            + inline progress when active
├── This page              always-translate · category* · PDF*
├── Quick settings ▸       theme · display mode · subtitles (collapsed)
└── Footer                 provider · model (click → Options)
```

\* Category and PDF rows only when their visibility rules apply.

| Zone | Visible when | Controls |
|------|----------------|----------|
| **Header** | always | logo, title, status chip, settings gear |
| **Language bar** | always | source, swap, target |
| **Action zone** | always | Translate / Restore / Setup recovery / unsupported message |
| **Progress** | translating, done with counts, or error | attached under CTA (not a separate card) |
| **This page** | at least one child row qualifies | always-translate, category, PDF |
| **Quick settings** | collapsed by default | theme, display mode, subtitle toggle + nested style knobs |
| **Footer** | always | provider name, connection dot, model; entire control opens Options |

### Removed from default popup stack

- Always-visible PDF Translator **card** on normal web pages.  
- Standalone colored **status summary card** (merged into action zone).  
- Top-level **Advanced** accordion (context-aware / LLM category / auto-open PDF).

### Moved to Options only

| Setting | Popup replacement |
|---------|-------------------|
| Context-Aware Translation | “More in Settings →” under Quick settings |
| Page Category Detection (LLM) | same link |
| Auto-open PDF Translator | same link |

Category **row** still appears when `enableContextAwareTranslation` is already on (detection result / override remains a per-page action).

---

## 5. Visual Layout & Hierarchy

### Shell

- **Width:** `340px` (unchanged).  
- **Height:** content-driven; remove or lower hard `min-h-[480px]` (~360 max empty chrome) so unsupported/setup states are not tall and hollow.  
- **Background:** zinc-950; at most one subtle top glow (reduce decorative blur orbs).  
- **Spacing:** prefer `px-4` and `gap-3` (slightly tighter than current `px-5` / `space-y-4`).

### Visual weight (strong → weak)

| Rank | Element | Treatment |
|------|---------|-----------|
| 1 | Primary CTA | Full-width gradient (or recovery primary); largest tap target |
| 2 | Language bar | Single compact surface |
| 3 | This page block | Flat section + hairline divider; list rows, not N glass cards |
| 4 | Quick settings | Text disclosure + chevron; one inner card when expanded |
| 5 | Header / footer | Quiet chrome; footer interactive on hover |

**Rule:** only the CTA and language row get “hero surface.” Site toggle, category, and PDF are rows inside one **This page** group.

### Header

```
[logo ~32px]  AnyLLMTranslate           [⚙]
              ● Ready | Translating | Active | Error
```

- Single status chip (under title or compact pill).  
- Settings gear: `aria-label="Open full settings"`; opens Options window (existing size).

### Language bar

```
┌─────────────────────────────────────┐
│  Auto detect     (⇄)    Tiếng Việt  │
└─────────────────────────────────────┘
```

- Keep ghost/minimal custom selects.  
- Swap disabled when source is `auto`, with `title` / tooltip: “Pick a source language to swap”.  
- Truncate long native names with ellipsis.

### Action zone states

**A. Ready** (provider OK, page OK)

```
[ ✨ Translate Page                    Alt+A ]
```

**B. Translating / Done**

```
[ ■ Restore Original                   Alt+X ]
  {progressLabel} · {progressDetail}     35%
  ████████░░░░░░░░
```

**C. Provider recovery** — keep current titles, descriptions, and setup CTAs; restyle to new radius/spacing.

**D. Unsupported page** — compact message; hide This page translate-specific rows (always-translate, category); keep language bar + footer.

**E. Error** — error copy under CTA (or in progress slot) using existing `status.error`; no separate red status card.

### This page (grouped)

Render the section only if ≥1 child is visible:

| Row | When |
|-----|------|
| Always translate `{host}` | `activeHostname` set; mid-ellipsis truncate; full host in `title` |
| Category picker | `settings.enableContextAwareTranslation && activeHostname` |
| PDF — “Open current PDF” | `activeTabIsPdf && activeTabUrl` |
| PDF — “Open PDF URL…” | not a PDF tab; text control expands inline URL field (not a permanent card) |

### Quick settings (collapsed default)

- Disclosure label: **Quick settings** (replaces “Display Settings” + “Advanced”).  
- Expanded body (single card):
  1. Visual theme  
  2. Display mode via **`SegmentedControl`**  
  3. Subtitle translation toggle  
  4. If subtitles enabled: nested “Subtitle style (this tab)” with `aria-expanded`; knobs via **`SegmentedControl`** `size="sm"`  
- Below expanded body: text link **More in Settings →** → `options.html`.

### Footer

```
[Activity]  {displayName}           ● {model}  ›
```

- Entire footer is one focusable control opening Options.  
- `aria-label` / accessible name: `Open settings — {provider}, {model}`.  
- Hover: subtle background lift; `title="Open settings"`.

---

## 6. Status Model (Single Source)

Derive one view-model from existing data (no new runtime status protocol):

```ts
type PopupStatusKind =
  | 'ready'
  | 'translating'
  | 'active'   // done / reading-area ready
  | 'error'
  | 'blocked'  // unsupported page
  | 'setup';   // provider cannot translate

// Priority (first match wins):
// setup > blocked > error > translating > active > ready
```

**Inputs (unchanged sources):**

- `StatusResponse` (`status`, counts, `visiblePending`, `viewportComplete`, `error`)  
- `isTranslating`  
- `unsupportedPage`  
- `shouldShowProviderRecovery` / `getPoolReadinessStatus`  
- `isReadingAreaReady`, `formatProgressLabel`, `formatProgressDetail`

Header chip and action-zone chrome both consume this model so labels cannot drift.

---

## 7. Edge-Case Matrix

| Situation | Header | Action zone | This page |
|-----------|--------|-------------|-----------|
| Normal page, idle, provider OK | Ready | Translate | host; category if enabled |
| Translating | Translating | Restore + progress | same |
| Done / reading-area ready | Active | Restore + progress | same |
| Translation error | Error | CTA + error line | same |
| Provider not ready | Ready or setup | Recovery card | may keep always-translate |
| Unsupported URL | blocked | Message only | hide always-translate & category |
| PDF viewer extension page | blocked / info | Current PDF-viewer copy | category if hostname from `?file=` |
| PDF web tab | Ready | Translate if allowed; PDF row = Open current | promote PDF |
| Non-PDF | — | — | PDF = expandable Open URL |
| No hostname | — | CTA if supported | hide host-dependent rows |
| Context-aware off | — | — | no category |
| Long hostname | — | — | truncate + `title` |
| Source = auto | — | — | swap disabled + tooltip |
| Content script missing | — | existing connect-failure copy | category BG fallback unchanged |

---

## 8. Component Architecture

```
entrypoints/popup/
  App.tsx                      # composition + hook wiring only
  main.tsx
  style.css
  components/
    PopupHeader.tsx
    LanguageBar.tsx
    ActionZone.tsx             # CTA + recovery + unsupported + inline progress
    ThisPageSection.tsx
    QuickSettings.tsx
    PopupFooter.tsx
    CustomSelect.tsx           # extract first; no behavior rewrite in v1
    CategoryPicker.tsx         # extract first; no behavior rewrite in v1
  hooks/
    usePopupSettings.ts        # load/update + storage listener
    usePopupTab.ts             # tab, hostname, PDF, unsupported, category
    useTranslationToggle.ts
  lib/
    derivePopupStatus.ts       # pure helper + unit tests
```

### Shared UI reuse

| Primitive | Use |
|-----------|-----|
| `ui/Toggle` | always-translate, subtitles, (unchanged) |
| `ui/SegmentedControl` | display mode; subtitle knobs |
| `ui/Button` | secondary actions (setup secondary, PDF open where appropriate) |

Do **not** force-migrate `CustomSelect` onto `ui/Select` in v1 if portal/search behavior differs; extract, then align later if cheap.

### State defaults

- `quickSettingsExpanded = false`  
- `styleExpanded = false`  
- `pdfInputOpen = false`  
- No new persisted UI state required.

### Behavior ownership

Message contracts and settings keys stay identical:

- `startTranslation` / `stopTranslation` / `getStatus`  
- `setCategoryOverride` / `getPageCategory` / `pageCategoryUpdate`  
- `OPEN_PDF_VIEWER`  
- `getSubtitleKnobOverride` / `setSubtitleKnobOverride`  
- `updateSettings` / `loadSettings` / `STORAGE_KEYS.SETTINGS`  
- Site rules always-translate toggle  
- Provider readiness + setup wizard window  

---

## 9. Accessibility (Scoped)

| Control | Requirement |
|---------|-------------|
| Settings gear | `aria-label="Open full settings"` |
| Footer | button semantics + name including provider and model |
| Quick settings | `aria-expanded` |
| Subtitle style disclosure | `aria-expanded` |
| Language swap | `aria-label`; disabled reason via `title` |
| Primary CTA | existing focus ring; keep visible shortcut hints |
| CustomSelect / CategoryPicker | no full combobox rewrite; don’t regress click-outside or basic keyboard use |

---

## 10. Behavior Parity Checklist

Implementation must preserve:

1. Start / stop translation and status streaming.  
2. Language + swap persistence.  
3. Always-translate site rule create/toggle.  
4. Category override, custom category, save-as-rule.  
5. PDF open via background message + tab fallback.  
6. Provider recovery → setup guide window.  
7. Subtitle enable + per-tab knob overrides.  
8. Theme + display mode updates.  
9. Live settings via storage listener.  
10. `statusUpdate` and `pageCategoryUpdate` handling.  
11. Unsupported page and PDF-viewer special copy.  
12. PDF detection via content-script `getPageContentType` + URL heuristic fallback.

---

## 11. Testing Plan

1. **Manual matrix** — exercise the edge-case table on Chromium.  
2. **Unit** — `derivePopupStatus` priority and label mapping.  
3. **Regression** — existing popup-related tests (category display, etc.) updated only if structure/copy selectors change.  
4. No visual snapshot suite required for v1.

---

## 12. Success Criteria

1. Default normal-page open shows **one** primary action and **no** PDF card.  
2. Progress/error appears **only** in the action zone (no second status card).  
3. Category and PDF rows are **conditional** per §5 / §7.  
4. Advanced toggles are **absent** from the popup; Options link is present.  
5. Footer opens Options.  
6. `App.tsx` is composition-focused; logic lives in hooks/components.  
7. No new settings schema keys.  
8. All parity checklist items still work.

---

## 13. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Power users miss Advanced toggles | “More in Settings →”; optional README note |
| Extract/refactor regressions | Move components with minimal JSX change first, then restyle |
| Progress under CTA feels cramped | Cap progress block ~56px height; wrap error text |
| Hostname truncation confuses | Full hostname in `title` |
| Tests coupled to old DOM | Update selectors in same PR as structure change |

---

## 14. Implementation Phases (for planning)

1. **Extract** — split components/hooks with zero intentional UX change; green tests.  
2. **Status model** — add `derivePopupStatus`; wire header + action zone.  
3. **IA restyle** — This page group, hide PDF card, merge progress, remove Advanced, footer click, spacing.  
4. **Shared controls** — SegmentedControl for mode/knobs; a11y attributes.  
5. **Verify** — manual matrix + unit tests + parity checklist.

---

## 15. Out-of-Scope Follow-ups

- Full listbox/combobox a11y for `CustomSelect`.  
- Light theme popup.  
- Side panel entry.  
- Footer deep-link to Providers tab.  
- Moving subtitle knobs entirely into Options.  
- Reducing animation (`animate-ping`) further system-wide.

---

## 16. File Touch Map (expected)

| Path | Change |
|------|--------|
| `entrypoints/popup/App.tsx` | Shrink to composition |
| `entrypoints/popup/components/*` | New presentational pieces |
| `entrypoints/popup/hooks/*` | Tab/settings/toggle logic |
| `entrypoints/popup/lib/derivePopupStatus.ts` | Pure status helper |
| `tests/**` (popup-related) | Update + add status helper tests |
| `README.md` | Only if Advanced move needs a one-line doc touch |

No changes required to content script translation pipeline for this redesign.
