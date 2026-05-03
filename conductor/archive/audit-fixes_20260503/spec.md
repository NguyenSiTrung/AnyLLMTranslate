# Spec: Codebase Audit Fixes — Hardening

## Overview

Address 13 issues discovered during a comprehensive codebase audit. These span bugs causing runtime crashes, memory leaks, silent failures, and type safety gaps. All fixes are localized and do not introduce new features or architectural changes.

## Functional Requirements

### Phase 1 — CRITICAL (Crashes and Broken Paths)

**FR-1: Fix `settings` variable scope in `activateOverlayMode`**
- In `content/subtitleCoordinator.ts`, the `settings` variable is declared inside a `try` block but referenced outside it at line 234, causing `ReferenceError: settings is not defined`.
- The overlay fallback mode currently crashes in production.
- Fix: Hoist `const settings = await loadSettings()` before the try block.

**FR-2: Fix wrong message format in `fetchViaBackground`**
- In `content/subtitleCoordinator.ts`, `fetchViaBackground` sends `{ type: 'FETCH_SUBTITLE', url }` but the background handler at `services/background.ts:handleFetchSubtitle` matches on `message.action`, not `message.type`.
- The subtitle CORS bypass path is silently broken.
- Fix: Change `type` to `action` in the sent message.

**FR-3: Remove force-clear-cache on startup**
- In `services/background.ts:scheduleEviction`, a temporary debug line force-clears the entire translation cache on every service worker restart.
- All cached translations are lost on every MV3 SW restart.
- Fix: Remove the `import('@/services/cacheManager').then(m => m.clearCache())` call.

### Phase 2 — HIGH (Runtime Degradation)

**FR-4: Prune `processedEventIds` Map in inline translate**
- In `content/inlineTranslate.ts`, the dedup Map grows unboundedly on every keydown event, never pruned.
- Memory leak over long browsing sessions.
- Fix: Add periodic pruning — delete entries older than the dedup window.

**FR-5: Fix encrypted API key briefly flashed in Zustand UI**
- In `stores/settingsStore.ts:initStorageSync`, the synchronous `setState` sets the store state with the still-encrypted API key, before the async `loadFromStorage()` decrypts it.
- Brief flash of encrypted key in UI on cross-context settings changes.
- Fix: Await `loadFromStorage()` before setting state, or strip provider.apiKey from synchronous merge.

**FR-6: Add retry logic for translation failures**
- Failed LLM calls bubble up as errors with no retry mechanism.
- Network blips cause permanent translation gaps.
- Fix: Add 1–2 retries with exponential backoff (500ms, 1s) for transient fetch failures (network errors, 5xx). Do NOT retry on 4xx.

### Phase 3 — MEDIUM + LOW (Robustness & Cleanup)

**FR-7: `parseTranslationResponse` should warn on missing IDs**
- In `services/base.ts`, silently returns partial Map when expected IDs are missing.
- Fix: Log a warning with missing IDs.

**FR-8: Clear `hoverCache` on SPA navigation**
- In `content/hoverTranslate.ts`, the in-memory `hoverCache` Map persists across SPA page changes.
- Fix: Listen for navigation events or provide a `clearHoverCache` call from coordinator.

**FR-9: Add `response_format: { type: 'json_object' }` to `testConnection`**
- In `services/openaiCompatible.ts:testConnection`, sends raw text without structured output request.
- Fix: Add `response_format: { type: 'json_object' }`.

**FR-10: Fix 4 TypeScript errors**
- `entrypoints/popup/App.tsx:31` — missing `custom` key in theme labels map
- `lib/__tests__/siteRules.test.ts:8` — duplicate `hostname` key in object literal
- `services/statsCollector.ts:12` — type mismatch in chainUpdate generic
- `content/subtitleCoordinator.ts:234` — already covered by FR-1

**FR-11: Replace FNV-1a fallback hash with SHA-256**
- In `services/cacheManager.ts`, the fallback 32-bit FNV hash has collision risk.
- Fix: Remove the fallback entirely — SubtleCrypto is available in all MV3 contexts.

**FR-12: Add `http:` to CSP `connect-src` for local providers**
- In `wxt.config.ts`, the CSP restricts to `https:` only, blocking local HTTP providers like Ollama.
- Fix: Add `http:` to `connect-src` or document the limitation.

**FR-13: Replace `innerHTML` SVG patterns with `createElementNS`**
- In `content/textSelection.ts`, button icons use `innerHTML`.
- Fix: Replace with `document.createElementNS` for SVG construction.

## Non-Functional Requirements

- **No regression**: All 694 passing tests must continue to pass.
- **10 currently-failing tests must pass** after FR-1 fix.
- **Zero new lint errors**.
- **Build must succeed** (`wxt build`).
- **Bundle size must not increase** beyond ~690KB.

## Acceptance Criteria

- [ ] All 13 issues resolved per their specific fix description
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] `npx vitest run` passes with 704+ tests (694 existing + 10 currently failing)
- [ ] `pnpm lint` passes with 0 errors
- [ ] `pnpm build` succeeds

## Out of Scope

- Adding new features
- Refactoring architecture
- Updating documentation/README
- Adding test coverage for uncovered paths (though tests may be added for new retry logic)
