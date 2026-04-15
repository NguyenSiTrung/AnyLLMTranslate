# Track Learnings: cache-hardening_20260415

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

### Relevant from patterns.md

- **Cache architecture**: Background service worker is stateless per-session; cache is persistent via IndexedDB (`idb-keyval`). Cache key = `SHA-256(sourceLanguage:targetLanguage:text)`. (from: phase1-foundation_20260409)
- **Silent fail pattern**: `cacheTranslation()` and `getCachedTranslation()` use try/catch with silent fail — cache is best-effort, never breaks translation flow. Maintain this contract in all new code.
- **`promise.finally().catch()`**: Needed to suppress unhandled rejections when storing promises in Maps. Keep in mind for any dedup / in-flight tracking additions. (from: phase1-foundation_20260409)
- **Glossary pattern**: Pass `glossaryBlock || undefined` (not empty string) to preserve "no glossary" semantics. (from: glossary-wire_20260410)
- **Module-level state in tests**: `let isEnabled`, `let store` etc. persist across test cases — reset in `beforeEach`. Apply same discipline to `pendingLruUpdates` and `lruFlushTimer` test resets. (from: phase4-launch-ready_20260410)
- **Mock background storage**: `module-level mockStorage` in `background.test.ts` is shared — add cleanup in `beforeEach` to prevent pollution. (from: glossary-wire_20260410)
- **chrome.alarms**: Must be listed in manifest permissions. WXT manifest config is in `wxt.config.ts` under `manifest.permissions[]`. (from: phase4-launch-ready_20260410 — contextMenus pattern)
- **MV3 service worker restart safety**: `chrome.alarms` are registered in the browser and persist across SW restarts. Safe to call `chrome.alarms.create` with same name multiple times — use `chrome.alarms.get` first or handle duplicate gracefully.
- **Inspect LLM request body in tests**: `JSON.parse(fetchMock.mock.calls[0][1]?.body).messages[0].content`. (from: glossary-wire_20260410)

---

<!-- Learnings from implementation will be appended below -->

## [2026-04-16 00:09] - Phase 1: fix(cache): add cache read to handleTranslateSelection

- **Implemented:** Added cache read fast-path to `handleTranslateSelection` before LLM call
- **Files changed:** `services/background.ts`, `services/__tests__/background.translateSelection.test.ts`
- **Commit:** cce9d19
- **Learnings:**
  - Patterns: `vi.mock('@/services/cacheManager', ...)` at module top + `beforeEach` re-import pattern needed because `vi.clearAllMocks()` resets mock implementations — re-acquire via `await import(...)` after clear
  - Gotchas: `getCachedTranslation` returns `null` on miss — guard with `!== null`, not just falsy, to avoid treating cached `""` as a miss
  - Context: guard is `if (cached !== null)` — null means miss, empty string is a valid (if unusual) cached translation

---

## [2026-04-16 00:09] - Phase 2: feat(cache): integrate IndexedDB cache into page translation pipeline

- **Implemented:** Cache split+merge in `handleTranslate` — per-piece cache check, uncached-only LLM call, write-back per fresh result
- **Files changed:** `services/background.ts`, `services/__tests__/background.translate.test.ts`
- **Commit:** 98aa581
- **Learnings:**
  - Patterns: LLM translates by piece `id` (Map key), but cache uses piece `text` as lookup key — must retain the `text` alongside `id` in `uncachedPieces[]` for write-back after LLM response
  - Gotchas: `body.messages[1].content` is the user message (index 1); index 0 is system prompt — use index 1 when asserting LLM input content in tests
  - Context: all-cached early return `if (uncachedPieces.length === 0)` avoids even calling `initService()`, saving a settings load

---

## [2026-04-16 00:09] - Phase 3: feat(cache): schedule daily eviction via chrome.alarms

- **Implemented:** `scheduleEviction()` + `initEvictionSchedule()` exports in `services/background.ts`, wired into `entrypoints/background.ts`; `"alarms"` permission added
- **Files changed:** `services/background.ts`, `entrypoints/background.ts`, `wxt.config.ts`, `services/__tests__/background.eviction.test.ts`
- **Commit:** ef9c448
- **Learnings:**
  - Patterns: Export scheduling logic from `services/background.ts` (not WXT entrypoint) for Vitest testability — WXT's `defineBackground` is not available in jsdom
  - Patterns: `chrome.alarms` persist across MV3 SW restarts — correct choice for periodic background tasks (vs `setInterval`)
  - Gotchas: Call `initEvictionSchedule()` (listener) BEFORE `scheduleEviction()` (alarm creation + startup eviction) to ensure listener is registered before any alarm fires
  - Gotchas: `chrome.alarms.create` with the same name is safe to call on every SW startup — browser deduplicates named alarms

---

## [2026-04-16 00:09] - Phase 4: perf(cache): batch LRU lastAccessedAt writes

- **Implemented:** Module-level `pendingLruUpdates` Map + 500ms debounce timer in `getCachedTranslation`
- **Files changed:** `services/cacheManager.ts`, `services/__tests__/cacheManager.lru.test.ts`
- **Commit:** aad9cc4
- **Learnings:**
  - Patterns: Map-based accumulation = automatic per-key dedup (latest `lastAccessedAt` wins within debounce window)
  - Patterns: Snapshot + clear Map BEFORE async iteration to prevent race: `const batch = new Map(pending); pending.clear();`
  - Gotchas: Module-level timer + Map state persists across Vitest test cases — `vi.useFakeTimers()` in `beforeEach`, `vi.useRealTimers()` in `afterEach`; `vi.clearAllMocks()` does NOT reset module-level variables
  - Gotchas: 3 React UI tests (`tests/ui-primitives.test.tsx`, etc.) fail pre-existing from missing `@testing-library/dom` dep after npm install — not introduced by this track

---
