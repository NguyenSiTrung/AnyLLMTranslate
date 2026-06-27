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
