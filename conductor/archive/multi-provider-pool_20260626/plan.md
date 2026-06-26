# Implementation Plan: Multi-Provider Pool with Round-Robin & Circuit-Breaker Failover

## Phase 1: Data Model & Migration
<!-- execution: parallel -->
<!-- depends: -->

- [ ] Task 1.1: Add pool types to `types/config.ts`
  - New interfaces `PoolKey` (id, apiKey, label?, maxRpm, enabled) and `PoolProvider`
    (id, displayName, baseUrl, model, requiresApiKey, catalogId?, temperature, maxTokens,
    requestTimeoutMs?, enabled, keys: PoolKey[]). Add `providers: PoolProvider[]` to
    `ExtensionSettings`. Add `DEFAULT_SETTINGS.providers = []`. Update `extractSettings()`.
  <!-- files: types/config.ts -->

- [ ] Task 1.2: Per-key encryption + legacy migration in `lib/config.ts`
  - TDD: `loadSettings` synthesizes `providers[]` from legacy `provider` when `providers` empty
    (one provider, one key carrying `settings.maxRpm`). `saveSettings`/`loadSettings` encrypt
    and decrypt EACH `providers[].keys[].apiKey` via `encryptApiKey`/`decryptApiKeyResult`;
    undecryptable keys are blanked + flagged. Legacy `provider` kept as read-only mirror.
  <!-- files: lib/config.ts, content/__tests__/... or lib/__tests__/config.test.ts -->
  <!-- depends: task1.1 -->

- [ ] Task 1.3: Extend Zustand store masking to nested keys
  - `settingsStore.initStorageSync` masks each `providers[].keys[].apiKey` to `'***'`;
    `extractSettings` propagates the new field; async-reload decrypts per key.
  <!-- files: stores/settingsStore.ts, stores/__tests__/settingsStore.test.ts -->
  <!-- depends: task1.1 -->

- [ ] Task: Conductor - User Manual Verification 'Data Model & Migration' (Protocol in workflow.md)

## Phase 2: Pure Coordination Libraries (TDD)
<!-- execution: parallel -->
<!-- depends: phase1 -->

- [ ] Task 2.1: `lib/poolCursor.ts` — pure round-robin selector
  - TDD: cursor advances across slot indices; wraps; stays at 0 for empty pool; fake-timer
    friendly (no `Date.now` coupling beyond injectable clock); stable insertion-order iteration.
  <!-- files: lib/poolCursor.ts, lib/__tests__/poolCursor.test.ts -->

- [ ] Task 2.2: `lib/circuitBreaker.ts` — pure circuit breaker
  - TDD: states closed/open; on 429/5xx/network → cooldown escalating 60→120→300s capped;
    on 401/403 → long-open (1h) + `credentialInvalid` flag; `isHealthy(slot, now)`; auto-rejoin
    when `now >= openUntil`; consecutive-failure counter resets on a successful call. Injectable clock.
  <!-- files: lib/circuitBreaker.ts, lib/__tests__/circuitBreaker.test.ts -->

- [ ] Task 2.3: `lib/poolResolver.ts` — flatten + filter pool
  - TDD: `resolveSlots(providers)` → ordered `PoolSlot[]` of enabled-provider × enabled-key pairs;
    `healthySlots(slots, breaker, now)` excludes open slots. Pure, no side effects.
  <!-- files: lib/poolResolver.ts, lib/__tests__/poolResolver.test.ts -->

- [ ] Task: Conductor - User Manual Verification 'Pure Coordination Libraries' (Protocol in workflow.md)

## Phase 3: ProviderPoolCoordinator
<!-- execution: sequential -->
<!-- depends: phase2 -->

- [ ] Task 3.1: Coordinator skeleton + member-service ownership
  - `services/providerPool.ts`: `class ProviderPoolCoordinator implements TranslationService`.
    Holds one `OpenAICompatibleService` per enabled slot (own RateLimiter + own
    `responseFormatDisabled`). `rebuild(settings)` updates members in place, preserving
    circuit-breaker state for unchanged key identities. Empty-pool → throws typed error.
  <!-- files: services/providerPool.ts, services/__tests__/providerPool.test.ts -->

- [ ] Task 3.2: `translate()` with round-robin + failover
  - TDD: pick next healthy slot via cursor; `acquire()` that slot's RateLimiter; dispatch;
    on eligible failure, open breaker + retry next healthy slot up to `healthySlotCount` times;
    all-open → throw last error. Mixed-keys RPM test (two keys @60 sustain ~120).
  <!-- files: services/providerPool.ts, services/__tests__/providerPool.test.ts -->
  <!-- depends: task3.1 -->

- [ ] Task 3.3: Delegate `testConnection`, `detectPageCategory`, `classifyPdfParagraphs`
  - Each delegates to the round-robin path with its own bounded failover; `testConnection` targets
    a specific slot when invoked per-key from the UI (accept optional `keyId`).
  <!-- files: services/providerPool.ts, services/__tests__/providerPool.test.ts -->
  <!-- depends: task3.1 -->

