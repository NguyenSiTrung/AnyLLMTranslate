# Spec: Max RPM Rate Limiting (max-rpm_20260624)

> **User intent:** "handle feature settings to user can be set max RPM to avoid to many request to some provider has rate limits"

## Overview

Add a user-configurable **requests-per-minute (RPM)** rate limit so users pointing AnyLLMTranslate at a rate-limited provider (free-tier OpenAI, DeepSeek, Groq, shared gateways, etc.) can cap how many provider calls per minute the extension issues. This prevents hitting provider 429s and getting temporarily banned, and gives users explicit control over request pacing.

**Mechanism:** a **sliding-window RPM limiter** placed at the single network chokepoint (`OpenAICompatibleService.fetchWithRetry` — the one `fetch` every provider call funnels through), so it governs **every** provider request: page translation, subtitle chunks, text-selection translate, connection tests, LLM page-category detection, and PDF paragraph classification.

**Default:** OFF (`maxRpm: 0` = unlimited). Users opt in by entering a positive number.

**On-limit behavior:** silently **wait (queue)** the request until a slot frees in the rolling window — no user-facing error; translation simply flows a bit slower. Worst-case wait is bounded by the existing semaphore queue timeout (30s).

## Design Decisions (confirmed)

1. **Limit type:** RPM sliding window (track request-start timestamps in a rolling 60s window; request beyond cap waits until the oldest timestamp expires).
2. **Granularity:** Global, applied to all provider calls via the single network chokepoint (`OpenAICompatibleService.fetchWithRetry`).
3. **Default state:** OFF by default (`maxRpm: 0` = unlimited). Users opt in. Zero behavior change for local-LLM users.
4. **On-limit behavior:** Wait (queue) silently. No error surfaced; translation just flows slower. Bounded by the existing 30s semaphore queue timeout.
5. **UI location:** New "Rate Limiting" card in the Options → Advanced section (next to "Performance & Caching"). Reuses the established FieldGroup/Input/blur-validate/auto-save pattern.
6. **Popup control:** Options-only. RPM is a "set once and forget" power-user setting, not a per-session tweak.

## Functional Requirements

**FR-1 — Sliding-window RPM limiter (pure module).** Provide a pure, dependency-free rate limiter in `lib/rateLimiter.ts`:
- `createRateLimiter(maxRpm: number)` returns `{ async acquire(): Promise<void>; setMaxRpm(n): void; getMaxRpm(): number; __stateForTest?: { window: number[] } }`.
- Maintains a timestamp array of request-start times within a rolling **60-second** window.
- `acquire()`: before each request, prune timestamps older than 60s. If `window.length < maxRpm`, record `Date.now()` and resolve immediately. Otherwise compute the wait needed = `60000 - (now - window[0])`, `await delay(wait)`, then re-check (loop; the window may have shifted further by the time the timer fires).
- `maxRpm <= 0` is the **unlimited** fast-path: `acquire()` resolves synchronously with no timestamp tracking.
- Timestamp array is pruned on every `acquire` and capped to `maxRpm` length — bounded memory.
- `setMaxRpm` allows live reconfiguration without recreating the limiter (called from `onSettingsChange` → `service.updateConfig`).

