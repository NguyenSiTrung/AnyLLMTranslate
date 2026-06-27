# Spec: Provider Pool Resilience — Fix & Harden All Round-Robin / Failover Findings

> Track: `provider-pool-resilience_20260627`
> Type: Bug / Hardening
> Created: 2026-06-27
> Source: Deep analysis of provider setup → LLM request → round-robin/failover pipeline.

## Overview

The multi-provider pool (shipped in `multi-provider-pool_20260626`) introduced
`ProviderPoolCoordinator` round-robin distribution + circuit-breaker failover.
The architecture is sound and the pure modules (`poolCursor`, `poolResolver`,
`circuitBreaker`, `rateLimiter`) are clean. **The integration seam between the
coordinator and `OpenAICompatibleService` is broken**, and several per-request
hot-path issues degrade performance / correctness.

A deep analysis surfaced **13 findings** (2 critical, 2 high, 5 medium, 4 low).
This track fixes all of them in a single hardening pass so the headline value
proposition — multi-key resilience — actually functions in production.

## Root Causes (the two structural bugs)

1. **Error-contract mismatch (CRITICAL-1).** `OpenAICompatibleService.translate()`
   wraps everything in try/catch and returns `{success:false, error}` — it never
   throws. But `dispatchWithFailover()` only reacts to **thrown** `ApiError`s.
   Result: a 429/5xx from key 1 is caught by the service, returned as
   `success:false`, and the pool calls `breaker.recordSuccess()` and returns the
   failure. Circuit breaker never opens, no failover happens. The unit tests pass
   only because stubs *throw* where the real service never does.

2. **Cursor indexes the wrong array (CRITICAL-2).** The cursor advances in
   `[0, slots.length)` space, but `dispatchWithFailover` uses the index against
   `healthy[]` — a **filtered subset**. When any slot is open, indices misalign;
   the `?? healthy[attempt % healthy.length]` fallback skews distribution and can
   re-select the same failing slot within one failover chain.

## Decisions (confirmed)

- **D1 — Error contract:** Services **re-throw `ApiError`** (carrying
  `statusCode`) on retryable/auth/server failures. `{success:false}` survives only
  for content/parse issues that genuinely should surface. The pool's existing
  thrown-error failover model then works natively. Callers (page path, subtitle
  path) updated to handle the typed throw.
- **D2 — Cursor:** Cursor advances over the **healthy pool's own index space**,
  recomputed once per request. On failover, the loop walks the remaining healthy
  slots sequentially. No index-mismatch fallback.
- **D3 — Hot path:** Config **dirty-tracking** — `initService()` only runs
  `rebuild()` when the pool config actually changed (driven by `onSettingsChange`),
  not on every translate. Decrypted settings are memoized for a short window.
- **D4 — Scope:** All 13 findings.

## Functional Requirements

### FR-1 — Error contract repair (fixes #1, #5, #6)
- `translate()` re-throws `ApiError` (4xx/5xx/network) instead of swallowing.
- `{success:false}` retained only for: empty response, parse failure, partial
  back-fill (content problems), empty-text requests.
- `detectPageCategory()` / `classifyPdfParagraphs()` re-throw `ApiError` on
  transport/auth/rate-limit failures; keep `{success:false}` for parse issues.
- All callers that branch on `success` are audited: page path (background.ts),
  subtitle path, hover/selection/inline — they must not double-fail on a thrown
  `ApiError` now bubbling from the pool.

### FR-2 — Pool translate dispatch honors returned failures
- The pool's `dispatchWithFailover` still operates on the thrown model (now real).
- After fix, the existing `success:false` path returns the failure to the caller
  (no spurious `recordSuccess`) — verify no code treats a returned `success:false`
  as a healthy success.

### FR-3 — Cursor over healthy pool (fixes #2)
- `dispatchWithFailover` computes `healthy[]` once; cursor advances within `[0, healthy.length)`.
- Failover walks remaining healthy slots in order; never revisits an already-tried slot.
- Round-robin distribution is even when some slots are open.
- `PoolCursor` API stays pure (no breaker coupling).

### FR-4 — response_format memory survives (fixes #3)
- `responseFormatDisabled` is preserved across `updateConfig` / `rebuild` as long
  as `baseUrl + model` are unchanged. Reset only on an actual provider/model switch.

