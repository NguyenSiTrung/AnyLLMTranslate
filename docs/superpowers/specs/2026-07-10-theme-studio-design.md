# Theme Studio (Settings → Themes) — Design Spec

> **Date:** 2026-07-10  
> **Scope:** Settings → Themes tab full redesign (Theme Studio)  
> **Status:** Approved (user chose Approach C + Article mock canvas)  
> **Beads:** ALT-z84  
> **Related:** [2026-07-09 General Tab Restructure](./2026-07-09-general-tab-restructure-design.md) (theme summary + Browse themes; Themes remains the full gallery)  
> **Related:** [2026-05-06 General Tab UX Overhaul](./2026-05-06-general-tab-ux-overhaul-design.md) (ThemePreview fidelity notes)

---

## 1. Context

The Themes tab is a flat gallery of 17 cards (16 presets + Custom) plus a live `ThemePreview` and a conditional `CustomThemeEditor`. It works, but falls short of product quality and brand:

| Problem | Detail |
|---------|--------|
| **Fidelity gap** | Card thumbnails use hand-rolled Tailwind classes, not real `inject.css` theme rules. Mask, fade-in, side-by-side, bubble, and gradient misrepresent the page. |
| **Dense equal grid** | All themes compete equally; no categories; title + description share one cramped line. |
| **Layout hierarchy** | Tall preview sits above the grid and scrolls away; Custom editor is buried under cards when selected. |
| **Preview clutter** | Loading/error samples always visible; dark toggle is local-only and disconnected from page contrast. |
| **Brand drift** | Section accent pink + selection blue vs product teal/cyan + amber. |
| **Metadata drift** | `THEMES` in `ThemesSection.tsx` vs `GENERAL_THEME_OPTIONS` in `lib/themes.ts`. |
| **A11y** | Cards are buttons without radiogroup/`aria-checked` semantics. |
| **Custom editor** | Raw selects/color inputs; no transparent fill control; no live swatches on Custom card. |

**User decision:** Approach **C — Full Theme Studio**, with primary canvas = **article mock** (heading, body, list, short UI label).

---

## 2. Goals

1. **Theme Studio experience** — choosing a style feels like designing, not filling a form.
2. **What you see is what you get** — previews use real `inject.css` (`data-anyllm-theme`, dark class, position/state, custom CSS vars).
3. **Article-first canvas** — realistic light/dark article shell as the primary preview surface.
4. **Progressive power** — one-click presets; Custom unlocks a full editor without cluttering browsing.
5. **Instant feedback** — hover can soft-preview; click commits; canvas updates immediately.
6. **Brand-coherent chrome** — teal/cyan primary selection, amber for secondary accents per `product-guidelines.md`.
7. **Single theme registry** — `lib/themes.ts` feeds General and Themes.
8. **Accessible gallery** — keyboard-first, radiogroup semantics, reduced motion.
9. **No new settings schema** — existing `theme` / `customTheme` only; ephemeral UI state is local.

## 3. Non-Goals

- Changing how themes render on real web pages (page CSS behavior stays unless a clear bug blocks studio fidelity).
- Adding new preset theme IDs beyond the current 16 + `custom` (registry structure may allow packs later).
- Theme JSON import/export (stretch only if trivial after core; not required for done).
- Merging Themes back into General, or reintroducing full studio canvas on General.
- Popup redesign or subtitle theme styling.
- Favorites / recently used (out of v1).
- Binding sample translation language to `targetLanguage` (fixed bilingual demo copy is fine for v1).

---

## 4. Product Principles

1. **Non-intrusive by default** — studio chrome should not look like the host page theme itself.
2. **Progressive disclosure** — sample states collapsed; custom editor only when relevant.
3. **Instant feedback** — hover preview + live canvas.
4. **Accessible** — WCAG 2.1 AA for options UI; color is not the only selection signal.
5. **Dark mode native** — canvas light/dark/match controls.

---

## 5. Information Architecture & Layout

