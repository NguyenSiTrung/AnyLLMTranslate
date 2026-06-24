# Track Learnings: max-rpm_20260624

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

The most relevant patterns from `conductor/patterns.md` for this track:

### Pure helpers at seams (the dominant pattern here)
- **Pure, dependency-free helper modules are the preferred shape** for new logic. `shouldAutoOpenPdf()`, `getProviderReadiness()`, `resolveEffectiveKnobs()`, `createSemaphore()` — all are testable without chrome API mocking. The RPM limiter (`lib/rateLimiter.ts`) follows this: pure logic, no chrome dependencies.
- **`createSemaphore()` factory** (`services/background.ts:109`) is the existing concurrency-limiter pattern to mirror: factory function returning an object with `acquire()`/`release()`/state-access methods, plus `__resetSemaphoreForTest` / `__stateForTest` exports for deterministic tests.

### Settings plumbing (4-place edit for any new field)
- **Adding a field to `ExtensionSettings` requires updating `extractSettings()` in `stores/settingsStore.ts`** — otherwise it silently drops and never surfaces through `useSettings()`. (from: theme-context_20260422, llm-category-detection_20260504)
- **Update `DEFAULT_SETTINGS` in `types/config.ts` together with the interface** — single source of truth for initial values. (from: phase3-ux-polish_20260410)
- **`deepMerge` for nested settings** (provider, subtitleSettings, inlineTranslate) — applies at `loadSettings()`, `updateSettings()`, AND `chrome.storage.onChanged` listeners. (from: hardening-fixes_20260421)
- **`deepMerge(DEFAULT_SETTINGS, newVal)` requires `as unknown as Record<string, unknown>` → `as unknown as ExtensionSettings` casts** because deepMerge's signature is `Record<string, unknown>` and `ExtensionSettings` lacks an index signature. Match the existing pattern in `loadSettings`. (from: audit-v2_20260623)
- **`ProviderConfig.requestTimeoutMs?: number` (optional)** at `types/config.ts:24` is the exact pattern to mirror for `ProviderConfig.maxRpm?` — optional field threaded into `OpenAICompatibleService` via `updateConfig`.

### Provider/service live-update
- **Provider config hot-applies on settings change via `onSettingsChange → initService()`** (`services/background.ts:1095`). A provider-level limiter reconfigured via `updateConfig(config)` takes effect on the next request with no service-worker restart. Mirrors how `requestTimeoutMs` is already threaded.

### Network chokepoint (where the limiter integrates)
- **`OpenAICompatibleService.fetchWithRetry`** (`services/openaiCompatible.ts:303`, the `fetch` at `:339`) is the single network chokepoint — the one `fetch` every provider call (translate, subtitle, selection, testConnection, detectPageCategory, classifyPdfParagraphs) funnels through. Placing `acquire()` here covers ALL call paths.
- **Custom error class `ApiError` with `statusCode`** beats string matching for retry logic (`error instanceof ApiError && error.statusCode >= 400`). (from: audit-v2_20260623)
- **Existing backoff in `fetchWithRetry`**: `backoff = 500 * Math.pow(2, attempt - 1)`, retries on 5xx + network errors, fail-fast on 4xx. The RPM limiter is a *prevention* layer that sits *before* this — distinct from retry/backoff.

### Fake-timer-friendly `delay()` helper
- **`lib/subtitleRetry.ts` uses a `delay()` helper wrapping `setTimeout`** so Vitest fake timers work deterministically. Mirror this in `lib/rateLimiter.ts` — do NOT use `await new Promise(r => setTimeout(r, n))` inline if you want fake-timer control.
- **`vi.useFakeTimers()` / `vi.useRealTimers()` per test** to manage timer state; `vi.clearAllMocks()` resets implementations but NOT module-level variables. (from: cache-hardening_20260415)

### Options UI card pattern (the model for the new card)
- **Cache config card in `AdvancedSection.tsx`** is the closest analog: local `useState` seeded from settings, `useEffect` re-seeds on settings change (handles reset/import), blur handler validates range and calls `updateSettings()` only if changed + valid, toasts on success. (from: cache-settings-ui_20260416)
- **Number inputs return strings** — convert with `Number()` before setting state. (from: cache-settings-ui_20260416)
- **Validation on blur (not on change)** allows users to type freely without immediate error feedback. (from: cache-settings-ui_20260416)
- **Export/import object in `AdvancedSection` is hand-built field-by-field** (`:38-64`) — a new settings field must be added there to survive export/import. (Note: `pdfSettings` is currently *missing* from this object — a pre-existing inconsistency; do not fix it in this track.)
- **`Input` component has no `label` prop** — must add manual `<label>` via `FieldGroup` with `htmlFor`. (from: cache-settings-ui_20260416)

### Testing
- **Validator execution order: `tsc` → `eslint` → `vitest` → `wxt build`** — cheapest checks fail fast first. (from: bilingual-display-ux_20260505)
- **`AdvancedSection.test.tsx`** already exercises range-validation + blur-write tests for `maxBatchChars`/`cacheTTL` — model the new field's tests on those. (from: cache-settings-ui_20260416)
- **Storage mocks need settings nested under `'anyllm-translate-settings'`** key (not direct keys) to avoid fallback defaults. (from: linkedin-subtitles_20260523)

### Conventions
- **ESLint `no-non-null-assertion`** forbids `handler!()`; **`no-dynamic-delete`** forbids `delete obj[key]`; **named exports only**; **`varsIgnorePattern`** allows underscore-prefixed unused vars. (from multiple tracks)
- **UI components live at project root `ui/`** (not `entrypoints/`); import via `@/ui/ComponentName`. (from: phase5-settings-ux_20260410)

---

<!-- Learnings from implementation will be appended below -->

## [2026-06-24 11:00] - Phase 1-5: Max RPM Rate Limiting
- **Implemented:** Sliding-window RPM rate limiter (lib/rateLimiter.ts), settings plumbing (maxRpm on ExtensionSettings + ProviderConfig), service integration (acquire() before fetch in fetchWithRetry), Options UI card
- **Files changed:** lib/rateLimiter.ts, lib/__tests__/rateLimiter.test.ts, types/config.ts, stores/settingsStore.ts, stores/__tests__/settingsStore.test.ts, services/openaiCompatible.ts, services/background.ts, services/__tests__/openaiCompatible.test.ts, entrypoints/options/sections/AdvancedSection.tsx, entrypoints/options/__tests__/AdvancedSection.test.tsx
- **Commits:** f71259b, e83d6fb, f59b4b9, 96a06f3, 6c47c6d
- **Learnings:**
  - Patterns: `vi.advanceTimersByTimeAsync()` must be used (not `vi.advanceTimersByTime()`) when concurrent async code creates new timers during the advance — the async variant properly flushes microtasks between timer firings so re-entrant `delay()` calls get their timers fired within the same advance
  - Gotchas: esbuild parser can fail on inline JSON string literals containing `}` inside object literal contexts — use a variable (e.g. `const content = JSON.stringify(...)`) instead of inlining `content: '{"a":{"b":1}}'` in mock objects
  - Gotchas: `initService` in background.ts passes `settings.provider` directly to the service — top-level settings fields like `maxRpm` need to be bridged with `const config = { ...settings.provider, maxRpm: settings.maxRpm }`
  - Context: The Rate Limiting card was inserted between Performance & Caching and Context & Intelligence, requiring stagger index shifts for all subsequent cards
  - Testing: 36 new tests added (15 rateLimiter + 5 settingsStore + 5 openaiCompatible + 10 AdvancedSection + 1 already counted)
---
