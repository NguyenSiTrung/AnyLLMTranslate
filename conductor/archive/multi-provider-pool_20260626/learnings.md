# Track Learnings: multi-provider-pool_20260626

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

Seeded from `max-rpm_20260624`, `openai-provider-catalog_20260623`, and `langflow-provider_20260513`
(the three most relevant archived tracks), plus `conductor/patterns.md`.

### The single seam — `initService()` + `fetchWithRetry()` (THE load-bearing context)
- **`initService()`** (`services/background.ts:232`) is the ONLY place the translation service singleton
  is constructed/held and reconfigured. Today: lazily creates `OpenAICompatibleService`, hot-applies
  via `updateConfig(config)` when `preset` unchanged, recreates when `preset` changes. Live re-init on
  `onSettingsChange` → `initService()` (`services/background.ts:1217`) and the `updateSettings` message
  handler (`services/background.ts:1123`).
- **`fetchWithRetry()`** (`services/openaiCompatible.ts:321`) is the single network chokepoint — the
  one `fetch()` (`:361`) every provider call funnels through (translate, subtitle, selection,
  testConnection, detectPageCategory, classifyPdfParagraphs). API key read at `:353`
  (`Bearer ${this.config.apiKey}`). RPM `acquire()` at `:328` as the very first line, before
  timeout/retry logic.
- **The coordinator hangs off `initService()`** — return the `ProviderPoolCoordinator` instead of a
  bare service, and ALL seven call paths (page, subtitle, PDF, selection, hover, inline,
  category-detect) are covered in one place. No per-path changes needed.

### `TranslationService` interface (drop-in contract for the coordinator)
- Interface in `services/base.ts:12` — `translate(request): Promise<TranslationResult>`,
  `testConnection()`, optional `detectPageCategory?`, optional `classifyPdfParagraphs?`.
- `initService()` return type today is `TranslationService & { updateConfig(config): void }` — the
  coordinator must implement this surface (replace `updateConfig` with `rebuild(settings)` or keep
  `updateConfig` and have it internally rebuild from settings).
- `buildSystemPrompt()` / `buildUserPrompt()` / `parseTranslationResponse()` in `base.ts` are
  provider-agnostic and reusable per member service.
- `validateProviderConfig(config)` in `base.ts:214` checks baseUrl protocol + apiKey + model — reuse
  per member.

### Pure helpers at seams (the dominant codebase pattern — MIRROR THIS)
- **Pure, dependency-free helper modules are the preferred shape** for new logic. `createSemaphore()`,
  `getProviderReadiness()`, `resolveEffectiveKnobs()`, `lib/rateLimiter.ts` — all testable without
  chrome API mocking. **`lib/poolCursor.ts`, `lib/circuitBreaker.ts`, `lib/poolResolver.ts` must follow
  this pattern** (pure logic, injectable clock for `Date.now`).
- **`createSemaphore()` factory** (`services/background.ts:109`) returns an object with
  `acquire()`/`release()`/state-access methods + `__resetSemaphoreForTest` / `__stateForTest` exports
  for deterministic tests. Mirror this for the coordinator's test hooks.

### Rate limiter (already per-instance-friendly — cheap to fork per key)
- **`lib/rateLimiter.ts`**: pure `createRateLimiter(maxRpm)` factory, sliding window of `number[]`
  timestamps, `WINDOW_MS = 60_000`. `cap <= 0` → unlimited no-op fast-path. `OpenAICompatibleService`
  constructs one limiter per instance (`openaiCompatible.ts:44`) → **each member service in the pool
  already gets its own limiter for free**; just configure from `key.maxRpm`.
- **Fake-timer-friendly `delay()` helper**: `lib/subtitleRetry.ts` wraps `setTimeout` so Vitest fake
  timers work. Mirror — do NOT use inline `await new Promise(r => setTimeout(r, n))`.
- **`vi.useFakeTimers()` / `vi.useRealTimers()` per test**; `vi.clearAllMocks()` resets implementations
  but NOT module-level variables.
- **CRITICAL: `vi.advanceTimersByTimeAsync()` (not `vi.advanceTimersByTime()`)** when concurrent async
  code creates new timers during the advance — the async variant flushes microtasks between timer
  firings so re-entrant `delay()` calls fire within the same advance.

### Settings plumbing (4-place edit for any new nested field)
- **Adding `providers[]` to `ExtensionSettings` requires updating `extractSettings()` in
  `stores/settingsStore.ts`** — otherwise it silently drops and never surfaces. Enumerate every field.
