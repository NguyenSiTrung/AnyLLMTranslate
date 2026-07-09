# General Tab Full Restructure (IA Option C) — Design Spec

> **Date:** 2026-07-09  
> **Scope:** Settings → General tab information architecture and UI polish  
> **Status:** Approved (user chose approach C)  
> **Beads:** ALT-6l9  
> **Supersedes (in part):** [2026-05-06 General Tab UX Overhaul](./2026-05-06-general-tab-ux-overhaul-design.md) card merge (Display + Appearance). Language/disable/Host Page Mode renames from that spec remain in effect unless this document overrides them.

---

## 1. Context

The General tab was previously simplified to **two cards** (Language + Display & Appearance) and shared primitives (`SectionHeader`, `SegmentedControl`, etc.). That reduced scroll and fixed logic bugs, but left UX gaps:

- **Display & Appearance is a kitchen sink** — layout, theme, host contrast, and advanced display mixed in one card.
- **Theme selection is blind** — native `<select>` of 16 themes with no visual feedback on this tab.
- **Language pair is generic** — stacked selects, no From → To flow or swap.
- **Segmented controls are text-only** — harder to scan; component already supports icons.
- **Position disable is visual-only** — opacity + `pointer-events-none` instead of real `disabled`.
- **Theme labels duplicated** — `THEME_OPTIONS` in General vs `THEMES` in Themes tab (drift risk).
- **`SettingsGroup` / Card `description` underused** on this tab.

User selected **Approach C: Full restructure** — more cards with clear IA, not polish-in-place only.

---

## 2. Goals

1. **Clear information architecture** — one primary concern per card.
2. **Scannable controls** — icons on segmented options; card descriptions set expectations.
3. **Better theme discovery** — selected theme summary + quick select + explicit Browse themes CTA.
4. **Language pair affordances** — side-by-side From/To + swap.
5. **Correct disable semantics** — Translation Position uses real control `disabled` when N/A.
6. **Maintainability** — single source of truth for theme metadata used by General (and optional future Themes alignment).
7. **No new settings keys** — same store fields; pure presentation/IA change.

## 3. Non-Goals

- Sidebar / tab navigation redesign.
- Themes tab gallery redesign (beyond optional shared theme metadata import).
- Full `ThemePreview` reintroduction on General (avoid duplicating Themes tab).
- Popup settings redesign.
- New features or settings schema changes.
- Collapsed Advanced by default (explicitly rejected for this pass — card always expanded).

---

## 4. Information Architecture

```
General
├── 1. Language           — what to translate
├── 2. Layout             — how text is arranged
├── 3. Style              — how translation looks
└── 4. Advanced display   — optional / power-user display behavior
```

| Card | Settings keys | Controls |
|------|---------------|----------|
| **Language** | `sourceLanguage`, `targetLanguage` | Source select, Target select, Swap |
| **Layout** | `displayMode`, `translationPosition` | Display mode segments, Position segments |
| **Style** | `theme`, `darkMode` | Theme summary + select + Browse CTA, Page contrast segments |
| **Advanced display** | `enableCompactInlineForShortText` | Compact inline toggle |

**Section header**

- Title: `General`
- Description: `Language, layout, and how translations look.`
- Icon: `SlidersHorizontal` (unchanged)
- Accent: `blue` (unchanged)

**Card order & stagger:** Language `stagger(0)` → Layout `stagger(1)` → Style `stagger(2)` → Advanced `stagger(3)`.

---

## 5. Card Specifications

### 5.1 Language

**Card**

- `title`: `Language`
- `description`: `Languages for page translation.`
- `icon`: `<Globe />`
- `variant`: `bordered`

**Layout**

- Prefer a single row: `[ Source ▾ ]  ⇄  [ Target ▾ ]`.
- On narrow content widths, stack vertically with swap centered between (or above the pair). Implementation may use `flex` + `flex-col sm:flex-row` or equivalent Tailwind breakpoints appropriate to the options content pane (not full viewport).

**Source / Target**

- Keep existing option lists (`LANGUAGES`; target excludes `auto`).
- Keep 🌐 prefix on Auto source option label.
- Labels remain “Source language” / “Target language” with short field descriptions if needed; prefer card description over redundant long field copy when space is tight.

**Swap**

