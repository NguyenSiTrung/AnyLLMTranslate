# Spec: Phase 4 — Launch-Ready Advanced Features

## Overview

Phase 4 completes the LinguaLens Chrome extension by adding signature interaction features (text selection translate, mouse hover translate, keyboard shortcuts, context menus), performing performance optimization, writing comprehensive tests, preparing Chrome Web Store packaging, and creating project documentation. This phase transitions the extension from a functional dev build to a polished, published v1.0.

## Functional Requirements

### FR1: Text Selection Translate Popup
- On `mouseup`, detect text selection (≥2 characters)
- Show a floating translate button near the selection (positioned above/below the cursor)
- On button click: translate the selected text via the existing background worker pipeline
- Display translation in a floating tooltip/bubble near the selection
- Tooltip includes: translated text, copy button, close button
- Tooltip dismisses on Escape key, clicking outside, or new selection
- Respects current provider and target language settings from Zustand store

### FR2: Mouse Hover Translate
- When enabled, hovering over a paragraph-level element (p, div, h1-h6, li, td) for 300ms triggers translation
- Translation is injected inline below the hovered paragraph using the existing `translationDisplay.ts` and theme system
- Hover translations are cached and not re-translated on subsequent hovers
- Toggle via keyboard shortcut or popup UI
- `mouseout` cancels pending hover timer
- Does not trigger on elements already translated or with `data-lingua-role` attributes

### FR3: Keyboard Shortcuts (Hybrid)
- **chrome.commands (4 global shortcuts):**
  - Alt+A — Translate current page
  - Alt+S — Translate video subtitles
  - Alt+Z — Toggle translation display (show/hide)
  - Alt+X — Restore original page (remove all translations)
- **Content script keydown listeners (6+ page-specific):**
  - Alt+H — Toggle hover translate on/off
  - Alt+D — Toggle text selection translate on/off
  - Escape — Dismiss floating tooltip
  - Additional shortcuts configurable via Options page Shortcuts tab
- Shortcuts displayed in popup UI footer

### FR4: Context Menu Integration
- Register context menus via `chrome.contextMenus` in background worker
- Menu items:
  - "Translate This Page" (on page right-click)
  - "Translate Selection" (on text selection right-click)
  - "Translate Subtitles" (on video platform pages)
- Handle `chrome.contextMenus.onClicked` to trigger appropriate translation action
- Icons and labels per action

### FR5: Performance Optimization
- `requestIdleCallback` for non-critical DOM updates (mutation watcher processing)
- Batch DOM writes in single `requestAnimationFrame` for translation injection
- Debounce viewport observer callbacks
- Lazy-load Options page tab content (code-split React components)
- Audit and optimize bundle size (target <500KB total)
- Memory profiling: ensure idle overhead <5MB

### FR6: Unit Tests Completion
- Write tests for all new Phase 4 modules (text selection, hover, shortcuts, context menu)
- Expand coverage for existing modules to ≥80%
- Target: 350+ total tests across 30+ files
- AAA pattern (Arrange-Act-Assert) per workflow conventions

### FR7: Chrome Web Store Packaging
- Extension icons: 16, 48, 128px variants
- Store listing screenshots (popup, options, page translation, subtitle translation)
- Store description (short + detailed)
- Privacy policy (no data collection, BYOK model)
- `npm run zip` produces distributable package
- Verify manifest permissions are minimal and justified

### FR8: Documentation
- README.md: Project overview, features, installation, usage, configuration
- CONTRIBUTING.md: Development setup, architecture overview, testing guide
- User guide: How to configure providers, use keyboard shortcuts, customize themes

## Non-Functional Requirements

- Translation tooltip appears within 100ms of button click (excluding API latency)
- Hover translate delay: configurable 200-500ms (default 300ms)
- No layout shift from tooltip or hover translation injection
- All keyboard shortcuts configurable via Options page
- Context menus load on extension install, not on every page load
- Extension bundle size remains <500KB
- Idle memory usage <5MB

## Acceptance Criteria

1. ✅ Text selection on any webpage shows floating translate button; clicking it shows translation tooltip
2. ✅ Hovering over a paragraph for 300ms injects inline translation below it (when enabled)
3. ✅ Alt+A translates the current page from any state
4. ✅ Right-clicking selected text shows "Translate Selection" context menu
5. ✅ Performance: visible content translates within 1.5s, no layout thrashing
6. ✅ 350+ unit tests passing with ≥80% coverage on core modules
7. ✅ Extension produces valid .zip for Chrome Web Store submission
8. ✅ README.md enables a new developer to set up and contribute within 15 minutes
9. ✅ All existing Phase 1-3 features remain working (regression-free)

## Out of Scope

- Side panel reading view (deferred to v1.1)
- Netflix subtitle handler (deferred — DRM complexity)
- Input box translation (deferred to v1.1)
- 50+ built-in site rules expansion (framework exists, grow post-launch)
- E2E Playwright tests (separate quality track)
- Firefox/Safari support
- i18n of extension UI itself