- [ ] Task: Conductor - User Manual Verification 'ProviderPoolCoordinator' (Protocol in workflow.md)

## Phase 4: Background Wiring
<!-- execution: sequential -->
<!-- depends: phase3 -->

- [ ] Task 4.1: `initService()` returns the coordinator
  - Build coordinator from `settings.providers`; live re-init on `onSettingsChange` /
    `updateSettings` calls `coordinator.rebuild()` (preserve breaker state). Remove the
    `activePreset` recreate branch (single-preset world is moot under the pool).
  <!-- files: services/background.ts, services/__tests__/background.test.ts -->

- [ ] Task 4.2: Error surfacing + empty-pool handling
  - All-open / empty-pool throws propagate through existing per-path error surfacing
    (`ApiError` carries `statusCode`). Verify subtitle `SUBTITLE_CHUNK_FAILED` toast still fires.
  <!-- files: services/background.ts, services/__tests__/background.test.ts -->
  <!-- depends: task4.1 -->

- [ ] Task: Conductor - User Manual Verification 'Background Wiring' (Protocol in workflow.md)

## Phase 5: Providers Manager UI
<!-- execution: parallel -->
<!-- depends: phase3 -->

- [ ] Task 5.1: `ProvidersSection` container + collapsible provider list
  - Add Options sidebar entry "Providers". Renders providers as collapsible cards (displayName,
    baseUrl, model, catalog picker reusing `ProviderCatalogPicker`, temperature/maxTokens,
    enabled toggle, delete, "+ Add key"). Drives `updateSettings({ providers })`.
  <!-- files: entrypoints/options/sections/ProvidersSection.tsx, __tests__/ProvidersSection.test.tsx -->

- [ ] Task 5.2: `PoolKeyRow` component
  - Masked apiKey input (+ reveal), optional label, `maxRpm` integer input (0–600), enabled
    toggle, "Test" button (calls coordinator `testConnection({ keyId })`), live status badge
    (healthy / cooling-down Xs / invalid-credential / disabled) from breaker state.
  <!-- files: entrypoints/options/components/PoolKeyRow.tsx, __tests__/PoolKeyRow.test.tsx -->
  <!-- depends: task5.1 -->

- [ ] Task 5.3: "+ Add provider from catalog" entry point
  - Modal/list reusing `OPENAI_COMPATIBLE_CATALOG`; on pick, append a new `PoolProvider`
    (with one empty key). Pre-fill baseUrl/displayName/model from catalog entry.
  <!-- files: entrypoints/options/components/PoolProviderAddModal.tsx, __tests__/...test.tsx -->
  <!-- depends: task5.1 -->

- [ ] Task: Conductor - User Manual Verification 'Providers Manager UI' (Protocol in workflow.md)

## Phase 6: Wizard Compat & Integration
<!-- execution: sequential -->
<!-- depends: phase4, phase5 -->

- [ ] Task 6.1: Setup wizard writes `providers[0]`
  - Wizard's provider step writes one provider + one key into `providers[]` (and keeps legacy
    `provider` mirror in sync). First-run UX unchanged.
  <!-- files: entrypoints/options/SetupWizard.tsx, __tests__/SetupWizard.test.tsx -->

- [ ] Task 6.2: Aggregate connection status for popup readiness
  - `getProviderReadiness()` / popup recovery card aggregates member statuses: not-configured
    if pool empty; `error` if all keys invalid; `success` if ≥1 healthy key.
  <!-- files: lib/providerReadiness.ts, entrypoints/popup/..., __tests__/... -->

- [ ] Task 6.3: Integration tests across all translation paths
  - One test per path (page, subtitle, PDF, selection, hover, inline, category-detect) confirming
    requests route through the coordinator and round-robin engages across two mocked keys.
  <!-- files: services/__tests__/providerPool.integration.test.ts -->

- [ ] Task: Conductor - User Manual Verification 'Wizard Compat & Integration' (Protocol in workflow.md)

## Phase 7: Quality Gates & Docs
<!-- execution: sequential -->
<!-- depends: phase6 -->

- [ ] Task 7.1: Run full quality gates
  - `pnpm compile` → `pnpm lint` → `pnpm test` → `pnpm build`. Fix any regressions. Confirm
    new modules ≥ 80% coverage. Verify bundle size delta is acceptable.
  <!-- files: (no source — verification only) -->

- [ ] Task 7.2: Update conductor docs
  - Add feature to `conductor/product.md` Key Features + Implementation Status; mark track
    complete in `conductor/tracks.md`; elevate reusable patterns (round-robin coordinator,
    circuit breaker, per-key encryption loop) to `conductor/patterns.md`.
  <!-- files: conductor/product.md, conductor/tracks.md, conductor/patterns.md -->

- [ ] Task: Conductor - User Manual Verification 'Quality Gates & Docs' (Protocol in workflow.md)
