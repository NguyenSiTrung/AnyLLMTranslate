# Implementation Plan: Settings UI/UX Consistency & Polish

## Phase 1: Critical Fixes
<!-- execution: parallel -->

- [ ] Task 1: Fix InlineTranslateSection — Header & Store Method (C1 + C2)
  <!-- files: entrypoints/options/sections/InlineTranslateSection.tsx -->
  - [ ] Add sticky section header with icon badge, title, subtitle (match pattern from other 9 sections)
  - [ ] Add outer `animate-fade-in-up` wrapper with stagger support
  - [ ] Change `updateSetting` to `updateSettings` (plural) to match all other sections
  - [ ] Verify auto-save badge triggers correctly after changes

- [ ] Task 2: Fix SiteRulesSection — Delete Confirmation & Raw HTML (C3 + C4)
  <!-- files: entrypoints/options/sections/SiteRulesSection.tsx -->
  - [ ] Add `pendingDeleteId` state and confirmation Modal (match DictionarySection pattern)
  - [ ] Replace raw `<select>` in RuleEditForm category field with shared `Select` component
  - [ ] Replace raw `<input>` in RuleEditForm custom category with shared `Input` component
  - [ ] Verify delete flow: click delete → modal appears → confirm → rule removed

- [ ] Task: Conductor - Phase Verification 'Critical Fixes' (Protocol in workflow.md)

## Phase 2: Component & High Priority Fixes
<!-- execution: parallel -->

- [ ] Task 1: Remove Card Bordered Hover Lift (H3)
  <!-- files: ui/Card.tsx -->
  - [ ] Remove `hover:-translate-y-[1px] hover:shadow-lg` from `bordered` variant
  - [ ] Remove `motion-reduce:hover:translate-y-0 motion-reduce:hover:shadow-none` (no longer needed)
  - [ ] Keep `transition-all duration-200` for remaining transitions

- [ ] Task 2: Fix Toggle Description Spacing (H4)
  <!-- files: ui/Toggle.tsx -->
  - [ ] Add `mt-0.5` to description `<p>` to match FieldGroup spacing convention

- [ ] Task 3: Fix SiteRulesSection — Raw Checkbox & Missing Card Title (H1 + H7)
  <!-- files: entrypoints/options/sections/SiteRulesSection.tsx -->
  - [ ] Replace raw `<input type="checkbox">` for Smart Excludes with shared `Toggle` component
  - [ ] Add `title` and `icon` props to GlobalExcludesCard `<Card>` element

- [ ] Task 4: Fix AdvancedSection — Raw Select (H2)
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx -->
  - [ ] Replace raw `<select>` for Detection Mode with shared `Select` component

- [ ] Task 5: Fix Statistics Card Variants (H5)
  <!-- files: entrypoints/options/sections/StatisticsSection.tsx -->
  - [ ] Change 4 summary stat cards from `variant="bordered"` to `variant="default"`

- [ ] Task 6: Fix Sidebar Icon Duplication (H6)
  <!-- files: entrypoints/options/App.tsx -->
  - [ ] Change Inline tab icon from `Zap` to `TextCursorInput`
  - [ ] Add `TextCursorInput` to lucide-react imports

- [ ] Task: Conductor - Phase Verification 'Component & High Priority Fixes' (Protocol in workflow.md)

## Phase 3: Medium Polish
<!-- execution: parallel -->

- [ ] Task 1: Sticky Header Opacity & Stagger Standardization (M1 + M7 + L5)
  <!-- files: entrypoints/options/sections/GeneralSection.tsx, entrypoints/options/sections/ProviderSection.tsx, entrypoints/options/sections/ThemesSection.tsx, entrypoints/options/sections/SiteRulesSection.tsx, entrypoints/options/sections/DictionarySection.tsx, entrypoints/options/sections/SubtitlesSection.tsx, entrypoints/options/sections/ShortcutsSection.tsx, entrypoints/options/sections/AdvancedSection.tsx, entrypoints/options/sections/StatisticsSection.tsx, entrypoints/options/sections/InlineTranslateSection.tsx -->
  - [ ] Update sticky header `bg-[#09090b]/80` to `bg-[#09090b]/95` across all sections
  - [ ] Standardize stagger delay to `Math.min(idx, 5)` (not `idx + 1`) across all sections
  - [ ] Verify consistent stagger cap of 5 in all list renders

- [ ] Task 2: Theme Grid Responsive Breakpoint (M2)
  <!-- files: entrypoints/options/sections/ThemesSection.tsx -->
  - [ ] Add `lg:grid-cols-4` to theme grid for wide screens
  - [ ] Keep existing `grid-cols-2 md:grid-cols-3`

- [ ] Task 3: Dictionary Search Filter (M3)
  <!-- files: entrypoints/options/sections/DictionarySection.tsx -->
  - [ ] Add search input above glossary table
  - [ ] Filter entries by source or target text (case-insensitive)
  - [ ] Show "X of Y entries" count

- [ ] Task 4: Subtitle Disabled Controls State (M4)
  <!-- files: entrypoints/options/sections/SubtitlesSection.tsx -->
  - [ ] Wrap appearance/behavior controls in a container
  - [ ] Apply `opacity-50 pointer-events-none` when subtitles are disabled
  - [ ] Follow established parent-gates-children pattern from patterns.md

- [ ] Task 5: Setup Wizard Progress Bar (M5)
  <!-- files: entrypoints/options/SetupWizard.tsx -->
  - [ ] Add visual progress bar (5 step dots or segmented bar) below "Step X of 5" text
  - [ ] Highlight completed and current steps
  - [ ] Use CSS transitions for step changes

- [ ] Task 6: Keyboard Focus Management on Tab Switch (M6)
  <!-- files: entrypoints/options/App.tsx -->
  - [ ] On sidebar tab change, move focus to the `<main>` content area
  - [ ] Add `tabIndex={-1}` to `<main>` for programmatic focus
  - [ ] Use `useRef` + `.focus()` on tab switch

- [ ] Task: Conductor - Phase Verification 'Medium Polish' (Protocol in workflow.md)

## Phase 4: Low Priority Refinements
<!-- execution: parallel -->

- [ ] Task 1: Fix Modal Focus Target (L1)
  <!-- files: ui/Modal.tsx -->
  - [ ] For danger variant: focus Cancel button instead of Confirm
  - [ ] Create `cancelRef` using `useRef`, add to Cancel `<Button>`
  - [ ] Conditionally focus `cancelRef` for danger, `confirmRef` for info

- [ ] Task 2: Dictionary Inline Edit — Save/Cancel (L2)
  <!-- files: entrypoints/options/sections/DictionarySection.tsx -->
  - [ ] Replace onBlur auto-save with explicit Save/Cancel button pair
  - [ ] Save commits edit, Cancel reverts to original value
  - [ ] Enter key triggers Save, Escape triggers Cancel

- [ ] Task 3: Select Empty State (L3)
  <!-- files: ui/Select.tsx -->
  - [ ] Handle empty `options` array gracefully
  - [ ] Show disabled state with "No options available" placeholder

- [ ] Task: Conductor - Phase Verification 'Low Priority Refinements' (Protocol in workflow.md)
