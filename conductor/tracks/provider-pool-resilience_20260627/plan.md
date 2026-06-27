# Plan: Provider Pool Resilience

> Track: `provider-pool-resilience_20260627`
> Spec: [./spec.md](./spec.md)
> Methodology: TDD (write test → implement → refine). Commit after each task.

## Execution Order

**Phase 1 is the foundation** — the error-contract change in `openaiCompatible.ts`
unblocks every later phase (the pool can only fail over on real throws). Phases
2–5 each depend on Phase 1. Phase 6 (hot path) is independent of 2–5 and could
run in parallel. Phase 7 verifies the whole. Within each phase, tasks are
sequential unless marked parallel.

---

## Phase 1: Error Contract Repair (FR-1, FR-2) — fixes #1, #5, #6
<!-- execution: sequential -->

The structural root cause. Services stop swallowing transport/auth/rate-limit
errors; they re-throw `ApiError` so the pool's failover actually fires.

- [ ] Task 1.1: Add tests asserting `translate()` throws `ApiError` on 429/5xx/401
  <!-- files: services/__tests__/openaiCompatible.test.ts -->
  - TDD RED: mock `fetch` to return 429 → `translate()` must reject with `ApiError`
    carrying `statusCode === 429`. Same for 503, 401. Currently it resolves
    `{success:false}` — these tests fail until the impl change.
  - Assert `{success:false}` is STILL returned for: empty response, JSON parse
    failure (these are content problems, not transport).

- [ ] Task 1.2: Implement re-throw in `translate()` (and keep content failures as `{success:false}`)
  <!-- files: services/openaiCompatible.ts -->
  - Remove the broad `catch` that converts every error to `{success:false}`.
  - Let `ApiError` (and other thrown transport errors) propagate out of `translate()`.
  - Keep the inner try/catch around `parseTranslationResponse()` and the empty-
    response check so those still return `{success:false, error}` (content problems
    that should surface to the user, not fail over — a malformed JSON from key 2
    would likely also fail).

- [ ] Task 1.3: Same treatment for `detectPageCategory()` and `classifyPdfParagraphs()`
  <!-- files: services/openaiCompatible.ts, services/__tests__/openaiCompatible.test.ts -->
  - Re-throw `ApiError` on transport/auth/rate-limit; keep `{success:false}` for
    JSON parse failures of an otherwise-200 response.

- [ ] Task 1.4: Audit + update all callers of `service.translate()` for the new throw
  <!-- files: services/background.ts, services/__tests__/background.translate.test.ts -->
  - Page path (`handleTranslate`): it already wraps in try/catch (line ~380) —
    verify a thrown `ApiError` surfaces cleanly as `{success:false, error}` to the
    content script (no unhandled rejection). No behavioral change needed beyond
    confirming the catch is present and produces a good message.
  - Subtitle path: already re-throws `{success:false}` into `withRetry` (line 559);
    now a thrown `ApiError` skips that wrapper and bubbles to the same retry. Verify
    `withRetry`'s `shouldRetry` handles `ApiError` (it returns true for all today —
    acceptable, but confirm 4xx doesn't loop unboundedly given FR-8/#13).
  - Selection / hover / inline paths: confirm they call through the same
    `service.translate()` and have a catch.

- [ ] Task 1.5: Add the integration test that proves real-service failover works
  <!-- files: services/__tests__/providerPool.integration.test.ts -->
  - Use the REAL `OpenAICompatibleService` (no throwing stub), mock `global.fetch`
    to return 429 for key 1's URL and 200 for key 2's URL. Assert: key 1 breaker
    opens, result comes from key 2, next request skips key 1. THIS is the test that
    would have caught the original bug.

- [ ] Task: Conductor - User Manual Verification 'Phase 1: Error Contract Repair'

---

## Phase 2: Cursor Over Healthy Pool (FR-3) — fixes #2
<!-- execution: sequential -->
<!-- depends: phase1 -->

