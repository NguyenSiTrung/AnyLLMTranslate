# Implementation Plan: Settings UI/UX Consistency & Polish

## Phase 1: Critical Fixes
<!-- execution: parallel -->

- [x] Task 1: Fix InlineTranslateSection — Header & Store Method (C1 + C2)
  <!-- files: entrypoints/options/sections/InlineTranslateSection.tsx -->
  - [x] Add sticky section header with icon badge, title, subtitle (match pattern from other 9 sections)
  - [x] Add outer `animate-fade-in-up` wrapper with stagger support
  - [x] Change `updateSetting` to `updateSettings` (plural) to match all other sections
  - [x] Verify auto-save badge triggers correctly after changes

- [x] Task 2: Fix SiteRulesSection — Delete Confirmation & Raw HTML (C3 + C4)
  <!-- files: entrypoints/options/sections/SiteRulesSection.tsx -->
  - [x] Add `pendingDeleteId` state and confirmation Modal (match DictionarySection pattern)
  - [x] Replace raw `<select>` in RuleEditForm category field with shared `Select` component
  - [x] Replace raw `<input>` in RuleEditForm custom category with shared `Input` component
  - [x] Verify delete flow: click delete → modal appears → confirm → rule removed

- [x] Task: Conductor - Phase Verification 'Critical Fixes' (Protocol in workflow.md)

## Phase 2: Component & High Priority Fixes
<!-- execution: parallel -->

- [x] Task 1: Remove Card Bordered Hover Lift (H3)
  <!-- files: ui/Card.tsx -->
  - [x] Remove `hover:-translate-y-[1px] hover:shadow-lg` from `bordered` variant
  - [x] Remove `motion-reduce:hover:translate-y-0 motion-reduce:hover:shadow-none` (no longer needed)
  - [x] Keep `transition-all duration-200` for remaining transitions

- [x] Task 2: Fix Toggle Description Spacing (H4)
  <!-- files: ui/Toggle.tsx -->
  - [x] Add `mt-0.5` to description `<p>` to match FieldGroup spacing convention

- [x] Task 3: Fix SiteRulesSection — Raw Checkbox & Missing Card Title (H1 + H7)
  <!-- files: entrypoints/options/sections/SiteRulesSection.tsx -->
  - [x] Replace raw `<input type="checkbox">` for Smart Excludes with shared `Toggle` component
  - [x] Add `title` and `icon` props to GlobalExcludesCard `<Card>` element

- [x] Task 4: Fix AdvancedSection — Raw Select (H2)
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx -->
  - [x] Replace raw `<select>` for Detection Mode with shared `Select` component

- [x] Task 5: Fix Statistics Card Variants (H5)
  <!-- files: entrypoints/options/sections/StatisticsSection.tsx -->
  - [x] Change 4 summary stat cards from `variant="bordered"` to `variant="default"`

- [x] Task 6: Fix Sidebar Icon Duplication (H6)
  <!-- files: entrypoints/options/App.tsx -->
  - [x] Change Inline tab icon from `Zap` to `TextCursorInput`
  - [x] Add `TextCursorInput` to lucide-react imports

- [x] Task: Conductor - Phase Verification 'Component & High Priority Fixes' (Protocol in workflow.md)

## Phase 3: Medium Polish
<!-- execution: parallel -->

- [x] Task 1: Sticky Header Opacity & Stagger Standardization (M1 + M7 + L5)
  <!-- files: entrypoints/options/sections/GeneralSection.tsx, entrypoints/options/sections/ProviderSection.tsx, entrypoints/options/sections/ThemesSection.tsx, entrypoints/options/sections/SiteRulesSection.tsx, entrypoints/options/sections/DictionarySection.tsx, entrypoints/options/sections/SubtitlesSection.tsx, entrypoints/options/sections/ShortcutsSection.tsx, entrypoints/options/sections/AdvancedSection.tsx, entrypoints/options/sections/StatisticsSection.tsx, entrypoints/options/sections/InlineTranslateSection.tsx -->
  - [x] Update sticky header `bg-[#09090b]/80` to `bg-[#09090b]/95` across all sections
  - [x] Standardize stagger delay to `Math.min(idx, 5)` (not `idx + 1`) across all sections
  - [x] Verify consistent stagger cap of 5 in all list renders

- [x] Task 2: Theme Grid Responsive Breakpoint (M2)
  <!-- files: entrypoints/options/sections/ThemesSection.tsx -->
  - [x] Add `lg:grid-cols-4` to theme grid for wide screens
  - [x] Keep existing `grid-cols-2 md:grid-cols-3`

- [x] Task 3: Dictionary Search Filter (M3)
  <!-- files: entrypoints/options/sections/DictionarySection.tsx -->
  - [x] Add search input above glossary table
  - [x] Filter entries by source or target text (case-insensitive)
  - [x] Show "X of Y entries" count

- [x] Task 4: Subtitle Disabled Controls State (M4)
  <!-- files: entrypoints/options/sections/SubtitlesSection.tsx -->
  - [x] Wrap appearance/behavior controls in a container
  - [x] Apply `opacity-50 pointer-events-none` when subtitles are disabled
  - [x] Follow established parent-gates-children pattern from patterns.md

- [x] Task 5: Setup Wizard Progress Bar (M5)
  <!-- files: entrypoints/options/SetupWizard.tsx -->
  - [x] Add visual progress bar (5 step dots or segmented bar) below "Step X of 5" text
  - [x] Highlight completed and current steps
  - [x] Use CSS transitions for step changes

- [x] Task 6: Keyboard Focus Management on Tab Switch (M6)
  <!-- files: entrypoints/options/App.tsx -->
  - [x] On sidebar tab change, move focus to the `<main>` content area
  - [x] Add `tabIndex={-1}` to `<main>` for programmatic focus
  - [x] Use `useRef` + `.focus()` on tab switch

- [x] Task: Conductor - Phase Verification 'Medium Polish' (Protocol in workflow.md)

## Phase 4: Low Priority Refinements
<!-- execution: parallel -->

- [x] Task 1: Fix Modal Focus Target (L1)
  <!-- files: ui/Modal.tsx -->
  - [x] For danger variant: focus Cancel button instead of Confirm
  - [x] Create `cancelRef` using `useRef`, add to Cancel `<Button>`
  - [x] Conditionally focus `cancelRef` for danger, `confirmRef` for info

- [x] Task 2: Dictionary Inline Edit — Save/Cancel (L2)
  <!-- files: entrypoints/options/sections/DictionarySection.tsx -->
  - [x] Replace onBlur auto-save with explicit Save/Cancel button pair
  - [x] Save commits edit, Cancel reverts to original value
  - [x] Enter key triggers Save, Escape triggers Cancel

- [x] Task 3: Shortcuts Accessibility (L3)
  <!-- files: entrypoints/options/sections/ShortcutsSection.tsx -->
  - [x] Add aria-labels to kbd elements for screen readers
  - [x] Add role="list" and role="listitem" for accessibility

- [x] Task: Conductor - Phase Verification 'Low Priority Refinements' (Protocol in workflow.md)