### 5.1 Desktop (≥ `lg`)

```
┌─────────────────────────────────────────────────────────────────┐
│ SectionHeader: Theme Studio                                     │
│ “See how translations look on a real page, then pick a style.”│
├──────────────────────────────┬──────────────────────────────────┤
│ LEFT ~40%: Gallery           │ RIGHT ~60%: Studio (sticky)      │
│ Category chips               │ Article mock shell               │
│ Optional compact search      │ Canvas toolbar                   │
│ Visual-first theme cards     │ Theme tip                        │
│                              │ [Show sample states ▾]           │
│                              │ Custom editor (if custom)        │
└──────────────────────────────┴──────────────────────────────────┘
│ Footer: Position & display mode live in General → deep link CTA │
```

### 5.2 Narrow (&lt; `lg`)

- Stack: **canvas first** (compact height), gallery below.
- Canvas may use sticky-top within the options content scroll area where practical.
- Category chips wrap; gallery remains 2 columns when width allows, else 1.

### 5.3 Section header

| Field | Value |
|-------|--------|
| Title | `Theme Studio` |
| Description | `See how translations look on a real page, then pick a style.` |
| Icon | `Palette` |
| Accent | Teal/cyan brand token (align SectionHeader accent with product primary; stop using pink solely for this tab) |

### 5.4 Categories (single-select chips including All)

| Category | Theme IDs |
|----------|-----------|
| **All** | (no filter) |
| **Classic** | `dividing-line`, `blockquote`, `paper`, `underline`, `italic`, `minimal` |
| **Accent** | `dashed-underline`, `highlight`, `wavy-underline`, `dotted-border`, `gradient-accent` |
| **Layout** | `side-by-side`, `bubble`, `shadow-card` |
| **Interactive** | `mask`, `fade-in` |
| **Custom** | `custom` |

Empty filter result: show empty state (“No themes in this category”) — should not happen for built-in categories if registry is complete.

### 5.5 Selection model

| Input | Behavior |
|-------|----------|
| **Click card** | Commit `settings.theme = id` |
| **Hover card** (fine pointer) | Soft-preview: local `previewTheme = id`; canvas uses preview until hover ends |
| **Mouse leave gallery** | Clear soft-preview; canvas returns to committed theme |
| **Focus card** (keyboard) | Soft-preview on focus (same local state) |
| **Space / Enter on card** | Commit theme |
| **Touch** | No sticky hover-preview; tap commits |
| **prefers-reduced-motion** | Disable select bounce / one-shot interactive demos; tips still explain Mask / Fade In |

Committed theme always drives store + General summary. Soft-preview never writes to storage.

### 5.6 Footer

Muted helper: `Translation position and display mode are set in General.`  
Optional secondary control: button/link that calls the same navigation pattern as other cross-tab CTAs if App already supports programmatic tab change; otherwise plain text is enough. Prefer wiring `onNavigateToGeneral` if trivial (mirror General → Themes).

---

## 6. Article Mock Canvas

### 6.1 Purpose

Primary experience surface: a **fake article page** so users judge themes in context, not as floating bilingual snippets alone.

### 6.2 Shell

- Framed “site” chrome: subtle top bar (`example.com` · `Article`) for realism; not interactive.
- Host page colors depend on canvas mode (see §6.4).
- Inner content width readable (~prose measure); padding matches a simple blog post.

### 6.3 Content blocks (fixed demo copy)

Use fixed English + Vietnamese samples (existing ThemePreview spirit). Blocks:

1. **Title** — host-only heading (theme must not style as translation).
2. **Lead paragraph** — original + themed translation, ordered by `settings.translationPosition` (`below` | `above` | `side` as supported by inject CSS).
3. **List** — one bilingual list item (stresses side-by-side / spacing).
4. **UI label row** — host “Settings” + `anyllm-inline-bilingual` sample reflecting compact inline behavior when dual mode.

Honor `settings.displayMode`:

- `bilingual-below` (and dual state) → `data-anyllm-state="dual"`.
- `translation-only` → `data-anyllm-state="translation-only"`.

### 6.4 Canvas toolbar

Segmented control **canvas page mode** (ephemeral, default **Match page contrast**):

| Mode | Behavior |
|------|----------|
| **Light** | Light shell; no `anyllm-dark` on preview root |
| **Dark** | Dark shell + `anyllm-dark` so theme dark variants apply |
| **Match page contrast** | Follow `settings.darkMode`: `light` → Light; `dark` → Dark; `auto` → `prefers-color-scheme` (fallback light if unavailable) |

Also show:

- **Active theme readout** — label from registry (soft-preview shows preview name with subtle “Previewing” if different from committed).
- **Tip** — optional `tip` from registry (e.g. Mask: “Hover or focus the translation to reveal.”).
- **Sample states** — collapsed by default; expand reveals loading + error samples (port ThemePreview behavior) with muted “Sample states” label.

### 6.5 Fidelity requirements

Canvas root (or themed subtree) must set:

- `data-anyllm-theme` = effective theme (preview or committed)
- `data-anyllm-state` = dual | translation-only
- `data-anyllm-position` = settings.translationPosition
- Custom CSS variables when effective theme is `custom` (same mapping as current ThemePreview)
- Dark: class `anyllm-dark` on the preview container consistent with inject.css expectations

**Do not** re-implement themes with Tailwind on the canvas.

### 6.6 Component evolution

Evolve `ThemePreview` into **`ThemeStudioCanvas`** (rename or thin wrapper). Keep a single preview code path. Update existing ThemePreview tests to the new component name/API.

---

## 7. Gallery Cards

### 7.1 Anatomy

```
┌─────────────────────────┐
│  [ real CSS mini sample ]│  ~60–70% visual
│  original               │
│  themed translation     │
├─────────────────────────┤
│ Label                   │
│ Short description       │
│ (Custom: color swatches)│
└─────────────────────────┘
```

- **Selected:** teal/cyan ring + check badge (not blue/pink).
- **Soft-preview (hover/focus, not selected):** quieter ring or lift without check.
- **Custom card:** live swatches from `settings.customTheme` (text, bg, border).
- Mini sample uses real theme attrs at reduced type size; may use a shortened bilingual pair for density.

### 7.2 Interactive themes

When motion is allowed:

- **Mask:** one-shot unblur on card hover/focus.
- **Fade-in:** one-shot opacity animation on card hover/focus (respect inject keyframes if possible).

When reduced motion: static final appearance + tip on canvas only.

### 7.3 Accessibility

- Gallery container: `role="radiogroup"` + accessible name (“Display themes”).
- Each card: `role="radio"`, `aria-checked={committed}`, `aria-label` = `${label}. ${description}`.
- Focus-visible ring required.
- Do not rely on color alone for selection (check icon remains).

---

## 8. Custom Theme Editor

### 8.1 Placement

When committed theme is `custom` **or** soft-preview is `custom`, show editor **under the canvas** (right column), not under the full gallery.

### 8.2 Controls (same schema as today)

| Control | Field | Notes |
|---------|-------|-------|
| Text color | `textColor` | Swatch + hex; shared field styling |
| Background | `backgroundColor` | **No fill** toggle → transparent; when off, color picker enabled |
| Border style | `borderStyle` | none / solid / dashed / dotted via shared `Select` |
| Border color | `borderColor` | Swatch + hex; disabled visual weight when style is `none` |
| Font style | `fontStyle` | normal / italic |
| Font size | `fontSize` | smaller / same / larger |

Use design-system primitives (`FieldGroup`, `Select`, `Button`) instead of one-off raw controls where they exist.

### 8.3 Actions

- **Reset to defaults** — restores `DEFAULT_CUSTOM_THEME`.
- **Start from preset…** — select a non-custom preset; maps **available knobs only** to sensible approximations (text/bg/border/font). Microcopy: `Custom themes support colors, border, and type — not full preset effects (e.g. bubble tails).`  
  Does **not** invent CSS the custom engine cannot express.

