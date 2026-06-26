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
