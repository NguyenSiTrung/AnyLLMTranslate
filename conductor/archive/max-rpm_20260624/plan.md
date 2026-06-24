# Plan: Max RPM Rate Limiting (max-rpm_20260624)

> Execution mode: **sequential** (small, focused feature; lower coordination overhead).

## Phase 1: Pure RPM Rate Limiter Module

- [x] Task 1.1: Write failing tests for lib/rateLimiter.ts (RED)
  - Test: maxRpm <= 0 (unlimited) → acquire() resolves synchronously, no timestamp tracking
  - Test: under cap → acquire() resolves immediately, records timestamp
  - Test: at cap → acquire() waits until 60s window frees a slot (fake timers)
  - Test: timestamps older than 60s are pruned on each acquire
  - Test: setMaxRpm() live-reconfigures the limiter (0 → N disables/enables)
  - Test: multiple concurrent acquire() calls serialize correctly (queue order preserved)
  - Test: window array never exceeds maxRpm length (bounded memory)

- [x] Task 1.2: Implement lib/rateLimiter.ts (GREEN)
  - Export `createRateLimiter(maxRpm): { acquire(), setMaxRpm(n), getMaxRpm(), __stateForTest? }`
  - `delay()` helper wrapping `setTimeout` (fake-timer friendly, mirror `lib/subtitleRetry.ts`)
  - `acquire()` prunes window, records `Date.now()`, loops/rechecks after awaited delay
  - Unlimited fast-path: `maxRpm <= 0` resolves immediately with no array work

- [x] Task 1.3: Conductor - Phase Verification 'Pure RPM Rate Limiter Module' (Protocol in workflow.md)

## Phase 2: Settings Plumbing

- [x] Task 2.1: Add maxRpm to types/config.ts
  - Add `maxRpm: number` to `ExtensionSettings` (with doc comment)
  - Add `maxRpm?: number` to `ProviderConfig` (mirrors `requestTimeoutMs` optional pattern)
  - Set `maxRpm: 0` in `DEFAULT_SETTINGS` and `provider.maxRpm: 0` in `DEFAULT_SETTINGS.provider`

- [x] Task 2.2: Add maxRpm to extractSettings() in settingsStore.ts
  - Without this, the field never surfaces through `useSettings()`

- [x] Task 2.3: Add settings plumbing tests
  - Test: `extractSettings` includes `maxRpm`; `DEFAULT_SETTINGS.maxRpm === 0`
  - Test: `deepMerge` preserves `maxRpm` across load/save round-trip

- [x] Task 2.4: Conductor - Phase Verification 'Settings Plumbing' (Protocol in workflow.md)

## Phase 3: Service Integration

- [x] Task 3.1: Thread maxRpm into OpenAICompatibleService
  - Hold private `rateLimiter` instance, create in constructor
  - `updateConfig(config)` calls `rateLimiter.setMaxRpm(config.maxRpm ?? 0)`
  - Mirror how `requestTimeoutMs` is already threaded

- [x] Task 3.2: Await rateLimiter.acquire() before fetch in fetchWithRetry
  - Place `acquire()` BEFORE AbortController/timer construction so the request-timeout clock doesn't start during the wait

- [x] Task 3.3: Extend service tests for limiter wiring
  - Test: `maxRpm` flows from config into the service
  - Test: `fetchWithRetry` awaits `acquire()` before `fetch` (verify call order with a spy limiter)
  - Test: changing config via `updateConfig` calls `setMaxRpm`

- [x] Task 3.4: Conductor - Phase Verification 'Service Integration' (Protocol in workflow.md)

## Phase 4: Options UI — Rate Limiting Card

- [x] Task 4.1: Add maxRpm to export/import object in AdvancedSection
  - Add `maxRpm: settings.maxRpm` alongside `maxBatchChars`/cache fields

- [x] Task 4.2: Add "Rate Limiting" Card with validated input
  - New bordered `Card` (Gauge icon), one `FieldGroup` + numeric `Input` for `maxRpm`
  - Label "Max requests per minute", description noting 0 = unlimited / local LLMs
  - Local state + sync effect (mirror `maxBatchChars` pattern)
  - Blur validation: integer 0..600; reject invalid without writing to store
  - Auto-save on valid change, toast "Max RPM updated"
  - Hint "(unlimited)" shown when value is 0

- [x] Task 4.3: Extend AdvancedSection tests
  - Test: field renders with default 0
  - Test: valid blur writes to store + toasts
  - Test: invalid input (negative, non-integer, > 600, empty) shows error, does not write
  - Test: field survives export/import round-trip

- [x] Task 4.4: Conductor - Phase Verification 'Options UI' (Protocol in workflow.md)

## Phase 5: Final Verification & Learnings

- [x] Task 5.1: Run full quality gates
  - `pnpm compile` (tsc --noEmit), `pnpm lint`, `pnpm test`, `pnpm build`
  - Confirm 1482 existing tests still pass (no behavior change at default `maxRpm: 0`)

- [x] Task 5.2: Manual verification + capture learnings
  - Manual: set `maxRpm` in Options, confirm it hot-applies; set 0, confirm no throttling
  - Append implementation learnings to `learnings.md`
