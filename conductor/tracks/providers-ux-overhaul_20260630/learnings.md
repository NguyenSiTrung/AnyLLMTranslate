# Track Learnings: providers-ux-overhaul_20260630

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

Seeded from `multi-provider-pool_20260626`, `openai-provider-catalog_20260623` (the two most
relevant archived tracks), plus `conductor/patterns.md`.

### The Providers tab surface — the heart of this track
- **`ProvidersSection.tsx` (806 lines)** is the single file for almost every change in this track.
  Contains: pool readiness banner, empty state, `providers.map(...)` collapsible cards, the global
  System Prompt editor, `KeyRow` (per-key UI), `ProviderConnectionTest`, `AddProviderModal`,
  `useConnectionTest` hook, and exported helpers `countEnabledKeys` / `getPoolReadiness`.
- **`useConnectionTest` (`ProvidersSection.tsx:515-545`)** stores results in `useState` only —
  ephemeral, lost on collapse/navigate. FR-1 makes these durable on the pool model.
- **`getCredentialKey(provider)` / `canRunConnectionTest(provider, key)`** (`:488-513`) are the
  existing gate predicates for the provider-level test; reuse for the "Test all" aggregate.

### Pool data model (must extend for FR-1)
- **`PoolProvider` / `PoolKey`** in `types/config.ts:54-77, 36-47`. Today `PoolKey` has
  `id`, `apiKey`, `maxRpm`, `enabled`, optional `label`. Adding optional `lastTestResult` is
  backward-compatible (migration-tolerant via deep-merge).
- **`connectionStatus` ('unknown'|'success'|'error')** exists only on the legacy `ProviderConfig`
  (`types/config.ts:28`), NOT on `PoolProvider`. The pool has no persisted test state today — this
  track adds it.
- **`DEFAULT_SETTINGS`** (`types/config.ts:403-463`) ships one default pool provider `p_default`
  with key `k_default`. New optional fields need no default change.

### Settings plumbing (4-place edit for any new nested field) — CRITICAL
- Adding a nested field requires updating **`extractSettings()` in `stores/settingsStore.ts`** —
  otherwise it silently drops and never surfaces. Enumerate every field.
- **`deepMerge`** applies at `loadSettings()`, `updateSettings()`, AND
  `chrome.storage.onChanged` (`lib/config.ts`). `deepMerge(DEFAULT_SETTINGS, newVal)` needs
  `as unknown as Record<string, unknown>` → `as unknown as ExtensionSettings` casts.
- **`initStorageSync` masking (`'***'`)** at `settingsStore.ts:92` strips `provider.apiKey` on
  cross-context change then async-reloads to decrypt — already extended to
  `providers[].keys[].apiKey`. `lastTestResult` carries NO secret, so it must stay OUT of the
  `encryptPoolKeys`/`decryptPoolKeys` loops.

### Encryption (per-key loop) — do NOT encrypt lastTestResult
- **AES-GCM per-install salt** in `lib/crypto.ts`: `encryptApiKey(plaintext)` → `'enc:' + base64`.
- `saveSettings`/`loadSettings` (`lib/config.ts:50,78`) loop over `providers[].keys[]` calling the
  same encrypt/decrypt functions for `apiKey`. Keep `lastTestResult` out of these loops — it is
  plaintext metadata.

### Catalog + provider UI (reuse for FR-2 / FR-5)
- **`OPENAI_COMPATIBLE_CATALOG`** in `lib/openAiCompatibleCatalog.ts` (9 entries). `filterCatalog(q)`,
  `getCatalogEntryById(id)`. Catalog `id` is NOT persisted into `ProviderPreset` (preset stays
  `'custom'`) — selection patches baseUrl/displayName/model/requiresApiKey.
- **`inferCatalogId(baseUrl)`** auto-detects the catalog entry from a pasted base URL — reuse for
  resolving `placeholder` / `getKeyUrl` in `KeyRow`.
- **`resolveCatalogSelection(entry, current)`** preserves the API key when picking a catalog entry.
- Each entry already has a **`placeholder`** field (e.g. `sk-or-...`, `gsk_...`) — FR-5 wires it into
  the key input instead of hardcoded `sk-...`.

### Pure helpers at seams (the dominant codebase pattern — MIRROR THIS)
- **Pure, dependency-free helper modules are the preferred shape** for new logic.
  `lib/rateLimiter.ts`, `lib/poolResolver.ts`, `lib/providerReadiness.ts` — all testable without
  chrome API mocking. The Phase 1 invalidation helper should follow this pattern.
- **Fake-timer-friendly `delay()` helper**: `lib/subtitleRetry.ts` wraps `setTimeout` so Vitest fake
  timers work for the "Test all" sequential run. Do NOT use inline
  `await new Promise(r => setTimeout(r, n))`.

### Readiness logic (drives banner copy)
- **`getPoolReadinessStatus(settings)`** + **`getPoolRecoveryMessage()`** in
  `lib/providerReadiness.ts` drive the banner title/description/action. The "Next: {action}" prefix
  at `ProvidersSection.tsx:221` is what FR-7/C5 refactors.
- **`getConnectionErrorMessage(error)`** maps provider errors to title/description/action — reuse
  for the persisted `lastTestResult.error` tooltip.

### Testing patterns (Vitest)
- Vitest `@/` alias needs `resolve.alias` in `vitest.config.ts` (tsconfig paths are not
  auto-resolved by Vite).
- `vi.advanceTimersByTimeAsync()` (not `vi.advanceTimersByTime()`) when concurrent async code
  creates new timers during the advance — relevant for the "Test all" sequential runner.
- Storage mocks need settings nested under the correct key (`anyllm-translate-settings`).
- **`entrypoints/options/__tests__/ProvidersSection.test.tsx`** (384 lines) is the comprehensive UI
  test — extend it for every behavioral change. Covers header/empty state, expand, add key, baseUrl
  edit, maxRpm clamp, show/hide key, toggle key, add-provider modal, remove confirm, readiness
  banner, catalog picker, browse models, sliders, connection-test progress, system prompt editor.

---

<!-- Learnings from implementation will be appended below -->