- [ ] Task 2.1: Tests for even distribution when a slot is open
  <!-- files: services/__tests__/providerPool.test.ts -->
  - RED: 3 slots [k1,k2,k3], open k1's breaker, fire 4 sequential translates.
    Assert the cursor distributes evenly across k2/k3 with no repeats within a
    single request's failover chain and no index-skew selection.

- [ ] Task 2.2: Rework `dispatchWithFailover` to index healthy space
  <!-- files: services/providerPool.ts -->
  - Compute `healthy[]` once. The cursor advances within `[0, healthy.length)`.
  - On failover, iterate the remaining healthy slots (the already-tried one is now
    open and excluded on the `remaining` recompute, or explicitly tracked in a
    `tried: Set<keyId>`). No `healthy[slotIdx] ?? healthy[attempt % ...]` fallback.
  - Keep `PoolCursor` pure — the cursor still just yields an integer in its space;
    the coordinator owns the healthy-space sizing (call `setSlotCount` with
    `healthy.length` for the duration of this dispatch, then it doesn't matter
    because rebuild re-sets it).

- [ ] Task 2.3: Regression — round-robin still alternates with all slots healthy
  <!-- files: services/__tests__/providerPool.test.ts -->
  - Existing k1→k2→k1 test must still pass unchanged.

- [ ] Task: Conductor - User Manual Verification 'Phase 2: Cursor Over Healthy Pool'

---

## Phase 3: response_format Memory (FR-4) — fixes #3
<!-- execution: sequential -->
<!-- depends: phase1 -->

- [ ] Task 3.1: Test that response_format stays disabled across updateConfig
  <!-- files: services/__tests__/openaiCompatible.test.ts -->
  - RED: trigger a `response_format` 400 → confirm flag set → call `updateConfig`
    with the SAME baseUrl+model → assert the next request body omits
    `response_format` (no wasted 400). Then `updateConfig` with a DIFFERENT model
    → assert it resets and re-sends `response_format`.

- [ ] Task 3.2: Key the flag by baseUrl+model identity
  <!-- files: services/openaiCompatible.ts -->
  - Track `(baseUrl, model)` the flag was learned against; `updateConfig` only
    resets `responseFormatDisabled` when that identity changes.

- [ ] Task: Conductor - User Manual Verification 'Phase 3: response_format Memory'

---

## Phase 4: Rate-Limiter Timeout Coupling (FR-5) — fixes #4
<!-- execution: sequential -->
<!-- depends: phase1 -->

- [ ] Task 4.1: Test that acquire() respects a deadline
  <!-- files: lib/__tests__/rateLimiter.test.ts -->
  - RED: cap=1, fill the window, call `acquire()` with a short deadline → must
    reject (typed error) instead of waiting indefinitely. Use fake timers to assert
    no wait beyond the deadline.

- [ ] Task 4.2: Add a deadline/budget to `acquire()`
  <!-- files: lib/rateLimiter.ts -->
  - `acquire(timeoutMs?: number)` — if the computed wait exceeds the budget,
    reject with a typed `RateLimitTimeoutError`. Keep the unlimited fast-path.

- [ ] Task 4.3: Wire the request timeout into `acquire()` from `fetchWithRetry`
  <!-- files: services/openaiCompatible.ts -->
  - Pass `requestTimeoutMs` as the acquire deadline so a low-`maxRpm` under load
    surfaces a clear error instead of hanging past the user's bound.

- [ ] Task: Conductor - User Manual Verification 'Phase 4: Rate-Limiter Timeout Coupling'

---

## Phase 5: Caller Cache Guard + Pool Surface Cleanups (FR-7, FR-8 #9/#11/#12/#13)
<!-- execution: parallel -->
<!-- depends: phase1 -->