### FR-5 — Rate-limiter timeout coupling (fixes #4)
- The rate-limiter wait is bounded by the configured `requestTimeoutMs`; an acquire
  that cannot complete within the remaining budget fails fast (typed error) so the
  caller surfaces a clear "rate limit would exceed request timeout" rather than
  hanging past the user's configured bound.

### FR-6 — Hot-path dirty tracking (fixes #7, #8)
- `initService()` runs `rebuild()` only when settings affecting the pool changed
  (compared via a cheap signature), driven by `onSettingsChange`. Per-request
  translate calls reuse the built coordinator.
- Decrypted settings memoized (cache invalidated on `onSettingsChange`) so the
  AES-GCM loop doesn't run on every translate.

### FR-7 — Page path cache guard (fixes #9)
- Page translation path must not cache back-filled source-as-translation. Mirror
  the subtitle path's `partial` guard: when `result.partial === true` and a piece's
  translated text equals its source, do not write it to the page cache.

### FR-8 — Low-severity cleanups (fixes #10, #11, #12, #13)
- **#10** Cursor fairness on live slot-count change: document/test current modulo
  behavior; if a jump is observable, clamp to preserve relative position.
- **#11** `PoolExhaustedError` on the "all open before dispatch" path carries a
  non-null, descriptive lastError (or the type guards callers against `.lastError` access).
- **#12** Pool `testConnection()` without a `keyId` — when the cursor lands on a
  cooling slot, either skip open slots or document the behavior; prefer skip.
- **#13** Document/limit the double-retry layering (per-service 5xx retry × pool
  failover). Add an upper bound on total attempts per request so a provider-wide
  outage doesn't fan out to `keys × attempts` calls.

## Non-Functional Requirements

- **NFR-1 — Test fidelity.** The existing stub-based pool tests throw `ApiError`,
  which masked the production bug. Add an **integration test that uses the real
  `OpenAICompatibleService` against a mocked `fetch`** asserting that a 429 from
  slot 1 triggers breaker open + failover to slot 2. No more green-tests-but-broken.
- **NFR-2 — Pure modules stay pure.** `poolCursor`, `circuitBreaker`,
  `rateLimiter`, `poolResolver` keep injectable clocks and no side effects.
- **NFR-3 — Backward compatible.** Legacy single-provider users (auto-migrated to
  `providers[0]`) see unchanged behavior on the happy path; only the failure paths
  get smarter.
- **NFR-4 — No perf regression.** Hot-path dirty tracking must not add measurable
  per-request overhead; the signature comparison is O(keys).
- **NFR-5 — No new lint/tsc errors.** Lint is the gate (`tsc` pre-existing errors
  in `subtitleCoordinator.test.ts` are baseline).

## Acceptance Criteria

- [x] AC1: A real `OpenAICompatibleService` 429 from slot 1 opens its breaker and
  the next request fails over to slot 2 (proven by an integration test with mocked
  `fetch`, not a throwing stub).
- [x] AC2: With one slot open in a 3-slot pool, round-robin distributes evenly
  across the 2 healthy slots (no same-slot repeats within a request, no index skew).
- [x] AC3: After a `response_format` 400, subsequent requests on the same
  `(baseUrl, model)` skip `response_format` even after `rebuild()`/`updateConfig`.
- [x] AC4: When all slots fail, the surfaced error is non-null and descriptive;
  callers don't throw on `.lastError` access.
- [x] AC5: The page translation path never caches a partial back-fill.
- [x] AC6: Repeated `translate()` calls without a settings change do NOT re-run
  `rebuild()`/`updateConfig()`/full decrypt (asserted in a test).
- [x] AC7: `pnpm lint` clean; `pnpm test --run` all green; `wxt build` succeeds.
- [x] AC8: No regression in the existing 107 pool tests + page/subtitle paths.

## Out of Scope

- Changing the AES-GCM encryption scheme or storage layout.
- Rewriting the OpenAI-compatible prompt/parsing layer (only its error contract).
- Adding new UI for pool status (the existing UI badge is sufficient).
- Per-provider concurrency tuning (semaphore stays max-3 / PDF-max-2).
- New provider presets or catalog entries.