- Button between selects with accessible name `Swap languages` (icon: `ArrowLeftRight` or similar).
- On click: exchange `sourceLanguage` and `targetLanguage`.
- **When source is `auto`:** swap is **disabled** (auto is not a valid target). Tooltip/title: `Cannot swap while source is Auto-detect`.
- **When source equals target** (non-auto): still allow swap (no-op identity is fine) or no special case required.
- Do not invent a reverse-detect mode; disabled state is enough.

### 5.2 Layout

**Card**

- `title`: `Layout`
- `description`: `How original and translated text are arranged on the page.`
- `icon`: `Columns2` (or `LayoutList` if Columns2 unavailable in current lucide set)
- `variant`: `bordered`

**Display mode**

- `SegmentedControl` with icons:
  - `bilingual-below` → label `Bilingual`, icon `Languages`
  - `translation-only` → label `Translation only`, icon `Type` (or `Text` / single-line type icon)
- One-line helper under the control:  
  `Bilingual keeps the original visible. Translation only replaces it.`

**Translation position**

- Options with icons: Below / Above / Side (e.g. `ArrowDown`, `ArrowUp`, `ArrowRight` or layout-oriented lucide icons).
- When `displayMode === 'translation-only'`:
  - Pass `disabled={true}` to `SegmentedControl` (real disabled, not only CSS).
  - Keep hint: `Position only applies in Bilingual mode.`
  - Optional wrapper opacity for visual quieting is allowed **in addition to** `disabled`, not instead of it.
- Values unchanged: `below` | `above` | `side`.

**Mini diagram:** out of scope for v1 (no static original/translation wireframe required).

### 5.3 Style

**Card**

- `title`: `Style`
- `description`: `Visual style and contrast for injected translations.`
- `icon`: `Palette`
- `variant`: `bordered`

**Theme block**

1. **Summary row**
   - Selected theme **label** (from shared metadata) + optional short **description**.
   - Display as a calm summary (text or soft chip), not a second gallery.

2. **Quick select**
   - Keep a `<Select>` of theme options for power users who know names.
   - Options sourced from shared theme metadata (see §6).
   - Includes all existing theme ids currently selectable in General (same set as today’s `THEME_OPTIONS`). Custom theme remains selectable if it is already in the list elsewhere; if `custom` is only on Themes tab today, do **not** expand General’s list beyond current General options unless both tabs already share the same id set.  
   - **Concrete rule:** Export a shared list used by General that matches **current General `THEME_OPTIONS` ids**. Themes tab may keep richer cards; when convenient, Themes can import labels/descriptions from the same module without forcing gallery redesign.

3. **Browse themes CTA**
   - Secondary/ghost `Button` (not raw blue text alone): label `Browse themes`.
   - Calls existing `onNavigateToThemes?: () => void`.
   - Hide CTA if callback is undefined (same pattern as today).

**Page contrast (Host page mode)**

- Setting key remains `darkMode` (`auto` | `light` | `dark`).
- **Visible label:** `Page contrast`
- **Description:** `Match translation contrast to the host page. Auto detects the site theme.`
- Segmented options with icons:
  - Auto → `Monitor` (or `Sparkles` / `Contrast` if preferred; pick one and stay consistent)
  - Light → `Sun`
  - Dark → `Moon`

### 5.4 Advanced display

**Card**

- `title`: `Advanced display`
- `description`: `Optional behavior for short phrases.`
- `icon`: `SlidersHorizontal` or `Sparkles` — use `Sparkles` if Language header already used SlidersHorizontal at section level; prefer `Sparkles` for variety.
- `variant`: `bordered`
- **Always expanded** (not `AdvancedDisclosure` collapsed).

**Toggle**

- id: `general-compact-inline-toggle`
- label: `Compact inline for short text`
- description: `Show short translations inline in parentheses. Turn off for uniform block display that always matches your theme.`
- binds `enableCompactInlineForShortText`

---

## 6. Shared Theme Metadata

**Create** `lib/themes.ts` (or `lib/themeOptions.ts` if name conflicts):

```ts
export type ThemeOptionMeta = {
  id: ThemeName; // subset used by General may exclude 'custom' if not in current General list
  label: string;
  description?: string;
};

/** Theme options for General quick-select (and shared labels). */
export const GENERAL_THEME_OPTIONS: ThemeOptionMeta[];
```