### 8.4 Live feedback

Canvas + Custom card swatches update on every knob change (existing store path).

---

## 9. Theme Registry

### 9.1 Expand `lib/themes.ts`

```ts
export type ThemeCategory = 'classic' | 'accent' | 'layout' | 'interactive' | 'custom';

export interface ThemeDefinition {
  id: ThemeName;
  label: string;
  description: string;
  category: ThemeCategory;
  /** Short studio helper shown under the canvas */
  tip?: string;
}

export const THEME_DEFINITIONS: ThemeDefinition[]; // all ThemeName values, exhaustively

export function getThemeDefinition(id: ThemeName): ThemeDefinition | undefined;
export function themeOptionsForSelect(): { value: string; label: string }[]; // exclude custom (General)
export function themesByCategory(category: ThemeCategory | 'all'): ThemeDefinition[];
```

### 9.2 Exhaustiveness

- TypeScript must fail if a `ThemeName` is missing from the registry (satisfies / exhaustive helper pattern used elsewhere in the repo if available).
- Remove inline `THEMES` array from `ThemesSection.tsx`.
- General continues to use registry for summary + select labels.

### 9.3 Tips (examples; final copy may refine)

| ID | Tip |
|----|-----|
| `mask` | Hover or focus the translation to reveal it. |
| `fade-in` | Translation eases in after a short delay. |
| `side-by-side` | Original and translation share a row when space allows. |
| `bubble` | Translation appears in a speech-bubble style callout. |
| `custom` | Tune colors, border, and type below. Other presets may use effects custom cannot fully copy. |

---

## 10. Brand & Visual Tokens

| Element | Treatment |
|---------|-----------|
| Selected card | Teal/cyan border + soft fill (`sky`/`cyan` consistent with options page primary actions if already standardized; prefer tokens used by primary `Button`) |
| Soft-preview card | Neutral lift + thinner ring |
| Category chip active | Same primary family |
| Section accent | Align with primary (not pink-only) |
| Amber | Optional for “Previewing” badge or tip icon — highlights, not selection |

Avoid purple/violet decorative choices that fight product guidelines.

---

## 11. Component Architecture

| Component | Path (proposed) | Responsibility |
|-----------|-----------------|----------------|
| `ThemesSection` | `entrypoints/options/sections/ThemesSection.tsx` | Shell, categories, split layout, store wiring, footer |
| `ThemeGallery` | `entrypoints/options/components/ThemeGallery.tsx` (or colocated) | Filter + radiogroup grid |
| `ThemeCard` | same folder | Card + mini real-CSS preview + swatches |
| `ThemeStudioCanvas` | `entrypoints/options/ThemeStudioCanvas.tsx` (evolve ThemePreview) | Article mock + toolbar + states |
| `CustomThemeEditor` | `entrypoints/options/CustomThemeEditor.tsx` | Polished custom knobs |
| Registry | `lib/themes.ts` | Metadata + helpers |

**Ephemeral state (React local in ThemesSection or canvas):**

- `previewTheme: ThemeName | null`
- `canvasMode: 'light' | 'dark' | 'match'` (default `'match'`)
- `showSampleStates: boolean` (default `false`)
- `category: ThemeCategory | 'all'` (default `'all'`)

**No new chrome.storage keys.**

---

## 12. Cross-Tab Contracts

| Surface | Contract |
|---------|----------|
| **General Style card** | Unchanged IA: summary + select + Browse themes. Labels from shared registry. Select excludes `custom` (user opens Theme Studio for Custom). |
| **Browse themes** | Continues to switch active tab to `themes`. |
| **Display mode / position** | Edited only on General; canvas reads live from store. |
| **Page contrast (`darkMode`)** | Edited on General; canvas “Match” mode reads it. |

If General currently cannot select `custom` via select, keep that; Custom remains Theme Studio–primary.

---

## 13. Phased Delivery

