# Track Learnings: linkedin-subtitles_20260523

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

- WXT MAIN world injection uses `world: 'MAIN'` and `run_at: 'document_start'` in wxt.config.ts for XHR/fetch access.
- postMessage bridge uses channel identifier ('anyllm-translate') with origin validation and requestId correlation for MAIN ↔ ISOLATED world communication.
- Fetch interceptor must call `response.clone()` before `.text()` — Response body can only be read once.
- XHR responseText override via `Object.defineProperty` needs `configurable: true` for reassignment.
- DOMParser (browser API) for XML parsing (YouTube srv3 format) — no external parser needed.
- ResizeObserver for responsive video overlay positioning — handles video resize events.
- Fullscreen transitions need setTimeout (~100ms) for repositioning after DOM settles.
- Maximum z-index (2147483647) for overlay visibility over video players.
- BOM marker (\uFEFF) handling in subtitle formats — strip before parsing.
- Format detection heuristics: WEBVTT header, sequence number pattern, comma vs period in timing.
- CORS bypass for subtitle fetching: direct fetch first, fallback to chrome.runtime.sendMessage via background worker.
- Strict platform detection for subtitle auto-activate: Generic `querySelectorAll('video')` is unreliable on listing/search pages with autoplay thumbnails — only known platforms should auto-activate.

---

<!-- Learnings from implementation will be appended below -->

## [2026-05-23 20:17] - Phase 1 Task 1: Create unit test file for LinkedIn handler
- **Implemented:** Created the unit test suite for LinkedInSubtitleHandler under tests/unit/linkedinHandler.test.ts.
- **Files changed:** tests/unit/linkedinHandler.test.ts
- **Commit:** 07d1d18
- **Learnings:**
  - Patterns: Practiced Test-Driven Development (TDD) by writing tests before implementing the module itself, verifying failure on import resolution first.

## [2026-05-23 20:18] - Phase 1 Task 2: Implement LinkedIn Subtitle Handler
- **Implemented:** Implemented the `LinkedInHandler` class in `inject/subtitleHandlers/linkedin.ts`.
- **Files changed:** inject/subtitleHandlers/linkedin.ts
- **Commit:** d2e1bbf
- **Learnings:**
  - Patterns: Implemented a robust language extractor that handles path segments, filename suffixes, and query parameters to detect language codes from LinkedIn CDN/VTT URLs.

## [2026-05-23 20:19] - Phase 1 Task 3: Whitelist LinkedIn CDN Domains
- **Implemented:** Added `linkedin.com` and `licdn.com` (and their subdomains) to `SUBTITLE_ALLOWLIST` in `services/background.ts`.
- **Files changed:** services/background.ts
- **Commit:** 913a257
- **Learnings:**
  - Patterns: Background service worker's `SUBTITLE_ALLOWLIST` must include CDN domains of host sites to permit CORS-bypass subtitle downloads when intercepted via the MAIN world scripts.

## [2026-05-23 20:20] - Phase 1 Task 4: Register Handler in Content Scripts
- **Implemented:** Registered `LinkedInHandler` in the registries of `entrypoints/content.ts` (isolated world) and `entrypoints/inject.content/index.ts` (MAIN world).
- **Files changed:** entrypoints/content.ts, entrypoints/inject.content/index.ts
- **Commit:** 9f03c9b
- **Learnings:**
  - Patterns: Subtitle handlers must be registered in both the isolated world script (to handle coordination/ui) and the MAIN world script (to intercept XMLHttpRequests/fetches correctly).

## [2026-05-23 20:21] - Phase 1 Task 5: Conductor - User Manual Verification 'Handler Implementation & Whitelisting'
- **Implemented:** Verified that WXT successfully builds the chrome-mv3 target and compiles without any errors after the additions.
- **Files changed:** None
- **Commit:** N/A
- **Learnings:**
  - Patterns: Running a full build before completing a phase is a critical sanity check to verify TypeScript compiler errors, import resolution, and packaging constraints are fully met.

## [2026-05-23 20:30] - Phase 2 Task 1: Update Watch Page Detection
- **Implemented:** Updated `isOnWatchPage()` in `content/subtitleCoordinator.ts` to strictly match paths starting with `/learning/` on `linkedin.com` to prevent false triggers on social feeds. Added integration tests to check the play-trigger and mutation-based auto-activation of subtitle coordinator.
- **Files changed:** content/subtitleCoordinator.ts, tests/unit/subtitleCoordinator.test.ts
- **Commit:** 0c9bd58
- **Learnings:**
  - Patterns: DOM-dependent tests using MutationObserver or event listeners in Vitest/jsdom require an asynchronous event loop tick (e.g., `await Promise.resolve()`) to allow handlers to be registered on elements before asserting event results.
  - Storage mocks in tests need settings nested under the correct key (`anyllm-translate-settings` rather than direct keys) to avoid fallback default values.

## [2026-05-23 20:31] - Phase 2 Task 2: Run Verification Checks
- **Implemented:** Fixed ESLint issues related to inline `import()` types in service worker files and unused imports in subtitleCoordinator test. Validated compilation, executed unit tests, and completed a production build successfully.
- **Files changed:** services/background.ts, tests/unit/subtitleCoordinator.test.ts
- **Commit:** N/A (will commit now)
- **Learnings:**
  - Patterns: Prefer explicit top-level type imports over inline `import(...)` type annotations to avoid TypeScript/ESLint warnings about forbidden inline imports.

## [2026-05-23 20:32] - Phase 2 Task 3: Conductor - User Manual Verification 'Coordinator & Watch Page Integration'
- **Implemented:** Verified the integration by running all 858 tests, type checking the codebase, lint checks, and executing a trial build.
- **Files changed:** None
- **Commit:** N/A
- **Learnings:**
  - Patterns: Automated verification checks (Lint, Compile, Test, Build) offer a solid safety net before finalizing Conductor tracks.
