# Plan: Codebase Audit Fixes — Hardening

## Phase 1: CRITICAL — Crashes and Broken Paths
<!-- execution: parallel -->

- [ ] Task 1.1: Fix settings variable scope in `activateOverlayMode` (FR-1)
  - Hoist `const settings = await loadSettings()` before try block at line ~218
  - Verify 10 currently-failing tests pass
  <!-- files: content/subtitleCoordinator.ts, content/__tests__/subtitleCoordinator.test.ts, tests/unit/subtitleCoordinator.test.ts -->

- [ ] Task 1.2: Fix wrong message format in `fetchViaBackground` (FR-2)
  - Change `{ type: 'FETCH_SUBTITLE' }` → `{ action: 'FETCH_SUBTITLE' }`
  <!-- files: content/subtitleCoordinator.ts -->
  <!-- depends: task1.1 -->

- [ ] Task 1.3: Remove force-clear-cache on startup (FR-3)
  - Delete the `import('@/services/cacheManager').then(m => m.clearCache())` block in `scheduleEviction`
  <!-- files: services/background.ts, services/__tests__/background.test.ts -->

- [ ] Task: Conductor — User Manual Verification 'Phase 1' (Protocol in workflow.md)

## Phase 2: HIGH — Runtime Degradation
<!-- execution: parallel -->
<!-- depends: -->

- [ ] Task 2.1: Prune `processedEventIds` Map in inline translate (FR-4)
  - Add periodic pruning: delete entries older than `DEDUP_WINDOW_MS * 2`
  - Run on each keydown event batch
  <!-- files: content/inlineTranslate.ts, content/__tests__/inlineTranslate.test.ts -->

- [ ] Task 2.2: Fix encrypted API key briefly flashed in Zustand UI (FR-5)
  - In `initStorageSync`, await `loadFromStorage()` before `setState`, or strip provider.apiKey from the synchronous merge
  <!-- files: stores/settingsStore.ts, stores/__tests__/settingsStore.test.ts -->

- [ ] Task 2.3: Add retry logic for translation failures (FR-6)
  - Add `fetchWithRetry` helper in `openaiCompatible.ts`: retry on network errors + 5xx (not 4xx), 2 attempts, 500ms/1s backoff
  - Wire into `fetchCompletion` in `openaiCompatible.ts`
  <!-- files: services/openaiCompatible.ts, services/__tests__/openaiCompatible.test.ts -->

- [ ] Task: Conductor — User Manual Verification 'Phase 2' (Protocol in workflow.md)

## Phase 3: MEDIUM + LOW — Robustness & Cleanup
<!-- execution: parallel -->
<!-- depends: phase1, phase2 -->

- [ ] Task 3.1: `parseTranslationResponse` should warn on missing IDs (FR-7)
  - Log `console.warn` with list of missing expected IDs instead of silently ignoring
  <!-- files: services/base.ts, services/__tests__/base.test.ts -->

- [ ] Task 3.2: Clear `hoverCache` on SPA navigation (FR-8)
  - Export `clearHoverCache` and call from `resetCoordinatorState` or add cleanup hook
  <!-- files: content/hoverTranslate.ts, content/subtitleCoordinator.ts -->

- [ ] Task 3.3: Add `json_object` response_format to `testConnection` (FR-9)
  - Add `response_format: { type: 'json_object' }` to the test completion request
  <!-- files: services/openaiCompatible.ts -->
  <!-- depends: task2.3 -->

- [ ] Task 3.4: Fix 4 TypeScript errors (FR-10)
  - `App.tsx`: add `custom` to theme labels map
  - `siteRules.test.ts`: fix duplicate `hostname` key
  - `statsCollector.ts`: fix chainUpdate generic type
  - `subtitleCoordinator.ts`: resolved by FR-1
  <!-- files: entrypoints/popup/App.tsx, lib/__tests__/siteRules.test.ts, services/statsCollector.ts -->

- [ ] Task 3.5: Replace FNV-1a fallback hash with SHA-256 (FR-11)
  - Remove the fallback branch in `generateCacheKey` — SubtleCrypto is always available in MV3
  <!-- files: services/cacheManager.ts, services/__tests__/cacheManager.test.ts -->

- [ ] Task 3.6: Fix CSP `connect-src` for local providers (FR-12)
  - Change `connect-src 'self' https:` → `connect-src 'self' http: https:`
  <!-- files: wxt.config.ts -->

- [ ] Task 3.7: Replace `innerHTML` SVG patterns with `createElementNS` (FR-13)
  - Replace `btn.innerHTML = '<svg>...'` with `document.createElementNS('http://www.w3.org/2000/svg', 'svg')` construction
  <!-- files: content/textSelection.ts -->

- [ ] Task: Conductor — User Manual Verification 'Phase 3' (Protocol in workflow.md)