- [ ] Task 5.1: Page path must not cache partial back-fills (fixes #9)
  <!-- files: services/background.ts, services/__tests__/background.translate.test.ts -->
  - Mirror the subtitle guard: when `result.partial === true` and
    `translatedText === piece.text`, skip the `cacheTranslation()` write.

- [ ] Task 5.2: PoolExhaustedError non-null lastError (fixes #11)
  <!-- files: services/providerPool.ts, services/__tests__/providerPool.test.ts -->
  - On the "all open before dispatch" path, set `lastError` to a descriptive Error
    (or make the type `unknown | Error` and document). Ensure callers reading
    `.lastError.message` never throw.

- [ ] Task 5.3: Pool testConnection() skips open slots (fixes #12)
  <!-- files: services/providerPool.ts, services/__tests__/providerPool.test.ts -->
  - A keyId-less testConnection should not land on a cooling slot; route through
    the healthy filter (or document explicitly).

- [ ] Task 5.4: Document + bound the double-retry layering (fixes #13)
  <!-- files: services/openaiCompatible.ts, services/providerPool.ts -->
  - Add a comment + a cap so a provider-wide 5xx doesn't fan out to
    `keys × per-service-retries` calls. Consider reducing per-service 5xx retries
    to 1 when the pool has >1 slot (failover is the better recovery). Test the cap.

- [ ] Task: Conductor - User Manual Verification 'Phase 5: Caller Cache Guard + Pool Surface Cleanups'

---

## Phase 6: Hot-Path Dirty Tracking (FR-6) — fixes #7, #8
<!-- execution: sequential -->
<!-- depends: -->

Independent of Phases 2–5 (touches `initService` seam + settings memoization, not
the error contract). Can run in parallel with Phases 2–5.

- [ ] Task 6.1: Test that repeated translate() without settings change skips rebuild
  <!-- files: services/__tests__/background.translate.test.ts -->
  - RED: spy on the coordinator's `rebuild` / members' `updateConfig`; fire two
    translates without a settings change → assert `rebuild`/`updateConfig` called
    at most once (on first init), not per call.

- [ ] Task 6.2: Signature-based dirty tracking in `initService()`
  <!-- files: services/background.ts -->
  - Compute a cheap signature over the pool-relevant settings (providers[]
    baseUrl/model/key-ids/maxRpm/enabled + top-level maxRpm); only call
    `coord.rebuild()` when the signature changes. `onSettingsChange` bumps it.

- [ ] Task 6.3: Memoize decrypted settings
  <!-- files: lib/config.ts, services/background.ts -->
  - Cache the decrypted `ExtensionSettings` with invalidation on
    `onSettingsChange` so the AES-GCM loop doesn't run per translate.

- [ ] Task 6.4: Cursor fairness on live slot-count change (fixes #10)
  <!-- files: lib/poolCursor.ts, lib/__tests__/poolCursor.test.ts -->
  - Test current modulo behavior under count changes; if a distribution jump is
    observable, clamp to preserve relative position. Document the chosen semantics.

- [ ] Task: Conductor - User Manual Verification 'Phase 6: Hot-Path Dirty Tracking'

---

## Phase 7: Full Verification & Documentation
<!-- execution: sequential -->
<!-- depends: phase1, phase2, phase3, phase4, phase5, phase6 -->

- [ ] Task 7.1: Run full quality gates
  <!-- files: -->
  - `pnpm lint`, `pnpm test --run` (expect all green, 0 flaky), `wxt build`.
  - Re-run the 107 prior pool tests to confirm no regression.

- [ ] Task 7.2: Update README / product.md provider-pool section accuracy
  <!-- files: README.md, conductor/product.md -->
  - The README claims round-robin + circuit-breaker failover "just works" — after
    this track it actually does. Tighten any wording that implied it worked before.

- [ ] Task 7.3: Capture track learnings + elevate reusable patterns
  <!-- files: conductor/tracks/provider-pool-resilience_20260627/learnings.md, conductor/patterns.md -->
  - Key learning: "stub-throwing masked a production contract bug — always add an
    integration test with the REAL service + mocked transport."
  - Elevate the error-contract pattern + dirty-tracking pattern to patterns.md.

- [ ] Task: Conductor - User Manual Verification 'Phase 7: Full Verification & Documentation'
