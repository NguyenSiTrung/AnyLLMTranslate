# Plan: Settings UI/UX Polish & Bug Fixes

## Phase 1: Critical Bug Fixes
<!-- execution: parallel -->
<!-- depends: -->

- [ ] Task 1: Fix scroll position leak on tab switch
  <!-- files: entrypoints/options/App.tsx -->
  - [ ] Add `useRef` for `.settings-content` scroll container
  - [ ] Reset `scrollTop = 0` in `useEffect` on `activeTab` change

- [ ] Task 2: Fix misleading cache usage bar
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx -->
  - [ ] Remove the fake `cacheUsagePct` calculation (`cacheTTLDays / 30 * 100`)
  - [ ] Remove the "Cache capacity" progress bar UI
  - [ ] Keep the 3-column stats grid (TTL, Max Size, Batch Chars) as-is

- [ ] Task 3: Add delete confirmation for Dictionary entries
  <!-- files: entrypoints/options/sections/DictionarySection.tsx -->
  - [ ] Add `pendingDeleteId` state
  - [ ] Show `Modal` (danger variant) on delete click with entry name
  - [ ] Only call `handleDelete` on modal confirm

- [ ] Task 4: Add selector fields to SiteRules edit form
  <!-- files: entrypoints/options/sections/SiteRulesSection.tsx -->
  - [ ] Add `includeSelectors` textarea to `RuleEditForm`
  - [ ] Add `excludeSelectors` textarea to `RuleEditForm`
  - [ ] Parse comma-separated values into arrays on save
  - [ ] Display selector count badge on rule list items

- [ ] Task 5: Fix icon duplication in GeneralSection
  <!-- files: entrypoints/options/sections/GeneralSection.tsx -->
  - [ ] Change section header icon from `Monitor` to `SlidersHorizontal`
  - [ ] Keep Display card icon as `Monitor` (contextually correct)

## Phase 2: Section Restructuring
<!-- execution: parallel -->
<!-- depends: phase1 -->

- [ ] Task 1: Merge AdvancedSection cards (5 → 3)
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx -->
  - [ ] Merge "Translation Cache" stats + "Cache Configuration" inputs into single "Cache Management" card
  - [ ] Merge "Settings Data" (export/import) + "Developer" (debug toggle) into single "Data & Developer Tools" card
  - [ ] Keep "Reset All Settings" as standalone danger button at bottom
  - [ ] Remove redundant stagger delay indices, reindex remaining

- [ ] Task 2: Add visual sub-groups to SubtitlesSection controls
  <!-- files: entrypoints/options/sections/SubtitlesSection.tsx -->
  - [ ] Split controls card into two sub-sections with subtle divider
  - [ ] Group "Appearance": position, font family, font size, background opacity
  - [ ] Group "Behavior": display mode, translation timeout
  - [ ] Add sub-group labels (small `text-[10px] uppercase tracking-widest text-zinc-600` headers)
  - [ ] Keep Enable toggle at top, outside sub-groups

- [ ] Task 3: Cap stagger animation delay for large lists
  <!-- files: entrypoints/options/sections/DictionarySection.tsx, entrypoints/options/sections/SiteRulesSection.tsx -->
  - [ ] Cap `--stagger-delay` to `Math.min(idx, 5)` in Dictionary table rows
  - [ ] Cap `--stagger-delay` to `Math.min(idx, 5)` in SiteRules list items

## Phase 3: Visual Polish & Aesthetics
<!-- execution: parallel -->
<!-- depends: -->

- [ ] Task 1: Assign distinct accent colors to section header icons
  <!-- files: entrypoints/options/sections/GeneralSection.tsx, entrypoints/options/sections/ProviderSection.tsx, entrypoints/options/sections/ThemesSection.tsx, entrypoints/options/sections/DictionarySection.tsx, entrypoints/options/sections/SubtitlesSection.tsx, entrypoints/options/sections/ShortcutsSection.tsx, entrypoints/options/sections/AdvancedSection.tsx, entrypoints/options/sections/SiteRulesSection.tsx -->
  - [ ] Define color map: General=blue, Provider=amber, Themes=pink, Dictionary=emerald, Site Rules=teal, Subtitles=cyan, Shortcuts=orange, Advanced=zinc
  - [ ] Update icon container `bg-*` and `border-*` classes per section
  - [ ] Update icon `text-*` color class per section

- [ ] Task 2: Integrate live ThemePreview into Themes gallery
  <!-- files: entrypoints/options/sections/ThemesSection.tsx -->
  - [ ] Import and render `ThemePreview` component at top of section (below header)
  - [ ] Wrap in stagger animation container
  - [ ] Ensure theme preview updates reactively when a theme card is clicked

- [ ] Task 3: Improve Provider preset card readability
  <!-- files: entrypoints/options/sections/ProviderSection.tsx -->
  - [ ] Increase base URL text size from `text-[10px]` to `text-xs`
  - [ ] Add padding and breathing room to preset cards
  - [ ] Consider adding a subtle provider icon or emoji indicator

- [ ] Task 4: Fix ThemePreview sample text and version badge
  <!-- files: entrypoints/options/ThemePreview.tsx, entrypoints/options/App.tsx -->
  - [ ] Update ThemePreview sample text to use Vietnamese translation (consistent with Themes gallery)
  - [ ] Update sidebar version badge from `v0.1.0` to `v1.0.0`

## Phase 4: Micro-interactions & Animation Refinements
<!-- execution: parallel -->
<!-- depends: phase2 -->

- [ ] Task 1: Add hover effects to interactive Cards
  <!-- files: ui/Card.tsx -->
  - [ ] Add `hover:-translate-y-[1px]` and `hover:shadow-lg` transition to Card `bordered` variant
  - [ ] Ensure transition is smooth (`transition-all duration-200`)
  - [ ] Respect `prefers-reduced-motion` via existing CSS media query

- [ ] Task 2: Smooth SubtitlesSection enabled/disabled transition
  <!-- files: entrypoints/options/sections/SubtitlesSection.tsx -->
  - [ ] Replace instant `opacity-50` class swap with CSS transition
  - [ ] Add `pointer-events-none` and slight desaturation (`grayscale`) when disabled
  - [ ] Ensure preview card also transitions smoothly

- [ ] Task 3: Add kbd hover animation to ShortcutsSection
  <!-- files: entrypoints/options/sections/ShortcutsSection.tsx, entrypoints/options/style.css -->
  - [ ] Add `hover:-translate-y-[2px]` + `hover:shadow-md` to `<kbd>` elements
  - [ ] Add subtle `transition-transform duration-150` for tactile feel
  - [ ] Optional: add `active:translate-y-[1px]` for press effect

## Phase 5: Verification & Cleanup
<!-- execution: sequential -->
<!-- depends: phase1, phase2, phase3, phase4 -->

- [ ] Task 1: Run build and test suite
  - [ ] Run `npm run build` — verify successful build
  - [ ] Run existing test suite — verify 524+ tests pass
  - [ ] Verify bundle size stays under 600KB
  - [ ] Spot-check `prefers-reduced-motion` compliance