- **Update `DEFAULT_SETTINGS` in `types/config.ts` together with the interface.**
- **`deepMerge` for nested settings** applies at `loadSettings()`, `updateSettings()`, AND
  `chrome.storage.onChanged`. `deepMerge(DEFAULT_SETTINGS, newVal)` needs
  `as unknown as Record<string, unknown>` → `as unknown as ExtensionSettings` casts (no index signature).
- **`initStorageSync` masking (`'***'`)** at `settingsStore.ts:92` strips `provider.apiKey` on
  cross-context change then async-reloads to decrypt — must extend to `providers[].keys[].apiKey`.

### Encryption (per-key loop needed)
- **AES-GCM per-install salt** in `lib/crypto.ts`: `encryptApiKey(plaintext)` → `'enc:' + base64`;
  `decryptApiKeyResult(value)` → `{ value, ok, encrypted }` (tries per-install salt then legacy static).
- `saveSettings`/`loadSettings` (`lib/config.ts:50,78`) currently encrypt/decrypt ONLY `provider.apiKey`
  — must loop over `providers[].keys[]` calling the same functions.
- Undecryptable → blank the key + flag (mirrors current single-key recoverable behavior at `config.ts:50`).

### Catalog + provider UI (reuse for the manager)
- **`OPENAI_COMPATIBLE_CATALOG`** in `lib/openAiCompatibleCatalog.ts` (9 entries). `filterCatalog(q)`,
  `getCatalogEntryById(id)`. Catalog `id` is NOT persisted into `ProviderPreset` (preset stays
  `'custom'`) — selection patches baseUrl/displayName/model.
- **`resolveCatalogSelection(entry, current)`** preserves API key when picking a catalog entry.
- **`ProviderCatalogPicker`** + **`ModelPicker`** components reuse directly.
- **`listProviderModels({baseUrl, apiKey})`** in `services/providerTester.ts` GETs `/models`.
- **`providerTester.testConnection`** has 3-step flow (ping, models, translation) — used by
  ProviderSection directly (bypasses the background service).

### Network failure model (for circuit-breaker classification)
- **Custom `ApiError` class with `statusCode`** (`services/openaiCompatible.ts:25`) beats string
  matching: `error instanceof ApiError && error.statusCode === 429`. **Use this in the breaker's
  failure classifier.**
- **Existing backoff in `fetchWithRetry`**: `500 * Math.pow(2, attempt - 1)`, retries 5xx + network
  errors, fail-fast on 4xx (throws `ApiError`). **The circuit breaker is a SEPARATE layer** that
  sits at the coordinator level above this — distinct from per-call retry/backoff inside a slot.
- **`response_format` 400 → auto-retry without it** (`openaiCompatible.ts:392`) — this is per-call,
  stays inside the member service; the breaker should NOT trip on it (it self-heals).

### Options UI card patterns (model the manager on these)
- **Cache config card in `AdvancedSection.tsx`** is the closest analog: local `useState` seeded from
  settings, `useEffect` re-seeds on settings change, blur handler validates + `updateSettings()` only
  if changed + valid, toasts on success.
- **Number inputs return strings** — convert with `Number()` before setting state.
- **Validation on blur (not on change)** allows free typing.
- **`Input` component has no `label` prop** — add manual `<label>` via `FieldGroup` with `htmlFor`.
- **Destructive list actions** use `pendingDeleteId` state + `Modal` confirmation — never delete on click.
- **Export/import object in `AdvancedSection`** is hand-built field-by-field — add new fields there too.

### Provider readiness (aggregate for popup)
- **`getProviderReadiness()`** is a pure discriminated union (`status`, `reason`, `canTest`,
  `canTranslate`) in `lib/providerReadiness.ts` — aggregate member statuses: not-configured if pool
  empty; `error` if all keys invalid; `success` if ≥1 healthy key.
- **`getConnectionErrorMessage()`** classifies error strings (timeout, 401/403, 404/model, network).
- **Provider `connectionStatus` must reset to `'unknown'` on any field edit.**

### Testing conventions
- **Validator order: `tsc` (`pnpm compile`) → `eslint` → `vitest` → `wxt build`** — cheapest first.
- **Storage mocks need settings nested under `'anyllm-translate-settings'`** key (not direct keys).
- **Mock factories must export the new symbol name** — when `config.ts` switches from `decryptApiKey`
  to `decryptApiKeyResult`, mock must export the new name or `loadSettings` crashes.
- **`vi.resetModules()` before dynamic import in `beforeEach`**, capture listener handlers in
  module-level vars.

### Conventions
- **ESLint** `no-non-null-assertion` (forbids `handler!()`), `no-dynamic-delete` (forbids
  `delete obj[key]` — use `Object.fromEntries(filter)`), `varsIgnorePattern` (underscore unused).
