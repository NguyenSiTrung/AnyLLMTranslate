# Spec: Settings UI/UX Polish & Bug Fixes

## Overview

Moderate enhancement pass across all 8 Settings sections to fix UX bugs,
restructure dense layouts, improve visual polish, and raise the overall
premium feel — while preserving the existing sidebar + content shell and
12-component UI library.

## Functional Requirements

### FR-1: Fix Critical UX Bugs
- **FR-1.1**: Remove misleading cache usage bar in AdvancedSection.
  The current `cacheUsagePct` is derived from `cacheTTLDays / 30 * 100`,
  which bears no relation to actual cache usage. Replace with either
  real IndexedDB usage estimate or remove the bar entirely.
- **FR-1.2**: Add delete confirmation for Dictionary entries.
  Use the existing `Modal` component with danger variant before removing
  glossary entries.
- **FR-1.3**: Add include/exclude CSS selector fields to SiteRules
  `RuleEditForm`. The `SiteRule` type already has `includeSelectors` and
  `excludeSelectors` arrays but they are not editable in the UI.
- **FR-1.4**: Fix icon duplication in GeneralSection — header uses
  `Monitor` and Display card also uses `Monitor`. Assign distinct icons.
- **FR-1.5**: Fix scroll position leak between tabs. Reset
  `.settings-content` scroll position to top on tab switch.

### FR-2: Restructure Dense Sections
- **FR-2.1**: Merge AdvancedSection's 5 cards into 2-3 logical groups:
  (a) Cache Management (merge "Translation Cache" stats + "Cache Configuration"
  inputs into one card), (b) Data & Debug (merge "Settings Data" + "Developer"),
  (c) Reset stays as a standalone danger action.
- **FR-2.2**: Add visual sub-grouping in SubtitlesSection's controls card.
  Group into "Appearance" (position, font family, font size, opacity) and
  "Behavior" (display mode, translation timeout) with subtle dividers.
- **FR-2.3**: Cap stagger animation delay in DictionarySection table.
  Limit `--stagger-delay` to max 5 to prevent 1.5s+ entrance delays on
  large glossaries.

### FR-3: Enhance Visual Polish
- **FR-3.1**: Assign distinct accent colors to each section header icon.
  Replace all-blue with section-specific colors (e.g., General → blue,
  Provider → amber, Themes → pink, Dictionary → emerald, Site Rules → teal,
  Subtitles → cyan, Shortcuts → orange, Advanced → zinc).
- **FR-3.2**: Integrate live ThemePreview into the Themes gallery section.
  Show a full-width preview card above the grid that updates when a theme
  card is clicked.
- **FR-3.3**: Improve Provider preset cards readability — increase
  base URL font size, add icon/logo per provider, adjust grid for
  better breathing room.
- **FR-3.4**: Fix ThemePreview sample text consistency — use the
  user's configured target language, or show a language-neutral sample.
- **FR-3.5**: Update version badge from hardcoded `v0.1.0` to either
  dynamic source or accurate current version `v1.0.0`.

### FR-4: Micro-interaction & Animation Refinements
- **FR-4.1**: Add hover glow/lift effects on interactive Card components
  (subtle `translateY(-1px)` + box-shadow on hover).
- **FR-4.2**: Add smooth transition when toggling SubtitlesSection's
  enabled state (fade/dim controls instead of instant opacity swap).
- **FR-4.3**: Improve the Shortcuts section — add a subtle keyboard key
  press animation on hover for the `<kbd>` elements.

## Non-Functional Requirements

- All changes must pass existing 524+ tests without regression.
- Build must remain under 600KB total.
- No new npm dependencies.
- Must respect `prefers-reduced-motion` media query.

## Acceptance Criteria

1. Cache usage bar either shows real data or is removed entirely.
2. Deleting a dictionary entry shows a confirmation modal.
3. SiteRules edit form includes CSS selector input fields.
4. Switching tabs always scrolls content to top.
5. Advanced section has ≤ 3 cards instead of 5.
6. Each section header icon has a unique accent color.
7. Themes section shows a live full-width preview.
8. All animations respect `prefers-reduced-motion`.
9. `npm run build` succeeds. Existing tests pass.

## Out of Scope

- Sidebar layout changes (already optimized in prior track).
- New shared UI components (use existing 12-component library).
- Mobile/responsive improvements (desktop-only extension).
- Keyboard shortcut remapping UI (Chrome-managed).
- Adding new settings/features.
