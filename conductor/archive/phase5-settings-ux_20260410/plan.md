# Plan: Phase 5 — Settings UI/UX Overhaul

## Phase 1: Component Library Foundation
<!-- execution: parallel -->

- [ ] Task 1: Create shared UI primitives — Button, Input, Select, Card, Badge
  <!-- files: ui/Button.tsx, ui/Input.tsx, ui/Select.tsx, ui/Card.tsx, ui/Badge.tsx -->
  - [ ] Create `ui/Button.tsx` with variants: primary, secondary, danger, ghost. Props: variant, size, icon, disabled, loading, className
  - [ ] Create `ui/Input.tsx` with icon support, password toggle built-in. Props: type, icon, error, hint
  - [ ] Create `ui/Select.tsx` with custom ChevronDown icon. Props: options, value, onChange, icon
  - [ ] Create `ui/Card.tsx` with variants: default, bordered, elevated. Props: variant, title, icon, accent, className
  - [ ] Create `ui/Badge.tsx` for status badges. Props: variant (info, success, warning), children
  - [ ] Write unit tests for all 5 components

- [ ] Task 2: Create shared UI primitives — FieldGroup, Toggle, Slider, EmptyState
  <!-- files: ui/FieldGroup.tsx, ui/Toggle.tsx, ui/Slider.tsx, ui/EmptyState.tsx -->
  - [ ] Create unified `ui/FieldGroup.tsx` with label, description, error, hint, children. Replace all 3 duplicated definitions
  - [ ] Create `ui/Toggle.tsx` with accessible focus-visible ring, aria-checked, label. Replace inline toggle HTML
  - [ ] Create `ui/Slider.tsx` with value label display, min/max labels, aria-labelledby. Replace plain range inputs
  - [ ] Create `ui/EmptyState.tsx` with icon, message, action button. Replace repeated empty patterns
  - [ ] Write unit tests for all 4 components

- [ ] Task 3: Create Toast and Modal components
  <!-- files: ui/Toast.tsx, ui/Modal.tsx, ui/ToastProvider.tsx -->
  - [ ] Create `ui/Toast.tsx` with variants: success, error, info. Auto-dismiss after configurable duration
  - [ ] Create `ui/ToastProvider.tsx` — React context for imperative toast API (`useToast()` hook)
  - [ ] Create `ui/Modal.tsx` for confirmation dialogs. Props: title, message, confirmLabel, onConfirm, onCancel, variant (danger, info)
  - [ ] Ensure Modal traps focus and supports Escape key dismissal
  - [ ] Write unit tests for Toast, ToastProvider, and Modal

- [ ] Task 4: Create CSS animation utilities
  <!-- files: entrypoints/options/animations.css -->
  - [ ] Create `animations.css` with keyframes: fadeIn, fadeInUp, slideInRight, scaleIn, slideDown
  - [ ] Add stagger animation utility class with CSS custom property `--stagger-delay`
  - [ ] Add sidebar indicator slide animation
  - [ ] Add `@media (prefers-reduced-motion: reduce)` to disable all animations
  - [ ] Import animations.css in options style.css

## Phase 2: Sidebar & Layout Overhaul
<!-- execution: sequential -->
<!-- depends: phase1 -->

- [ ] Task 1: Refactor sidebar with grouped navigation
  <!-- files: entrypoints/options/App.tsx, entrypoints/options/style.css -->
  - [ ] Restructure TABS array into grouped categories: DISPLAY (General, Themes), TRANSLATION (Provider, Dictionary, Site Rules), MEDIA (Subtitles), SYSTEM (Shortcuts, Advanced)
  - [ ] Add uppercase group labels with subtle styling
  - [ ] Implement animated active tab indicator (sliding highlight)
  - [ ] Add branded sidebar header with subtle gradient background
  - [ ] Add sidebar hover states with `translateX(2px)` + background transition
  - [ ] Add keyboard navigation (Arrow keys between tabs, Enter to activate)

- [ ] Task 2: Add auto-save badge in sidebar footer
  <!-- files: entrypoints/options/App.tsx -->
  - [ ] Add "✓ Auto-saved" badge component in sidebar footer area
  - [ ] Wire badge to Zustand store — show briefly after any `updateSettings` call
  - [ ] Fade animation for badge appearance/disappearance

- [ ] Task 3: Add tab switch content animation
  <!-- files: entrypoints/options/App.tsx -->
  - [ ] Wrap content area with animation trigger on `activeTab` change
  - [ ] Apply `fadeInUp` animation (opacity 0→1, translateY 4px→0, 200ms ease-out)
  - [ ] Use `key={activeTab}` to re-trigger animation on tab change

- [ ] Task 4: Integrate ToastProvider at app root
  <!-- files: entrypoints/options/App.tsx, entrypoints/options/main.tsx -->
  - [ ] Wrap App in `<ToastProvider>` at root level
  - [ ] Verify toast rendering position (bottom-right, above content)

## Phase 3: Section Refactoring — Migrate to Shared Components
<!-- execution: parallel -->
<!-- depends: phase1, phase2 -->