- Populate from current General `THEME_OPTIONS` labels.
- Optional `description` strings can be short (may reuse Themes gallery descriptions where they exist for the same id).
- `GeneralSection` imports this list; delete local `THEME_OPTIONS` constant.
- Themes tab alignment (importing labels) is **optional** in this work; preferred if low-risk, not required for acceptance.

---

## 7. Accessibility & Interaction

| Concern | Requirement |
|---------|-------------|
| Segmented controls | Keep `role="radiogroup"`, `aria-label` / existing `label` prop, `id` for tests |
| Disabled position | Use `SegmentedControl` `disabled`; disabled segments not activatable by keyboard |
| Swap | `type="button"`, `aria-label="Swap languages"`, `disabled` + `title` when source is auto |
| Theme browse | Keyboard-focusable button; does not submit forms |
| Focus rings | Existing focus-visible styles on shared controls |
| Labels | Selects keep `htmlFor` / `id` pairing via `FieldGroup` |

---

## 8. Visual Design Constraints

- Stay on existing dark chrome: zinc backgrounds, blue active segments (`SegmentedControl` active = blue-600).
- No purple-first / violet marketing gradients (product rule).
- Card spacing: `space-y-4` between cards; within-card `space-y-5` (or existing section rhythm).
- Prefer `Card` `description` over extra nested `SettingsGroup` headers inside single-concern cards.
- Icons: lucide-react, size consistent with other sections (`w-3.5 h-3.5` card icons; segment icons slightly smaller).

---

## 9. Files Affected

| File | Action |
|------|--------|
| `entrypoints/options/sections/GeneralSection.tsx` | **Major rewrite** — 4-card IA |
| `lib/themes.ts` (or `lib/themeOptions.ts`) | **Create** — shared General theme option metadata |
| `ui/SegmentedControl.tsx` | **Touch only if needed** — verify disabled styling/a11y sufficient |
| `ui/Button.tsx` | **Use** for Browse themes (no API change expected) |
| `entrypoints/options/App.tsx` | **Unchanged** API (`onNavigateToThemes`) unless types require import path tweak |
| `entrypoints/options/sections/__tests__/GeneralSection*.tsx` (create/update) | Tests for cards, swap, disabled position, browse CTA |
| `entrypoints/options/sections/ThemesSection.tsx` | **Optional** — import shared labels |

---

## 10. Testing

Minimum coverage:

1. Renders four card titles: Language, Layout, Style, Advanced display.
2. Swap exchanges source and target when source is not `auto`.
3. Swap is disabled when source is `auto`.
4. When display mode is translation-only, position control is disabled (and/or not interactive).
5. Browse themes calls `onNavigateToThemes`.
6. Changing page contrast / theme / compact toggle writes expected store keys (via existing store mock patterns).

Manual:

- Tab through all controls; confirm disabled position and disabled swap behavior.
- Browse themes lands on Themes tab.
- Auto-save badge still fires on change.

---

## 11. Success Criteria

1. User can answer “what language / how arranged / how it looks / advanced?” from four distinct cards without mixed concerns.
2. Position is truly disabled in translation-only mode.
3. Theme is discoverable via summary + select + Browse themes.
4. Language pair supports From→To + swap (with auto guard).
5. No new settings schema keys.
6. Visual craft consistent with Themes/Providers (icons, card descriptions, CTA button).

---

## 12. Defaults Locked by Approval

| Decision | Value |
|----------|--------|
| Approach | **C — four cards** |
| Theme control | Summary + quick select + Browse themes |
| Host mode UI label | **Page contrast** (key still `darkMode`) |
| Advanced card | Always expanded |
| Language row | Side-by-side + swap |
| Full ThemePreview on General | **No** |

---

## 13. Implementation Notes

- Prefer TDD for swap and disabled-position behavior.
- Keep `updateSettings` partial updates as today; no batch API required.
- Do not regress existing `id` hooks used in tests (`general-source-language`, `general-target-language`, `general-display-mode`, `general-theme`, `general-translation-position`, `general-host-page-mode`, `general-compact-inline-toggle`). Page contrast control may keep id `general-host-page-mode` for stability even though the visible label changes.
- After implementation, run project unit tests for options/settings and lint affected files.