Each phase is shippable alone. **Full Approach C = C1–C4.**

| Phase | Deliverable | Done when |
|-------|-------------|-----------|
| **C1** | Registry unification; true mini-previews; card hierarchy; brand selection accents; remove Tailwind fake previews | Cards use real theme attrs; General uses registry; visual selection is brand-primary |
| **C2** | Split sticky layout; article mock canvas; light/dark/match toolbar; sample states collapsed | Desktop split works; narrow stacks; canvas fidelity matches inject.css |
| **C3** | Categories; hover/focus soft-preview; tips; interactive one-shots | Filters work; soft-preview does not write storage; reduced motion honored |
| **C4** | Custom editor under canvas; No fill; Start from preset; shared controls; Custom swatches | Custom UX complete; no raw one-off selects if Select exists |

---

## 14. Testing

| Area | Tests |
|------|-------|
| Registry | All `ThemeName` values present; categories exclusive; `themeOptionsForSelect` excludes custom |
| ThemesSection / Gallery | Category filter; commit on click; soft-preview does not persist; custom editor visibility rules |
| ThemeStudioCanvas | Light/dark/`anyllm-dark`; dual vs translation-only; position attrs; custom CSS vars; sample states expand |
| General | Existing browse/select/theme summary tests still pass with registry |
| A11y smoke | radiogroup/radio roles and aria-checked on committed theme |

Port and rename existing `ThemePreview` tests rather than abandoning coverage.

---

## 15. Migration & Risk

| Risk | Mitigation |
|------|------------|
| Mini-preview CSS isolation vs options page Tailwind | Scope attrs on a dedicated preview root; reuse `.theme-preview-container` patterns from inject.css |
| Sticky canvas vs options scroll container | Test sticky containing block; fall back to non-sticky if parent overflow breaks sticky |
| Soft-preview confusion | “Previewing” readout when soft ≠ committed; leave gallery clears preview |
| Custom “Start from” overpromise | Explicit microcopy; map only supported knobs |
| Bundle size | No new dependencies; pure React + existing CSS |

**Migration:** none — pure UI. Existing `theme` / `customTheme` values remain valid.

---

## 16. Acceptance Criteria

1. Themes tab presents as **Theme Studio** with article mock canvas and gallery (split on large screens).
2. All preset cards and canvas use **real inject theme CSS**, not Tailwind approximations.
3. Category chips filter the gallery correctly; All shows every theme including Custom.
4. Click commits theme to store; hover/focus soft-preview does not.
5. Canvas default mode is **Match page contrast**; Light/Dark overrides work.
6. Sample states are collapsed by default and expandable.
7. Custom editor appears under canvas when custom is active (or soft-previewed); supports No fill, Reset, Start from preset.
8. Single registry powers Themes + General labels/select.
9. Keyboard users can move through themes and commit with Space/Enter; `aria-checked` reflects committed theme.
10. Reduced motion disables bounce/one-shot demos.
11. Existing General Browse themes + theme select tests remain green; ThemePreview coverage ported.

---

## 17. Open Implementation Notes (non-blocking)

- Exact file split under `components/` vs `options/` root: implementer’s call if import paths stay clear.
- Optional compact search over labels is nice-to-have in C3; not required for acceptance.
- Cross-tab “Open General” footer CTA if App navigation helper is easy; else text-only footer.
- Prefer reusing primary button color tokens already used in options for selection ring consistency.

---

## 18. Spec Self-Review

| Check | Result |
|-------|--------|
| Placeholders / TBD | None remaining for v1 decisions |
| Internal consistency | Article mock + Approach C + phases C1–C4 aligned |
| Scope | Full studio UI; no page CSS rewrite; no new theme IDs; no storage keys |
| Ambiguity | Soft-preview vs commit defined; Match mode default defined; categories explicit |

---

## 19. Next Step

After user reviews this file: create implementation plan via writing-plans skill (`docs/superpowers/plans/…`), then implement phases C1→C4 with tests.
