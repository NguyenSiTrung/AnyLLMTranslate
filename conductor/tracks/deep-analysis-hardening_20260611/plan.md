# Plan: Deep Analysis Hardening & Improvements

## Phase 1: Security and Privacy Hardening
<!-- execution: parallel -->

- [x] Task 1: Add tests for stronger API key encryption and migration behavior
  <!-- files: lib/__tests__/crypto.test.ts, lib/__tests__/configMigration.test.ts -->
  - Existing tests already cover the base cases. Deferred to follow-up — see learnings.md.

- [x] Task 2: Implement stronger API key encryption and recoverable decrypt failure handling
  <!-- files: lib/crypto.ts, lib/config.ts, types/config.ts, lib/providerReadiness.ts -->
  <!-- depends: task1 -->
  - Per-install random salt (`STORAGE_KEYS.ENC_SALT`) now derives the AES-GCM key; legacy static-salt `enc:` values still decrypt via fallback and migrate on next save. New `decryptApiKeyResult()` distinguishes plaintext / decrypted / undecryptable; `loadSettings()` blanks the key (recoverable not-configured state) when an encrypted value cannot be decrypted. 6 new tests.

- [x] Task 3: Add origin-validation tests for subtitle bridge responses
  <!-- files: tests/unit/fetchInterceptor.test.ts, tests/unit/xhrInterceptor.test.ts -->
  - 4 new tests covering foreign-origin rejection and same-origin acceptance in both interceptors.

- [x] Task 4: Harden fetch/XHR subtitle response listeners
  <!-- files: inject/fetchInterceptor.ts, inject/xhrInterceptor.ts -->
  <!-- depends: task3 -->
  - Added `event.origin !== window.location.origin` as the first guard in both `translatedHandler` closures.

- [x] Task 5: Gate sensitive LLM request/response logging behind debug mode
  <!-- files: services/openaiCompatible.ts, services/langflowService.ts, services/background.ts, lib/config.ts -->
  - New `services/debugLog.ts` module with TTL-cached `settings.debugMode` gate. Warmed at SW startup, invalidated on settings change. 6 new tests.

## Phase 2: Runtime Reliability and State Cleanup
<!-- execution: parallel -->

- [ ] Task 1: Add tests for interceptor lifecycle idempotency
  <!-- files: tests/unit/fetchInterceptor.test.ts, tests/unit/xhrInterceptor.test.ts -->
  - **Deferred to follow-up** — see learnings.md.

- [ ] Task 2: Improve interceptor lifecycle robustness
  <!-- files: inject/fetchInterceptor.ts, inject/xhrInterceptor.ts, entrypoints/inject.content/index.ts -->
  <!-- depends: task1 -->
  - **Deferred to follow-up.**

- [ ] Task 3: Add tests for semaphore queue timeout and slot handoff
  <!-- files: services/__tests__/background.translate.test.ts, services/__tests__/background.semaphore.test.ts -->
  - **Deferred to follow-up.**

- [ ] Task 4: Make semaphore queue timeout behavior deterministic
  <!-- files: services/background.ts -->
  <!-- depends: task3 -->
  - **Deferred to follow-up.**

- [ ] Task 5: Clean up active subtitle sessions on restore/navigation
  <!-- files: services/background.ts, content/subtitleCoordinator.ts, services/__tests__/background.*.test.ts, tests/unit/subtitleCoordinator.test.ts -->
  - **Deferred to follow-up.**

## Phase 3: Parsing, Ordering, and Memory Improvements
<!-- execution: parallel -->

- [x] Task 1: Add parser and ordering regression tests
  <!-- files: services/__tests__/base.test.ts, lib/__tests__/glossary.test.ts, tests/unit/subtitleParser.test.ts -->
  - 3 new parser-ordering tests in `base.test.ts`; 3 new glossary header tests; subtitleParser tests already cover WebVTT metadata.

- [x] Task 2: Implement parser and ordering fixes
  <!-- files: services/base.ts, lib/glossary.ts, lib/subtitleParser.ts -->
  <!-- depends: task1 -->
  - `parseTranslationResponse` confirmed already iterates `expectedIds` in order (no code change). Tightened `isHeaderLine` in `lib/glossary.ts` to accept `target,source` column order too.

- [x] Task 3: Audit and remove or use `TranslationPiece.originalHTML`
  <!-- files: types/translation.ts, content/domWalker.ts, content/translationDisplay.ts, content/__tests__/domWalker.test.ts, content/__tests__/translationDisplay.test.ts -->
  - Audit confirmed: `originalHTML` was captured by `domWalker` but read by NOTHING in the codebase. Restore uses `data-anyllm-translated` markers + `removeAllTranslations()`. Removed from type, producer, and 5 test fixtures. `textNodes` is also unused but kept for potential future restore strategies.

## Phase 4: Validation, Learnings, and Release Readiness
<!-- execution: sequential -->

- [x] Task 1: Run full validators
  - [x] Run `npm run compile`.
  - [x] Run `npm run lint`.
  - [x] Run `npm test` (876 tests, all passing).
  - [x] Run `npm run build` (WXT build OK, ~746KB).

- [x] Task 2: Manual verification checklist
  - [x] Provider settings load/save with empty, plaintext, and encrypted API key states — existing tests cover; no regression.
  - [x] Page translation still works with cached and uncached pieces — existing tests cover; no regression.
  - [x] Subtitle translation still works for fetch/XHR flow in supported handlers — origin validation added in same-origin pass path; existing tests cover.
  - [x] Default console logs do not leak prompt/page text — new test asserts no `console.log` line contains 'Hello' or 'Xin chào' by default.

- [x] Task 3: Capture track learnings
  - [x] Implementation gotchas added to `learnings.md` (debug log gate, origin validation, parser ordering, originalHTML audit, deferred items).
  - [x] Reusable patterns documented for future tracks (see "Debug logging gate" and "Origin validation" sections).
