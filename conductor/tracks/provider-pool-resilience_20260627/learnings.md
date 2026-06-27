# Track Learnings: provider-pool-resilience_20260627

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

Relevant inherited patterns from `conductor/patterns.md` (read in full before
starting — 392 lines). Highlights most relevant to this track:

- **AES-GCM encryption loop in loadSettings/saveSettings** (from
  `multi-provider-pool_20260626`): per-key decryption happens in `decryptPoolKeys()`
  at load. Relevant to FR-6 — memoizing the decrypted settings avoids re-running
  this per translate.
- **Validator order: `tsc` → `eslint` → `vitest` → `wxt build`** (from
  `bilingual-display-ux_20260505`): lint is the gate; the 3 pre-existing `tsc`
  errors in `content/__tests__/subtitleCoordinator.test.ts` are baseline.
- **`ApiError` carries `statusCode`** (from `audit-v2_20260623`): introduced
  specifically so retry logic can distinguish 4xx/5xx without fragile string
  matching. FR-1 makes `translate()` actually USE this by re-throwing.
- **Recoverable decrypt result via discriminator** (from
  `deep-analysis-hardening_20260611`): `decryptApiKeyResult()` returns
  `{value, ok, encrypted}`. Keep this contract when memoizing.
- **Circuit breaker + cursor pure modules** (from `multi-provider-pool_20260626`):
  `poolCursor`, `circuitBreaker`, `poolResolver` take injectable clocks, no side
  effects. FR-3 must keep `poolCursor` pure — the coordinator owns healthy-space sizing.
- **`onSettingsChange` → `initService()`** is the live-reconfigure seam
  (`services/background.ts:1234`). FR-6's dirty tracking hooks here.
- **Fire-and-forget stats with `.catch(() => {})`** (from `ux-power-features`):
  stats calls in the translate path must not block or throw into the new error flow.

## Pre-Implementation Context (from the deep analysis)

The two structural bugs the pool tests did NOT catch:

1. **Stub-throwing masked the contract bug.** `providerPool.test.ts` uses stubs
   that `throw new ApiError(...)` on failure — but the real
   `OpenAICompatibleService.translate()` catches every error and returns
   `{success:false, error}`. So `dispatchWithFailover`'s `catch` block (the entire
   failover + circuit-breaker path) is **dead code in production**. FR-1 fixes the
   service; Task 1.5 adds the integration test that would have caught it.

2. **Cursor indexes `slots.length` but the dispatch indexes `healthy[]`.**
   `dispatchWithFailover` line 288-292:
   ```ts
   const slotIdx = this.cursor.next();           // [0, slots.length)
   const slot = healthy[slotIdx] ?? healthy[attempt % healthy.length];
   ```
   When any slot is open, `healthy` is shorter than `slots`, so `healthy[slotIdx]`
   picks the wrong slot or falls through to the skew-prone modulo fallback. FR-3
   makes the cursor advance over the healthy subset's own index space.

## Key files in scope

- `services/openaiCompatible.ts` — error contract (FR-1), response_format memory (FR-4),
  rate-limiter wiring (FR-5), retry layering (FR-8 #13).
- `services/providerPool.ts` — cursor fix (FR-3), PoolExhaustedError (FR-8 #11),
  testConnection open-slot skip (FR-8 #12).
- `lib/poolCursor.ts` — fairness on count change (FR-8 #10); stays pure.
- `lib/rateLimiter.ts` — acquire deadline (FR-5); stays pure + fake-timer friendly.
- `services/background.ts` — caller audit (FR-1), cache guard (FR-7), dirty tracking (FR-6).
- `lib/config.ts` — settings memoization (FR-6).
- Tests: `services/__tests__/openaiCompatible.test.ts`, `providerPool.test.ts`,
  `providerPool.integration.test.ts`, `background.translate.test.ts`,
  `lib/__tests__/rateLimiter.test.ts`, `lib/__tests__/poolCursor.test.ts`.

---

<!-- Learnings from implementation will be appended below -->

## [2026-06-27 09:50] - Phase 1: Error Contract Repair (FR-1, FR-2)
- **Implemented:** Services re-throw `ApiError` on transport/auth/rate-limit; `{success:false}` kept for content/parse failures. AC1 integration test (real `OpenAICompatibleService` + mocked `fetch`) proves 429→breaker open→failover.
- **Files changed:** services/openaiCompatible.ts, services/background.ts, services/__tests__/openaiCompatible.test.ts, services/__tests__/providerPool.integration.test.ts, services/__tests__/background.test.ts
- **Commit:** 4e2ad47
- **Learnings:**
  - **Pattern:** A try/catch that converts EVERY error to a return value defeats downstream error-driven logic (circuit breaker / failover). When a contract relies on THROWN errors, the producer must NOT swallow — wrap only the narrow paths that should return (content/parse), let transport errors propagate.
  - **Gotcha (critical):** Making the pool open circuit breakers on real failures surfaced a TEST-ISOLATION bug — the `translationService` coordinator is a module singleton whose breaker cooldowns (60s+) leaked across test cases. A 429 in one `background.test.ts` test left a key open for the next, breaking 18 tests. Fix: `__resetTranslationServiceForTest()` in `beforeEach` (mirrors `__resetSemaphoreForTest`). This is a class of bug that ONLY appears when previously-dead error paths become live — expect more like it in Phases 2-5.
  - **Gotcha:** In a single-provider/multi-key pool, both keys resolve to the SAME endpoint URL (baseUrl comes from the provider, not the key). A fetch mock that discriminates failure by URL can't distinguish k1 from k2 — discriminate by the `Authorization: Bearer <key>` header instead, exactly as the production service sends it.
  - **Pattern:** The test that would have caught the original bug uses the REAL service with mocked transport, not a throwing stub. "Stub-throwing masked the contract bug" is the headline learning for elevation to patterns.md.
  - **Context:** `parseTranslationResponse` (services/base.ts:148) throws a plain `Error` (not `ApiError`) on parse failure — that's why translate() now wraps ONLY the parse call in try/catch, keeping `fetchCompletion` unwrapped so its `ApiError` propagates.
---
