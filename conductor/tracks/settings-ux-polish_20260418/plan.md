# Plan: Settings UI/UX Polish & Bug Fixes

## Phase 1: Critical Bug Fixes
<!-- execution: parallel -->
<!-- depends: -->

- [x] Task 1: Fix scroll position leak on tab switch
  <!-- files: entrypoints/options/App.tsx -->
  - [ ] Add `useRef` for `.settings-content` scroll container
  - [ ] Reset `scrollTop = 0` in `useEffect` on `activeTab` change

- [x] Task 2: Fix misleading cache usage bar
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx -->
  - [ ] Remove the fake `cacheUsagePct` calculation (`cacheTTLDays / 30 * 100`)
  - [ ] Remove the "Cache capacity" progress bar UI
  - [ ] Keep the 3-column stats grid (TTL, Max Size, Batch Chars) as-is

- [x] Task 3: Add delete confirmation for Dictionary entries
  <!-- files: entrypoints/options/sections/DictionarySection.tsx -->
  - [ ] Add `pendingDeleteId` state
  - [ ] Show `Modal` (danger variant) on delete click with entry name
  - [ ] Only call `handleDelete` on modal confirm

- [x] Task 4: Add selector fields to SiteRules edit form
  <!-- files: entrypoints/options/sections/SiteRulesSection.tsx -->
  - [ ] Add `includeSelectors` textarea to `RuleEditForm`
  - [ ] Add `excludeSelectors` textarea to `RuleEditForm`
  - [ ] Parse comma-separated values into arrays on save
  - [ ] Display selector count badge on rule list items

- [x] Task 5: Fix icon duplication in GeneralSection
  <!-- files: entrypoints/options/sections/GeneralSection.tsx -->
  - [ ] Change section header icon from `Monitor` to `SlidersHorizontal`
  - [ ] Keep Display card icon as `Monitor` (contextually correct)

## Phase 2: Section Restructuring
<!-- execution: parallel -->
<!-- depends: phase1 -->

- [x] Task 1: Merge AdvancedSection cards (5 → 3)
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx -->
  - [ ] Merge "Translation Cache" stats + "Cache Configuration" inputs into single "Cache Management" card
  - [ ] Merge "Settings Data" (export/import) + "Developer" (debug toggle) into single "Data & Developer Tools" card
  - [ ] Keep "Reset All Settings" as standalone danger button at bottom
  - [ ] Remove redundant stagger delay indices, reindex remaining

- [x] Task 2: Add visual sub-groups to SubtitlesSection controls
  <!-- files: entrypoints/options/sections/SubtitlesSection.tsx -->
  - [ ] Split controls card into two sub-sections with subtle divider
  - [ ] Group "Appearance": position, font family, font size, background opacity
  - [ ] Group "Behavior": display mode, translation timeout
  - [ ] Add sub-group labels (small `text-[10px] uppercase tracking-widest text-zinc-600` headers)
  - [ ] Keep Enable toggle at top, outside sub-groups

- [x] Task 3: Cap stagger animation delay for large lists
  <!-- files: entrypoints/options/sections/DictionarySection.tsx, entrypoints/options/sections/SiteRulesSection.tsx -->
  - [ ] Cap `--stagger-delay` to `Math.min(idx, 5)` in Dictionary table rows
  - [ ] Cap `--stagger-delay` to `Math.min(idx, 5)` in SiteRules list items

## Phase 3: Visual Polish & Aesthetics
<!-- execution: parallel -->
<!-- depends: -->

- [x] Task 1: Assign distinct accent colors to section header icons
  <!-- files: entrypoints/options/sections/GeneralSection.tsx, entrypoints/options/sections/ProviderSection.tsx, entrypoints/options/sections/ThemesSection.tsx, entrypoints/options/sections/DictionarySection.tsx, entrypoints/options/sections/SubtitlesSection.tsx, entrypoints/options/sections/ShortcutsSection.tsx, entrypoints/options/sections/AdvancedSection.tsx, entrypoints/options/sections/SiteRulesSection.tsx -->
  - [ ] Define color map: General=blue, Provider=amber, Themes=pink, Dictionary=emerald, Site Rules=teal, Subtitles=cyan, Shortcuts=orange, Advanced=zinc
  - [ ] Update icon container `bg-*` and `border-*` classes per section
  - [ ] Update icon `text-*` color class per section

- [x] Task 2: Integrate live ThemePreview into Themes gallery
  <!-- files: entrypoints/options/sections/ThemesSection.tsx -->
  - [x] Import and render `ThemePreview` component at top of section (below header)
  - [x] Wrap in stagger animation container
  - [x] Ensure theme preview updates reactively when a theme card is clicked

- [x] Task 3: Improve Provider preset card readability
  <!-- files: entrypoints/options/sections/ProviderSection.tsx -->
  - [x] Increase base URL text size from `text-[10px]` to `text-xs`
  - [x] Add padding and breathing room to preset cards

- [x] Task 4: Fix ThemePreview sample text and version badge
  <!-- files: entrypoints/options/ThemePreview.tsx, entrypoints/options/App.tsx -->
  - [x] Update ThemePreview sample text to use Vietnamese translation (consistent with Themes gallery)
  - [x] Update sidebar version badge from `v0.1.0` to `v1.0.0`

## Phase 4: Micro-interactions & Animation Refinements
<!-- execution: parallel -->
<!-- depends: phase2 -->

- [x] Task 1: Add hover effects to interactive Cards
  <!-- files: ui/Card.tsx -->
  - [ ] Add `hover:-translate-y-[1px]` and `hover:shadow-lg` transition to Card `bordered` variant
  - [ ] Ensure transition is smooth (`transition-all duration-200`)
  - [ ] Respect `prefers-reduced-motion` via existing CSS media query

- [x] Task 2: Smooth SubtitlesSection enabled/disabled transition
  <!-- files: entrypoints/options/sections/SubtitlesSection.tsx -->
  - [ ] Replace instant `opacity-50` class swap with CSS transition
  - [ ] Add `pointer-events-none` and slight desaturation (`grayscale`) when disabled
  - [ ] Ensure preview card also transitions smoothly

- [x] Task 3: Add kbd hover animation to ShortcutsSection
  <!-- files: entrypoints/options/sections/ShortcutsSection.tsx, entrypoints/options/style.css -->
  - [ ] Add `hover:-translate-y-[2px]` + `hover:shadow-md` to `<kbd>` elements
  - [ ] Add subtle `transition-transform duration-150` for tactile feel
  - [ ] Optional: add `active:translate-y-[1px]` for press effect

## Phase 5: Verification & Cleanup
<!-- execution: sequential -->
<!-- depends: phase1, phase2, phase3, phase4 -->

- [x] Task 1: Run build and test suite
  - [x] Run `npm run build` — verify successful build (576.75 KB)
  - [x] Run existing test suite — 526 tests pass across 42 files
  - [x] Verify bundle size stays under 600KB ✅
  - [x] All animations use `motion-reduce:` prefix for reduced motion compliance
