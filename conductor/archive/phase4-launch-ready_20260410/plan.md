# Plan: Phase 4 — Launch-Ready Advanced Features

## Phase 1: Interaction Features
<!-- execution: parallel -->
<!-- depends: -->

- [x] Task 1.1: Implement Text Selection Translate Popup
  <!-- files: content/textSelection.ts, styles/tooltip.css -->
  - [x] Create `content/textSelection.ts` — mouseup listener, selection detection (≥2 chars)
  - [x] Build floating translate button component (positioned near selection boundary)
  - [x] Build floating tooltip component (translation result, copy button, close button)
  - [x] Integrate with background worker translation pipeline
  - [x] Add tooltip dismissal (Escape key, click outside, new selection)
  - [x] Add tooltip CSS in `styles/tooltip.css`
  - [x] Wire toggle via settings store (`textSelectionEnabled`)

- [x] Task 1.2: Implement Mouse Hover Translate
  <!-- files: content/hoverTranslate.ts -->
  - [x] Create `content/hoverTranslate.ts` — mouseover/mouseout listeners with configurable debounce
  - [x] Detect paragraph-level elements (p, div, h1-h6, li, td)
  - [x] Skip elements with `data-lingua-role` attributes (already translated)
  - [x] Integrate with existing `translationDisplay.ts` for inline injection using active theme
  - [x] Wire toggle via settings store (`hoverTranslateEnabled`)
  - [x] Add configurable hover delay (200-500ms, default 300ms) to settings

- [x] Task 1.3: Write Unit Tests for Interaction Features
  <!-- files: content/__tests__/textSelection.test.ts, content/__tests__/hoverTranslate.test.ts -->
  <!-- depends: task1, task2 -->
  - [x] Tests for `textSelection.ts` — selection detection, button positioning, tooltip lifecycle
  - [x] Tests for `hoverTranslate.ts` — hover detection, debounce, skip logic, cleanup

- [x] Task: Phase 1 Verification
  <!-- depends: task3 -->
  - [x] Run full test suite: `pnpm test` — 314 passed
  - [x] Run build: 365KB
  - [x] Manual verification of text selection and hover features
  - [x] Update track learnings

## Phase 2: Keyboard & Context Menu
<!-- execution: sequential -->
<!-- depends: -->

- [x] Task 2.1: Implement Keyboard Shortcuts (Hybrid)
  - [x] Define 4 global shortcuts in `wxt.config.ts` commands (Alt+A, Alt+S, Alt+Z, Alt+X)
  - [x] Handle `chrome.commands.onCommand` in background worker
  - [x] Create `content/keyboardShortcuts.ts` — keydown listener for page-specific shortcuts
  - [x] Implement Alt+H (toggle hover), Alt+D (toggle selection), Escape (dismiss tooltip)
  - [x] Read shortcut config from settings store for customizable bindings
  - [x] Display active shortcuts in popup UI footer

- [x] Task 2.2: Implement Context Menu Integration
  - [x] Register context menus in background worker on `runtime.onInstalled`
  - [x] Add menu items: "Translate This Page", "Translate Selection", "Translate Subtitles"
  - [x] Handle `chrome.contextMenus.onClicked` — route to appropriate translation action
  - [x] Conditionally show "Translate Subtitles" on video platform pages

- [x] Task 2.3: Write Unit Tests for Keyboard & Context Menu
  - [x] Tests for `keyboardShortcuts.ts` — key event handling, toggle states
  - [x] Tests for context menu registration and click handlers

- [x] Task: Phase 2 Verification
  - [x] Run full test suite: `pnpm test` — 327 passed
  - [x] Run build: 368KB
  - [x] Manual verification of all shortcuts and context menus
  - [x] Update track learnings

## Phase 3: Performance & Testing
<!-- execution: sequential -->
<!-- depends: phase1, phase2 -->

- [x] Task 3.1: Performance Optimization
  - [x] Wrap mutation watcher processing in `requestIdleCallback`
  - [x] Create `lib/performance.ts` — DOM write batching via `requestAnimationFrame`
  - [x] Debounce/throttle utilities for viewport and hover callbacks
  - [x] Audit bundle size — 368KB (73% of 500KB target) ✓
  - [x] measureAsync helper for performance profiling

- [x] Task 3.2: Expand Unit Test Coverage
  - [x] Added 56 new tests across Phase 4 modules
  - [x] 339 total tests across 28 test files — all passing
  - [x] Coverage: textSelection (14), hoverTranslate (17), keyboardShortcuts (13), performance (12)

- [x] Task: Phase 3 Verification
  - [x] Run full test suite: `pnpm test` — 339 passed
  - [x] Build: 368KB
  - [x] Update track learnings

## Phase 4: Launch Packaging
<!-- execution: parallel -->
<!-- depends: phase3 -->

- [x] Task 4.1: Chrome Web Store Packaging
  - [x] Extension icons present (16, 32, 48, 96, 128px variants)
  - [x] Version bumped to 1.0.0
  - [x] Verify `pnpm zip` produces valid distributable — 119KB
  - [x] Audit manifest permissions — storage, activeTab, contextMenus, sidePanel
  - [x] Write privacy policy (PRIVACY.md)
  - [x] Manifest includes 4 keyboard commands with suggested keys

- [x] Task 4.2: Project Documentation
  - [x] Write README.md — overview, features, installation, usage, keyboard shortcuts
  - [x] Write CONTRIBUTING.md — dev setup, architecture overview, testing guide
  - [x] Write PRIVACY.md — BYOK model, no data collection, permissions justification
  - [x] Update track learnings with Phase 4 patterns

- [x] Task: Phase 4 Verification
  - [x] Run full test suite: `pnpm test` — 339 passed
  - [x] Run build + zip — 368KB / 119KB zip
  - [x] Review documentation completeness ✓
  - [x] Final track learnings captured