- [ ] Task 1: Refactor GeneralSection with shared components and content grouping
  <!-- files: entrypoints/options/sections/GeneralSection.tsx -->
  - [ ] Replace local `FieldGroup` with `ui/FieldGroup`
  - [ ] Replace inline button styles with `ui/Button`
  - [ ] Replace `<select>` with `ui/Select`
  - [ ] Group fields into labeled Card containers: "Language" (source, target), "Display" (mode, theme), "Appearance" (position, dark mode)
  - [ ] Add section header with icon and accent border
  - [ ] Add fadeInUp animation to section mount

- [ ] Task 2: Refactor ProviderSection with accordion and shared components
  <!-- files: entrypoints/options/sections/ProviderSection.tsx -->
  - [ ] Replace local `FieldGroup` with `ui/FieldGroup`
  - [ ] Replace inline input/button styles with `ui/Input`, `ui/Button`
  - [ ] Convert provider presets from `<select>` to visual cards with icons/logos
  - [ ] Group essential fields (Preset, Base URL, API Key, Model, Test Connection) in main Card
  - [ ] Move Temperature, Max Tokens, System Prompt into collapsible "Advanced Settings" accordion (default closed)
  - [ ] Add horizontal progress bar (3 steps) for connection test
  - [ ] Add `aria-live="polite"` to test progress area
  - [ ] Replace test result error display with Toast

- [ ] Task 3: Refactor ThemesSection with enhanced previews
  <!-- files: entrypoints/options/sections/ThemesSection.tsx -->
  - [ ] Add theme card selection scale animation (`scale(1.02) → scale(1)`)
  - [ ] Improve checkmark animation on active theme
  - [ ] Add fadeInUp animation to section mount
  - [ ] Add stagger animation to theme grid cards

- [ ] Task 4: Refactor SiteRulesSection with shared components
  <!-- files: entrypoints/options/sections/SiteRulesSection.tsx -->
  - [ ] Replace inline styles with `ui/Button`, `ui/Input`, `ui/Badge`, `ui/Card`
  - [ ] Replace empty state with `ui/EmptyState`
  - [ ] Add stagger animation to rules list
  - [ ] Wrap in section header Card

- [ ] Task 5: Refactor DictionarySection with inline editing
  <!-- files: entrypoints/options/sections/DictionarySection.tsx -->
  - [ ] Replace inline styles with `ui/Button`, `ui/Input`
  - [ ] Replace empty state with `ui/EmptyState`
  - [ ] Implement inline row editing (click source/target cell to edit in-place, blur to save)
  - [ ] Add stagger animation to dictionary entries
  - [ ] Replace import alert() with Toast

- [ ] Task 6: Refactor SubtitlesSection with shared components
  <!-- files: entrypoints/options/sections/SubtitlesSection.tsx -->
  - [ ] Replace local `FieldGroup` with `ui/FieldGroup`
  - [ ] Replace inline toggle with `ui/Toggle`
  - [ ] Replace inline range with `ui/Slider`
  - [ ] Replace inline button styles with `ui/Button`
  - [ ] Group controls in labeled Card

- [ ] Task 7: Refactor ShortcutsSection with shared components
  <!-- files: entrypoints/options/sections/ShortcutsSection.tsx -->
  - [ ] Replace inline styles with `ui/Card`, `ui/Button`
  - [ ] Add section header Card with icon

- [ ] Task 8: Refactor AdvancedSection with shared components and Modal
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx -->
  - [ ] Replace inline toggle with `ui/Toggle`
  - [ ] Replace inline button styles with `ui/Button`
  - [ ] Replace `alert()` for import with Toast notification
  - [ ] Replace `confirm()` for reset with `ui/Modal` confirmation dialog
  - [ ] Add cache usage visualization (actual cache size bar)
  - [ ] Replace inline card styles with `ui/Card`

## Phase 4: Polish & Delight
<!-- execution: sequential -->
<!-- depends: phase3 -->

- [ ] Task 1: Connection test celebration and enhanced feedback
  <!-- files: entrypoints/options/sections/ProviderSection.tsx, entrypoints/options/animations.css -->
  - [ ] Add success celebration animation when all 3 test steps pass (animated checkmark with glow)
  - [ ] Enhance progress step animations (step icons animate in sequence)

- [ ] Task 2: Accessibility final pass
  <!-- files: entrypoints/options/App.tsx, ui/Toggle.tsx, ui/Slider.tsx -->
  - [ ] Add skip navigation link at top of options page
  - [ ] Verify all interactive elements have visible focus-visible states
  - [ ] Verify `aria-labelledby` on all range inputs
  - [ ] Test keyboard navigation flow end-to-end (Tab, Arrow, Enter, Escape)

- [ ] Task 3: Final visual polish and consistency audit
  <!-- files: entrypoints/options/style.css, entrypoints/options/animations.css -->
  - [ ] Audit all sections for consistent spacing, typography, and color usage
  - [ ] Verify accent color hierarchy (blue-500 primary, emerald success, amber warning, red danger)
  - [ ] Ensure no layout shifts during animations (transform + opacity only)
  - [ ] Test `prefers-reduced-motion` disables all animations correctly
  - [ ] Verify build size stays under 400KB

- [ ] Task 4: Conductor — Phase Verification
  - [ ] Run full test suite: `pnpm test`
  - [ ] Run lint: `pnpm lint`
  - [ ] Manual verification of all sections in Chrome extension
  - [ ] Verify build size
  - [ ] Update track learnings
