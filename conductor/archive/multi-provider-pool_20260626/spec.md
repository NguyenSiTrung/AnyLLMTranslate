# Spec: Multi-Provider Pool with Round-Robin & Circuit-Breaker Failover

## Overview

Allow users to configure multiple active LLM providers simultaneously, and multiple API keys per provider.
At request time, the translation pipeline distributes requests across all enabled, healthy (provider, key)
slots in round-robin fashion, with per-key RPM rate limiting and automatic circuit-breaker failover on
failures (429 / 5xx / network / 401-auth). This multiplies effective throughput across keys and keeps
translation resilient when one key hits a rate limit or a credential goes bad.

All translation paths (page, subtitle, PDF, text selection, hover, inline, LLM category detection,
glossary preview) funnel through a single seam — `initService()` in the background service worker —
so the pool coordinator is introduced there as a drop-in `TranslationService` and automatically covers
every call path.

## Functional Requirements

### FR-1 — Pool data model
- New `providers: PoolProvider[]` on `ExtensionSettings`. Each `PoolProvider` holds shared fields
  (`displayName`, `baseUrl`, `model`, `requiresApiKey`, `catalogId?`, `temperature`, `maxTokens`,
  `requestTimeoutMs`) plus a `keys: PoolKey[]` array.
- Each `PoolKey` has: stable `id`, `apiKey` (encrypted at rest), optional `label`, `maxRpm` (0 = unlimited),
  `enabled` flag.
- Each `PoolProvider` has an `enabled` flag (provider-level enable/disable).
- **Migration**: on first load with no `providers[]` but an existing legacy `provider`, synthesize
  `providers = [{ ...legacyProvider, keys: [{ apiKey: legacyProvider.apiKey, maxRpm: settings.maxRpm, enabled: true }] }]`.
  Legacy `provider` is kept read-only as a mirror for backward-compatible paths during transition.

### FR-2 — Active pool = all enabled, always
- The rotation pool is the set of every `(PoolProvider, PoolKey)` pair where BOTH `provider.enabled`
  and `key.enabled` are true, and the key's circuit breaker is closed (healthy).
- No separate "active set" selection. Enabling/disabling a key or provider is the only control.

### FR-3 — Round-robin distribution
- A cursor advances across pool slots in order; each translation request is dispatched to the next slot.
- Selection is per logical request (one `translate()` call = one slot, with failover per FR-4).
- Slot order is stable (insertion order) for predictability.

### FR-4 — Circuit-breaker failover
- On a per-call failure, the slot is evaluated:
  - **429 / 5xx / network error** → slot enters cooldown (default 60s; escalates with consecutive
    failures: 60s → 120s → 300s, capped). The current request is retried on the next healthy slot.
  - **401 / 403 (auth)** → slot opens LONG (default 1 hour) and is flagged "credential invalid";
    auto-rejoins only after the cooldown, but user is nudged to fix the key.
  - **Other 4xx** → no cooldown (treated as request-specific, e.g. bad prompt); error surfaces.
- Failover retries up to `healthySlotCount` times within a single translate() call (bounded, no infinite loop).
- If ALL slots are open, translate() throws the last error to the caller (existing error surfacing).
- Cooled-down slots auto-rejoin the rotation when `now >= openUntil`.

### FR-5 — Per-key RPM, summed throughput
- Each pool slot owns its own `RateLimiter` (the existing pure `lib/rateLimiter.ts` already supports
  cheap per-instance creation), configured from `key.maxRpm`.
- The coordinator `acquire()`s the chosen slot's limiter before dispatching.
- Aggregate throughput ≈ sum of enabled keys' `maxRpm`.
- The legacy global `maxRpm` becomes the default for migrated keys and is kept for backward compatibility
  but no longer caps the whole pool.

### FR-6 — Coordinator as drop-in TranslationService
- A new `ProviderPoolCoordinator` implements `TranslationService` (`translate`, `testConnection`,
  `detectPageCategory`, `classifyPdfParagraphs`).