- **Named exports only.** **UI components live at project root `ui/`** (not `entrypoints/`); import
  via `@/ui/ComponentName`.
- **All extension identifiers use `anyllm-` prefix** — never `lingua*`.

### Gotchas to watch
- **`initService` bridges top-level settings into provider config** via
  `const config = { ...settings.provider, maxRpm: settings.maxRpm }` — when reading per-key maxRpm,
  pull from `key.maxRpm`, NOT the global.
- **esbuild parser can fail on inline JSON string literals containing `}` inside object literal
  contexts** — use `const content = JSON.stringify(...)` instead of inlining.
- **Vitest may surface pre-existing `usePdfDownload` teardown error after full suite** — pre-existing,
  not introduced by new work.

---

<!-- Learnings from implementation will be appended below -->

## [2026-06-26 17:32] - Phase 1 Task 1.1/1.2/1.3: Data Model & Migration
- **Implemented:** PoolKey/PoolProvider types, providers[] on ExtensionSettings,
  legacy→pool migration in loadSettings, per-key AES-GCM encryption loop in
  save/load, initStorageSync nested-key masking, poolIdGenerators export.
- **Files changed:** types/config.ts, stores/settingsStore.ts, lib/config.ts,
  lib/__tests__/configMigration.pool.test.ts (new), stores/__tests__/settingsStore.test.ts
- **Commits:** 1ba2f8b, 3d72931, 484302d
- **Learnings:**
  - **Pattern (loadSettings decrypt ordering):** `decryptApiKeyResult` is called
    once for the legacy `provider.apiKey` *before* the per-key pool loop. When
    writing tests with `mockResolvedValueOnce`, the FIRST call is the legacy
    mirror — account for it or the offsets shift by one and k2 gets k1's mock.
  - **Pattern (saveSettings always encrypts legacy mirror):** `encryptApiKey` is
    always called ≥1 time (for `provider.apiKey`, even when empty). To assert
    "no per-key encryption happened on an empty pool", filter mock.calls by
    non-empty string, don't assert `not.toHaveBeenCalled()`.
  - **Gotcha (deepMerge + providers):** `deepMerge(DEFAULT_SETTINGS, stored)`
    merges `providers[]` element-wise by index (arrays are positionally merged,
    not replaced). The default empty `providers: []` means a stored `[{...}]`
    becomes `[{...merged with default-empty-obj}]` — fine because PoolProvider
    fields are scalars/arrays. If a deep nested key were partial, the merge
    would still work since DEFAULT has no providers to seed from.
  - **Pattern (pool id stability):** `crypto.randomUUID()` is available in the
    extension service worker + browser contexts. Wrapped in try/catch with a
    Date/Math.random fallback for the Vitest jsdom env (no crypto.randomUUID
    in older Node).
---

## [2026-06-26 17:37] - Phase 2 Task 2.1/2.2/2.3: Pure Coordination Libraries
- **Implemented:** lib/poolCursor.ts (round-robin cursor), lib/circuitBreaker.ts
  (per-key health tracker), lib/poolResolver.ts (flatten + filter pool).
- **Files changed:** lib/poolCursor.ts, lib/circuitBreaker.ts, lib/poolResolver.ts,
  + 3 new test files (42 new tests total).
- **Commits:** c1a8279, 077259a, ae766dd
- **Learnings:**
  - **Pattern (injectable clock):** All three pure modules accept `clock?: () => number`
    (breaker) or an explicit `now` argument (resolver) instead of calling `Date.now()`
    directly. Tests pass an explicit `now` for determinism — no `vi.useFakeTimers`
    needed for unit logic (only the eventual coordinator test that exercises
    `RateLimiter` delays will need fake timers, since rateLimiter owns its own setTimeout).
  - **Pattern (escalation ladder):** The breaker's cooldown escalates by indexing
    a fixed `[60s, 120s, 300s]` ladder by `min(consecutiveFailures-1, len-1)` —
    simpler/safer than `cap * 2^n`. Cap is the last ladder entry.
  - **Pattern (lazy rejoin):** `isHealthy(id, now)` checks `now >= openUntil` at
    read time rather than scheduling a setTimeout to clear `open`. This is the
    NFR-6 SW-restart-safe property — no in-memory timer dependency, just an
    absolute wall-clock timestamp compared on every read.
  - **Pattern (auth ≠ escalation):** auth failures set a FIXED long-open (1h) and
    the credentialInvalid flag, but do NOT increment the rateLimit escalation
    counter — they're orthogonal failure modes. recordSuccess clears both.
  - **Gotcha (cursor position preservation):** `setSlotCount(n)` must keep the
    relative rotation position; modulo the new count so a live rebuild doesn't
    skew the round-robin (e.g., always dispatching to slot 0 after rebuild).
  - **Pattern (PoolSlot carries resolved ProviderConfig):** The resolver merges
    provider fields + the key's apiKey/maxRpm into a ready-to-construct
    ProviderConfig per slot — the coordinator just maps slot→OpenAICompatibleService
    without re-deriving config.
