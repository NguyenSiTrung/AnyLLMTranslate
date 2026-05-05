# Settings UI/UX Consistency & Polish

## Overview

Comprehensive UI/UX polish pass across all 11 Settings sections (Options page) to fix
consistency violations, broken UX flows, accessibility gaps, and visual polish issues
identified during a deep code-level audit. Covers 23 items across Critical, High,
Medium, and Low priorities.

## Functional Requirements

### Critical Fixes
- C1: Add sticky section header (icon badge + title + subtitle) to InlineTranslateSection, matching the pattern used by all other 9 sections
- C2: Fix InlineTranslateSection to use `updateSettings` (plural) instead of `updateSetting` (singular) to ensure correct auto-save flow
- C3: Add delete confirmation Modal to SiteRulesSection (matching DictionarySection's `pendingDeleteId` pattern)
- C4: Replace raw `<select>` and `<input>` in RuleEditForm with shared `Select` and `Input` components

### High Priority Fixes
- H1: Replace raw checkbox in GlobalExcludesCard (Smart Excludes) with shared `Toggle` component
- H2: Replace raw `<select>` in AdvancedSection (Detection Mode) with shared `Select` component
- H3: Remove `hover:-translate-y-[1px] hover:shadow-lg` from Card `bordered` variant (static containers should not have interactive hover lift)
- H4: Add `mt-0.5` to Toggle component description to match FieldGroup spacing
- H5: Change Statistics summary cards from `bordered` to `default` variant (pure display, no hover)
- H6: Change Inline sidebar tab icon from `Zap` to `TextCursorInput` (avoid duplicate with Provider)
- H7: Add `title` and `icon` props to GlobalExcludesCard

### Medium Priority Fixes
- M1: Increase sticky header backdrop opacity from `/80` to `/95` for stronger scroll background
- M2: Add `lg:grid-cols-4` breakpoint to ThemesSection grid for wide screens
- M3: Add search filter to DictionarySection glossary table
- M4: Disable subtitle appearance/behavior controls when subtitles are disabled (opacity-50 + pointer-events-none)
- M5: Add visual step progress bar to SetupWizard
- M6: Move focus to content panel on sidebar tab switch for keyboard navigation
- M7: Standardize stagger animation delay (consistently use `idx` not `idx + 1`)

### Low Priority Fixes
- L1: Fix Modal to focus Cancel button (not Confirm) for danger variant
- L2: Add explicit Save/Cancel buttons to DictionarySection inline edit (instead of onBlur auto-save)
- L3: Add empty state to Select component when options array is empty
- L4: Duplicate Toggle in popup — note for future unification (no change in this track)
- L5: Standardize stagger delay cap across all sections

## Non-Functional Requirements
- No new dependencies
- All existing tests must continue passing
- Build size should not increase by more than 1KB
- Follow established patterns from `conductor/patterns.md`
- Conservative approach: fix consistency issues without restructuring card layouts

## Acceptance Criteria
- [ ] All 11 sections have consistent sticky section headers
- [ ] All boolean settings use the shared Toggle component (no raw checkboxes)
- [ ] All select/input elements use shared Select/Input components (no raw HTML)
- [ ] Destructive actions (delete) have confirmation modals
- [ ] Card hover lift only on interactive cards
- [ ] No duplicate sidebar icons
- [ ] `pnpm test` passes
- [ ] `pnpm lint` passes
- [ ] `wxt build` succeeds

## Out of Scope
- Popup UI changes (L4 noted but deferred)
- Card layout restructuring (conservative approach per patterns.md)
- New UI components
- DictionarySection pagination/virtualization (separate track if needed)