- It holds N `OpenAICompatibleService` instances (one per enabled pool slot) and delegates per call with
  round-robin + failover. Each member service retains its own `RateLimiter` and `responseFormatDisabled`
  state (correct: shared within a provider's baseUrl).
- `initService()` returns the coordinator instead of a bare service. Live re-init on settings change
  reconstructs/updates member services in place (preserve circuit-breaker state where the key identity
  is unchanged).

### FR-7 — Encryption & persistence
- `saveSettings`/`loadSettings` (`lib/config.ts`) encrypt/decrypt EACH `providers[].keys[].apiKey`
  via the existing `encryptApiKey`/`decryptApiKeyResult` (AES-GCM per-install salt).
- On undecryptable key, blank that key and mark it (mirrors current single-key recoverable behavior).
- `settingsStore.extractSettings` + `initStorageSync` masking (`'***'`) extend to the nested keys array.

### FR-8 — UI: Providers manager section
- New Options section "Providers" (manages the pool), superseding the editing surface of the current
  ProviderSection. Single-provider/1-key case renders essentially like today's simple form.
- Per provider (collapsible): displayName, baseUrl, model, catalog picker, temperature/maxTokens,
  enabled toggle, "+ Add key", delete.
- Per key: masked apiKey input, optional label, maxRpm integer input, enabled toggle, "Test" button,
  live status badge (healthy / cooling-down Xs / invalid-credential / disabled).
- "+ Add provider from catalog" entry point (reuses existing `OPENAI_COMPATIBLE_CATALOG`).
- Setup wizard continues to write pool[0] (one provider + one key); the manager is the power-user surface.
- Global connection status aggregates member statuses for the popup readiness system.

## Non-Functional Requirements

- **NFR-1**: Pure, fake-timer-friendly modules for round-robin cursor + circuit breaker (testable in
  isolation, matching the `lib/rateLimiter.ts` precedent).
- **NFR-2**: ≥ 80% test coverage on new modules; TDD.
- **NFR-3**: No bundle-size regression beyond what the new UI requires.
- **NFR-4**: Backward compatible — existing users with one provider see zero behavior change after migration.
- **NFR-5**: No lint regressions; named exports only; MV3 best practices.
- **NFR-6**: Service-worker-restart-safe — circuit-breaker cooldowns are time-based (recompute from
  wall clock on restart), not reliant on in-memory state surviving eviction.

## Acceptance Criteria

- AC-1: A user with 2 enabled keys sees requests alternate between them across sequential translate calls.
- AC-2: When one key returns 429, subsequent requests skip it for the cooldown window and use the other
  key; the cooled-down key rejoins automatically after cooldown.
- AC-3: A 401 key is flagged invalid and skipped until its cooldown; the UI shows the invalid-credential
  badge and a re-test restores it.
- AC-4: With two keys at maxRpm=60 each, the combined pipeline sustains ~120 RPM (not capped at 60).
- AC-5: An existing single-provider user, after upgrade, has their provider migrated into the pool as
  pool[0] with one key, and translation works identically.
- AC-6: All seven translation paths (page, subtitle, PDF, selection, hover, inline, category-detect)
  route through the coordinator without per-path changes.
- AC-7: `pnpm test`, `pnpm lint`, `pnpm compile`, `pnpm build` all pass; new modules ≥ 80% coverage.

## Out of Scope

- Weighted/priority rotation (equal round-robin only).
- Per-translation-mode provider assignment (FR-2 alternative) — may be a follow-up track.
- Provider-specific non-OpenAI-compatible backends (Langflow etc.) — pool is OpenAI-compatible only.
- Automatic key provisioning / OAuth — BYOK keys entered manually only.
- Cross-device key sync — keys stay local + encrypted as today.
- Weight-based or latency-based routing beyond simple round-robin.