**FR-2 — Integration into the network chokepoint.** Wire the limiter into `OpenAICompatibleService` (`services/openaiCompatible.ts`):
- The service holds a `private rateLimiter` instance, created in the constructor and reconfigured via the existing `updateConfig(config)` path (mirrors how `requestTimeoutMs` is already threaded).
- In `fetchWithRetry`, **before** the `fetch` call (and before constructing the AbortController timer, so the request-timeout clock doesn't start during the wait): `await this.rateLimiter.acquire()`.
- `maxRpm` flows `ExtensionSettings.maxRpm` → `ProviderConfig.maxRpm` → `initService()` → `OpenAICompatibleService` (mirror the existing `requestTimeoutMs` plumbing). Because `onSettingsChange` already calls `initService()` on every settings write, the new limit hot-applies on the next request with no service-worker restart.

**FR-3 — Settings plumbing.** Add `maxRpm` to the settings system in the four required places:
- `types/config.ts`: add `maxRpm: number` to `ExtensionSettings`; add `maxRpm?: number` to `ProviderConfig` (so it threads into the service); set `maxRpm: 0` in `DEFAULT_SETTINGS`.
- `stores/settingsStore.ts`: add `maxRpm` to `extractSettings()` (without this the field never surfaces through `useSettings()`).
- `entrypoints/options/sections/AdvancedSection.tsx`: add `maxRpm` to the export/import object (alongside `maxBatchChars`, `cacheTTLDays`, `maxCacheSizeMB`) so the setting survives export/import.

**FR-4 — Options UI: "Rate Limiting" card in Advanced section.** Add a new bordered `Card` titled "Rate Limiting" to `entrypoints/options/sections/AdvancedSection.tsx`, following the exact established pattern of the "Performance & Caching" card:
- One `FieldGroup` + numeric `Input` for `maxRpm`.
- Label: "Max requests per minute"; description: "Limit provider calls per minute to avoid hitting rate limits (0 = unlimited). Leave at 0 for local LLMs like Ollama/LM Studio."
- Local state seeded from settings, re-seeded via `useEffect` on settings change (handles reset/import).
- **Validation on blur:** must be an integer ≥ 0 and ≤ 600 (10/sec is a generous ceiling). Reject with a clear error string; do not write invalid values to the store.
- **Auto-save on blur** only if the value changed and is valid; toast "Auto-saved" via the existing pattern. `0` displays a hint "(unlimited)".

**FR-5 — Test coverage.** New tests for:
- `lib/__tests__/rateLimiter.test.ts` — pure logic: unlimited fast-path, immediate grants under cap, wait behavior at cap (fake timers), pruning of expired timestamps, live reconfigure via `setMaxRpm`, multiple concurrent `acquire()` calls serialize correctly.
- `services/__tests__/openaiCompatible.test.ts` (extend) — limiter is awaited before `fetch`; `maxRpm` flows from config; changing config calls `setMaxRpm`.
- `entrypoints/options/__tests__/AdvancedSection.test.tsx` (extend) — the new field validates range, writes on valid blur, rejects invalid input, and survives export/import round-trip.

## Non-Functional Requirements

- **NFR-1 — Bounded memory:** the timestamp array never exceeds `maxRpm` entries (pruned on every acquire).
- **NFR-2 — Bounded wait:** worst-case queue wait is bounded by the existing semaphore `QUEUE_TIMEOUT_MS` (30s); if that outer limit fires it surfaces the existing "Translation request timed out waiting in queue" error. The RPM limiter itself does not introduce a new timeout.
- **NFR-3 — No behavior change when OFF:** with `maxRpm: 0` (default), `acquire()` is a synchronous no-op — zero added latency, zero added memory. All 1482 existing tests must continue to pass unchanged.
- **NFR-4 — Fake-timer friendly:** `rateLimiter` must use a `delay()` helper that wraps `setTimeout` (same pattern as `lib/subtitleRetry.ts`) so Vitest fake timers work deterministically.
- **NFR-5 — Lint-clean:** no new lint errors introduced (follow `no-non-null-assertion`, named-exports-only conventions).
- **NFR-6 — Build size:** negligible (~1 new small module + wiring).

## Acceptance Criteria

- **AC-1:** With `maxRpm: 0` (default), the full existing test suite passes with zero changes and no measurable latency increase.
- **AC-2:** With `maxRpm: N`, issuing N+1 provider calls within 60 seconds causes the (N+1)th call to wait until a 60s window frees a slot — verifiable via `rateLimiter.test.ts` with fake timers.
- **AC-3:** Every provider call path (translate, subtitle chunk, text-selection, testConnection, detectPageCategory, classifyPdfParagraphs) is governed by the limiter, because they all route through `fetchWithRetry`.
- **AC-4:** The Options → Advanced page shows a "Rate Limiting" card with a validated numeric input; entering a value persists it to `ExtensionSettings.maxRpm` and hot-applies to the active service on the next request.
- **AC-5:** Invalid input (negative, non-integer, > 600, empty) is rejected with an inline error and is not written to storage.
- **AC-6:** Changing `maxRpm` in Options immediately takes effect without reloading the extension (via the existing `onSettingsChange → initService → updateConfig` path).
- **AC-7:** The setting survives export/import (included in the AdvancedSection export object).
- **AC-8:** `pnpm lint`, `pnpm compile` (tsc --noEmit), `pnpm test`, and `pnpm build` all pass.

## Out of Scope

- **Per-provider rate limits** — single global limit only (can be revisited later by moving `maxRpm` onto saved provider profiles).
- **Popup quick-toggle** — Options-only control.
- **429-retry/backoff on actual provider rate-limit responses** — this feature *prevents* hitting the cap; existing `fetchWithRetry` 5xx/network backoff is unchanged and 429 handling is a separate concern.
- **Per-call-type limits** (e.g. different RPM for subtitles vs page translation) — single global cap.
- **Visible "rate-limited" indicator** — limit is applied silently; the existing paragraph/subtitle spinners already convey "still working".
- **Concurrency-limit (`maxConcurrent`) configurability** — out of scope; only RPM is user-configurable here.
