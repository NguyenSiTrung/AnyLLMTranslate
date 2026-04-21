# Hardening & Fixes — Specification

## Track: `hardening-fixes_20260421`
**Type:** Hardening  
**Priority:** High  
**Estimated Effort:** 6 hours

---

## Problem Statement

A comprehensive audit of the AnyLLMTranslate codebase revealed critical build blockers, runtime risks, and security gaps across multiple layers. The project currently has **18 TypeScript compilation errors** and **9 ESLint errors** that prevent a clean build. Beyond build issues, there are runtime bugs (hanging fetch requests, unreliable event dedup, race conditions), security gaps (plaintext API keys, permissive postMessage), and robustness concerns (MV3 service worker lifecycle, cache flush reliability).

---

## Goals

1. **Unblock the build** — zero TS and ESLint errors, all 569 tests pass.
2. **Harden runtime reliability** — timeouts, keep-alive, dedup, race condition fixes.
3. **Improve security posture** — API key encryption, postMessage origin validation, CSP.
4. **Ensure data integrity** — deep-merge all nested settings, fix cache flush race conditions.

---

## Non-Goals

- No new user-facing features.
- No UI redesigns.
- No new subtitle platform handlers.
- No migration of storage formats.

---

## Requirements (FR)

### Phase A — Build Blockers (Must Fix)

**FR-A1: TypeScript compilation clean**  
All `npm run compile` errors must resolve to zero. Specific errors:
- `vitest.setup.ts`: `defineContentScript` not on `globalThis` — add global declaration or cast.
- `content/subtitleControls.ts`: `DEFAULT_PREFS` missing `fontFamily`, `displayMode` required by `OverlayConfig`.
- `subtitleOverlay.test.ts`, `fetchInterceptor.test.ts`: missing `afterEach` / `afterAll` imports from `vitest`.
- `subtitleCoordinator.test.ts`: spread argument tuple errors — fix mock argument typing.
- `messageBridge.ts`: `resolve()` type mismatch with `unknown` — use proper generic constraint.
- `xhrInterceptor.ts`: `unknown` → `boolean` assignment — add explicit type guard.
- `ui-primitives.test.tsx`: `disabled` property on `HTMLElement` — cast to `HTMLButtonElement`.
- `options/App.tsx`: `useSettingsStore.subscribe()` called with 0 args in Zustand v5 — pass identity function.
- `config.test.ts`: partial `SubtitleSettings` missing new fields — fill all required fields.

**FR-A2: ESLint clean**  
All `npm run lint` errors must resolve to zero. Specific errors:
- `content/__tests__/inlineTranslate.test.ts`: remove unused `isInlineTranslating` import; fix 3 non-null assertions.
- `entrypoints/options/sections/InlineTranslateSection.tsx`: remove unused `Globe` import.
- `entrypoints/options/sections/SiteRulesSection.tsx`: replace 2 `any` types with proper types; fix 2 non-null assertions.

### Phase B — Runtime Reliability (Must Fix)

**FR-B1: Fetch timeout in OpenAICompatibleService**  
Add an `AbortController` with configurable timeout (default 60s) to `fetchCompletion()`. If timeout fires, reject with a clear error message. If the request succeeds before timeout, clean up the AbortController.

**FR-B2: MV3 service worker keep-alive during translation**  
During active translation sessions (when `activeSessions` Map is non-empty), create a `chrome.alarms` ping every 20 seconds to prevent the service worker from being killed mid-translation. Clear the alarm when the last session completes.

**FR-B3: Harden postMessage bridge origin**  
The `sendMessage` function in `inject/messageBridge.ts` currently sends to `'*'`. Tighten to `window.location.origin`. The `onMessage` listener already validates `event.origin`, but the send side is permissive.

**FR-B4: Cache LRU flush reliability**  
- Flush pending LRU updates on `beforeunload` event in content script (fire-and-forget `chrome.runtime.sendMessage`).
- Reduce debounce from 500ms to 100ms to reduce window of loss.
- Add a mutex flag in `flushLruUpdates` to prevent overlapping async flushes.

**FR-B5: Inline translate event dedup reliability**  
Replace the `WeakSet<Event>` dedup in `content/inlineTranslate.ts` with a `Map<string, number>` keyed by `event.timeStamp + event.key` with 50ms expiry. WeakSet is unreliable because KeyboardEvents are GC'd immediately after the event cycle.

### Phase C — Security (Must Fix)

**FR-C1: API key encryption at rest**  
Before storing the API key in `chrome.storage.local`, encrypt it using `crypto.subtle.encrypt` with a key derived from a device-bound salt + extension ID. Decrypt on read in `loadSettings()`. Use AES-GCM. The encryption key is derived via PBKDF2 from a static salt + `chrome.runtime.id`. This is obfuscation-level security (not true secret management) but prevents casual plaintext exposure.

**FR-C2: Content Security Policy in manifest**  
Add a `content_security_policy` to the WXT manifest config that restricts:
- `script-src` to `'self'`
- `connect-src` to `'self'` and the configured provider base URL (use `upgrade-insecure-requests`)
This prevents injected scripts from making unexpected network calls.

### Phase D — Data Integrity (Should Fix)

**FR-D1: Deep-merge all nested settings**  
`lib/config.ts` `loadSettings()` currently only deep-merges `provider` and `inlineTranslate`. It must also deep-merge `subtitleSettings`. Any nested partial update from `chrome.storage.onChanged` must not drop sibling fields.

**FR-D2: Rate limiting on translation requests**  
In `services/background.ts`, add a semaphore limiting concurrent translation requests to 3. Additional requests queue with a max queue size of 10; reject with a clear error if queue is full. This protects the user's LLM endpoint from accidental overload.

**FR-D3: Tighten `isOnWatchPage()` generic fallback**  
The current generic fallback in `content/subtitleCoordinator.ts` matches any page with exactly one `<video>` element. This incorrectly matches listing pages with autoplay thumbnails. Remove the generic fallback and default to `false` for unknown platforms. Only known platforms (youtube, udemy, coursera) get explicit watch-page detection.

---

## Out of Scope

- Adding ARIA live regions (quick polish, can be deferred).
- Creating the missing sidePanel entrypoint (feature work).
- LLM response JSON schema validation (nice-to-have heuristic).
- DOM mutation dedup O(n^2) optimization (acceptable for current scale).
- Service worker config freeze during in-flight translations (architectural complexity not justified by current risk).

---

## Acceptance Criteria

1. `npm run compile` exits with code 0.
2. `npm run lint` exits with code 0.
3. `npm test` — all 569 tests pass (existing) + new tests for timeout, encryption, rate limiting.
4. `npm run build` — production build succeeds without errors.
5. No regressions in existing functionality: popup, options page, page translation, subtitle translation, inline translate.

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Encryption changes break settings for existing users | Decrypt attempt first; if decryption fails (e.g., missing salt), treat as plaintext and re-encrypt on next save. Backward compatible. |
| AbortController not supported in all test environments | Mock `AbortController` in vitest.setup.ts for jsdom. |
| Rate limiting breaks batched subtitle translation | Limit applies per `handleTranslate` / `handleTranslateSubtitle` call, not per cue. Chunked subtitle processing stays within limits. |
| CSP blocks legitimate fetches | `connect-src` uses `'self'` which allows extension origin + dynamically allow provider base URL via `chrome.webRequest` or keep it permissive with `https:` for MVP. Use `https:` wildcard for MVP to avoid breaking user-configured endpoints. |
