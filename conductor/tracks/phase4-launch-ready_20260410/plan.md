# Plan: Phase 4 — Launch-Ready Advanced Features

## Phase 1: Interaction Features
<!-- execution: parallel -->
<!-- depends: -->

- [ ] Task 1.1: Implement Text Selection Translate Popup
  <!-- files: content/textSelection.ts, styles/tooltip.css -->
  - [ ] Create `content/textSelection.ts` — mouseup listener, selection detection (≥2 chars)
  - [ ] Build floating translate button component (positioned near selection boundary)
  - [ ] Build floating tooltip component (translation result, copy button, close button)
  - [ ] Integrate with background worker translation pipeline
  - [ ] Add tooltip dismissal (Escape key, click outside, new selection)
  - [ ] Add tooltip CSS in `styles/tooltip.css`
  - [ ] Wire toggle via settings store (`textSelectionEnabled`)

- [ ] Task 1.2: Implement Mouse Hover Translate
  <!-- files: content/hoverTranslate.ts -->
  - [ ] Create `content/hoverTranslate.ts` — mouseover/mouseout listeners with configurable debounce
  - [ ] Detect paragraph-level elements (p, div, h1-h6, li, td)
  - [ ] Skip elements with `data-lingua-role` attributes (already translated)
  - [ ] Integrate with existing `translationDisplay.ts` for inline injection using active theme
  - [ ] Wire toggle via settings store (`hoverTranslateEnabled`)
  - [ ] Add configurable hover delay (200-500ms, default 300ms) to settings

- [ ] Task 1.3: Write Unit Tests for Interaction Features
  <!-- files: content/__tests__/textSelection.test.ts, content/__tests__/hoverTranslate.test.ts -->
  <!-- depends: task1, task2 -->
  - [ ] Tests for `textSelection.ts` — selection detection, button positioning, tooltip lifecycle
  - [ ] Tests for `hoverTranslate.ts` — hover detection, debounce, skip logic, cleanup

- [ ] Task: Phase 1 Verification
  <!-- depends: task3 -->
  - [ ] Run full test suite: `pnpm test`
  - [ ] Run lint: `pnpm lint`
  - [ ] Manual verification of text selection and hover features
  - [ ] Update track learnings

## Phase 2: Keyboard & Context Menu
<!-- execution: sequential -->
<!-- depends: -->

- [ ] Task 2.1: Implement Keyboard Shortcuts (Hybrid)
  - [ ] Define 4 global shortcuts in `wxt.config.ts` commands (Alt+A, Alt+S, Alt+Z, Alt+X)
  - [ ] Handle `chrome.commands.onCommand` in background worker
  - [ ] Create `content/keyboardShortcuts.ts` — keydown listener for page-specific shortcuts
  - [ ] Implement Alt+H (toggle hover), Alt+D (toggle selection), Escape (dismiss tooltip)
  - [ ] Read shortcut config from settings store for customizable bindings
  - [ ] Display active shortcuts in popup UI footer

- [ ] Task 2.2: Implement Context Menu Integration
  - [ ] Register context menus in background worker on `runtime.onInstalled`
  - [ ] Add menu items: "Translate This Page", "Translate Selection", "Translate Subtitles"
  - [ ] Handle `chrome.contextMenus.onClicked` — route to appropriate translation action
  - [ ] Conditionally show "Translate Subtitles" on video platform pages

- [ ] Task 2.3: Write Unit Tests for Keyboard & Context Menu
  - [ ] Tests for `keyboardShortcuts.ts` — key event handling, toggle states
  - [ ] Tests for context menu registration and click handlers

- [ ] Task: Phase 2 Verification
  - [ ] Run full test suite: `pnpm test`
  - [ ] Run lint: `pnpm lint`
  - [ ] Manual verification of all shortcuts and context menus
  - [ ] Update track learnings

## Phase 3: Performance & Testing
<!-- execution: sequential -->
<!-- depends: phase1, phase2 -->

- [ ] Task 3.1: Performance Optimization
  - [ ] Wrap mutation watcher processing in `requestIdleCallback`
  - [ ] Batch DOM writes in `requestAnimationFrame` for translation injection
  - [ ] Debounce viewport observer callbacks (100ms)
  - [ ] Lazy-load Options page tab content (`React.lazy` + `Suspense`)
  - [ ] Audit bundle size — tree-shake unused imports, target <500KB
  - [ ] Memory profiling: verify idle overhead <5MB

- [ ] Task 3.2: Expand Unit Test Coverage
  - [ ] Audit current coverage gaps across Phase 1-3 modules
  - [ ] Write missing tests to reach ≥80% on core modules
  - [ ] Target: 350+ total tests across 30+ files
  - [ ] Verify all tests pass: `pnpm test`

- [ ] Task: Phase 3 Verification
  - [ ] Run full test suite: `pnpm test`
  - [ ] Run lint: `pnpm lint`
  - [ ] Performance benchmarks: <1.5s first translation visible, <5MB idle memory
  - [ ] Update track learnings

## Phase 4: Launch Packaging
<!-- execution: parallel -->
<!-- depends: phase3 -->

- [ ] Task 4.1: Chrome Web Store Packaging
  <!-- files: public/icons/*, store-assets/* -->
  - [ ] Create extension icons (16, 48, 128px variants)
  - [ ] Prepare store listing screenshots (popup, options, page translation, subtitles)
  - [ ] Write store description (short + detailed)
  - [ ] Write privacy policy (no data collection, BYOK model)
  - [ ] Verify `npm run zip` produces valid distributable
  - [ ] Audit manifest permissions — remove unused, justify each

- [ ] Task 4.2: Project Documentation
  <!-- files: README.md, CONTRIBUTING.md, docs/* -->
  - [ ] Write README.md — overview, features, installation, usage, configuration
  - [ ] Write CONTRIBUTING.md — dev setup, architecture overview, testing guide
  - [ ] Create user guide — provider setup, keyboard shortcuts, theme customization
  - [ ] Add inline code comments for complex modules

- [ ] Task: Phase 4 Verification
  <!-- depends: task1, task2 -->
  - [ ] Run full test suite: `pnpm test`
  - [ ] Run lint: `pnpm lint`
  - [ ] Verify .zip installs correctly on fresh Chrome profile
  - [ ] Review documentation completeness
  - [ ] Final track learnings capture