---

## [2026-06-26 17:42] - Phase 3 Task 3.1/3.2/3.3: ProviderPoolCoordinator
- **Implemented:** services/providerPool.ts — ProviderPoolCoordinator implementing
  TranslationService (translate, testConnection, detectPageCategory,
  classifyPdfParagraphs) with round-robin + circuit-breaker failover.
- **Files changed:** services/providerPool.ts (new), services/__tests__/providerPool.test.ts (new, 19 tests).
- **Commits:** bc6955e
- **Learnings:**
  - **Pattern (ServiceFactory identity arg):** The coordinator's service factory
    receives `(config, {keyId, providerId})` as a second arg. The production
    OpenAICompatibleService factory ignores it, but tests inject a stub factory
    that uses the keyId to register the stub in a Map for later outcome-injection.
    Without the identity arg, tests can't correlate which slot a member belongs to.
  - **Pattern (rebuild diff = member reuse):** `rebuild()` diffs new slot keyIds
    against existing members; shared keyIds KEEP their member instance (breaker
    state + rate limiter window survive), only new keyIds construct fresh services,
    removed keyIds are dropped from the Map. This is the FR-6 "preserve breaker
    state where key identity unchanged" requirement.
  - **Gotcha (test instrumentation ≠ source of truth):** A test's accumulating
    `stubs` Map logs every factory call ever made, so `stubs.has('k2')` stays true
    even after k2 is dropped from the coordinator. Assert current membership via
    `getAllKeyStatuses()` (the coordinator's live view), NOT via test-local logs.
  - **Spec-clarification (400 = no failover):** FR-4 says "Other 4xx → error
    surfaces" — a 400 is request-specific (bad prompt), NOT a slot fault, so the
    coordinator re-throws immediately WITHOUT opening the breaker or failing over.
    Only 429/5xx/network/auth trigger failover. The initial test expected k2
    failover on 400; corrected to expect the 400 to surface.
  - **Pattern (bounded failover via healthy-slot count):** The failover loop is
    bounded by `healthy.length` (the count of healthy slots AT DISPATCH TIME),
    guaranteeing termination. After each failure, recompute `healthySlots()` and
    bail with PoolExhaustedError if empty — prevents an infinite loop if every
    slot fails on the same request.
---

## [2026-06-26 17:50] - Phase 4 Task 4.1/4.2: Background Wiring
- **Implemented:** initService() returns ProviderPoolCoordinator; error surfacing
  verified for empty-pool + all-open scenarios.
- **Files changed:** services/background.ts, types/config.ts (DEFAULT_SETTINGS
  now seeds one default pool provider), services/__tests__/background.translate.test.ts.
- **Commits:** be71a10, d5f7609
- **Learnings:**
  - **CRITICAL Pattern (default-pool seeding for backward compat):** A brand-new
    install with DEFAULT_SETTINGS must have at least ONE pool slot or the
    coordinator throws PoolExhaustedError on every call. The early-return path in
    `loadSettings` (when no stored settings exist) returns `{...DEFAULT_SETTINGS}`
    directly, BYPASSING migration. So `DEFAULT_SETTINGS.providers` MUST seed a
    default provider+key — leaving it empty broke all background tests that rely on
    a fetch being attempted with default config. The fix: ship one default pool
    entry mirroring the legacy default provider.
  - **Pattern (TS narrowing on `let` module vars):** `if (translationService
    instanceof X) { translationService.method() }` does NOT narrow when
    `translationService` is a `let` module variable (its type could change between
    the check and the call due to re-entrancy). Assign to a `const` local first:
    `const existing = translationService; const coord = existing instanceof X ?
    existing : new X();` — the const narrows correctly.
  - **Pattern (error surfacing is free):** PoolExhaustedError propagates through
    the coordinator's translate() uncaught, and handleTranslate's existing
    try/catch converts any thrown error into `{success:false, error}`. No new
    error-surfacing code needed — just tests to verify the path.
  - **Gotcha (import cleanup):** Removing `new OpenAICompatibleService(...)` from
    initService left the `OpenAICompatibleService` import + `ProviderConfig` type
    import unused. ESLint would flag these; remove them when refactoring the seam.
---
