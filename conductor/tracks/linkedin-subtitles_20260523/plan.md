# Implementation Plan: LinkedIn Learning Subtitle Support

## Phase 1: Handler Implementation & Whitelisting (TDD)
<!-- execution: parallel -->

- [x] Task 1: Create unit test file for LinkedIn handler
  <!-- files: tests/unit/linkedinHandler.test.ts -->
  - [x] Sub-task 1.1: Create `tests/unit/linkedinHandler.test.ts`
  - [x] Sub-task 1.2: Define test cases for URL pattern matching and subtitle VTT response transformation

- [x] Task 2: Implement LinkedIn Subtitle Handler
  <!-- files: inject/subtitleHandlers/linkedin.ts -->
  - [x] Sub-task 2.1: Create `inject/subtitleHandlers/linkedin.ts` implementing `SubtitleHandler`
  - [x] Sub-task 2.2: Implement WebVTT parsing and response mapping to `SubtitleCue[]`

- [x] Task 3: Whitelist LinkedIn CDN Domains
  <!-- files: services/background.ts -->
  - [x] Sub-task 3.1: Add `linkedin.com` and `licdn.com` (and subdomains) to `SUBTITLE_ALLOWLIST` in `services/background.ts`

- [x] Task 4: Register Handler in Content Scripts
  <!-- files: entrypoints/content.ts, entrypoints/inject.content/index.ts -->
  <!-- depends: Task 2 -->
  - [x] Sub-task 4.1: Import and instantiate `LinkedInHandler` in `entrypoints/content.ts` and `entrypoints/inject.content/index.ts`

- [x] Task 5: Conductor - User Manual Verification 'Handler Implementation & Whitelisting'
  <!-- depends: Task 1, Task 2, Task 3, Task 4 -->

## Phase 2: Coordinator & Watch Page Integration
<!-- execution: sequential -->
<!-- depends: Phase 1 -->

- [x] Task 1: Update Watch Page Detection
  - [x] Sub-task 1.1: Update `isOnWatchPage()` in `content/subtitleCoordinator.ts` to support `linkedin.com/learning/*` paths

- [x] Task 2: Run Verification Checks
  - [x] Sub-task 2.1: Execute Vitest unit tests to verify parsing, whitelisting, and watch-page detection
  - [x] Sub-task 2.2: Perform a trial build (`wxt build`) to ensure bundle compiles without errors

- [x] Task 3: Conductor - User Manual Verification 'Coordinator & Watch Page Integration'
