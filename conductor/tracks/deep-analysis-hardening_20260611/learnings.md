# Track Learnings: deep-analysis-hardening_20260611

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

- Safe DOM construction: never use `innerHTML` with dynamic text; use `document.createElement` and `textContent`.
- postMessage bridge responses must preserve requestId correlation.
- MAIN-world XHR/fetch interception runs at `document_start` and must preserve native behavior on pass-through.
- Fetch interception must clone responses before reading body text.
- XHR `responseText` overrides require `Object.defineProperty` with `configurable: true`.
- Deep settings changes must update defaults, `loadSettings()`, `updateSettings()`, storage sync, and `extractSettings()` together.
- In-process semaphore uses max active slots plus a bounded queue; always release in `finally`.
- Debounced LRU writes use Map snapshot-and-clear to avoid races.
- Content-script re-injection guard uses `window.__anyllmTranslateInitialized`.
- Validator order: `tsc` → `eslint` → `vitest` → `wxt build` when build validation is needed.

## Seeded From Similar Tracks

### hardening-fixes_20260421

- AES-GCM encryption currently uses PBKDF2, random 12-byte IV, base64 payload, and `enc:` prefix for backward compatibility.
- All direct settings persistence should go through `lib/config.ts` so encryption is applied at load/save boundaries.
- `chrome.storage.onChanged` listeners should do synchronous merge for immediate UI, then async reload for decrypted fields.
- Queue timeout protects semaphore waiters from stalled requests across service worker lifecycle edge cases.
- Subtitle CORS bypass must validate URLs against a background allow-list before fetching.

### audit-fixes_20260503

- MV3 service worker termination can lose in-memory translation work; cleanup should be best-effort and graceful.
- Existing semaphore shape was previously validated as generally correct, so changes should target specific timeout/queue edge cases.
- Chrome alarms persist across MV3 service worker restarts and are the correct primitive for periodic or keepalive background work.
- Module-level state in tests should be reset explicitly with module resets or exported reset helpers.

---

## Learnings from Implementation

### Debug logging gate (Phase 1.5)

- Sensitive logs (LLM prompts/responses, page text, user content) must never appear in the default console. Gate them on a cached `settings.debugMode` read with a short TTL (5s) to avoid hitting chrome.storage on every LLM call. (services/debugLog.ts)
- The cached value must be invalidated on settings change so toggling `debugMode` takes effect on the next LLM call without waiting for TTL expiry. Wire the invalidation into `onSettingsChange()` in the same listener that re-inits the service. (services/background.ts)
- Default to `false` for the cached value before any chrome.storage read — this is the safe behaviour for synchronous log calls that fire before the async warmup completes. First-call logs are silently dropped, not thrown.
- The dev cycle for adding a new gated log: (1) replace direct `console.log` with `if (isDebugLoggingEnabled()) { ... }`, (2) write a test that mutes `console.log` and asserts no log line contains the sensitive text, (3) call `warmDebugCache()` at SW startup so the very first translation observes the user's preference.

### Origin validation (Phase 1.3-1.4)

- The `SUBTITLE_TRANSLATED` postMessage handlers in `FetchInterceptor` and `XhrInterceptor` were validating channel/type/requestId but NOT origin. Forged cross-origin messages could potentially pass the channel/type check and resolve the subtitle `Promise` with attacker-controlled VTT. Add `if (event.origin !== window.location.origin) return;` as the FIRST guard. (inject/fetchInterceptor.ts, inject/xhrInterceptor.ts)
- Existing `messageBridge.onMessage` already validated origin. The interceptors' inline listeners were the gap.
- Test helper that fires MessageEvents MUST set `origin: window.location.origin` (or whatever scenario origin) — leaving it `undefined` will silently fail origin checks and obscure bugs. (tests/unit/xhrInterceptor.test.ts)

### Parser ordering & glossary hardening (Phase 3.1-3.2)

- `parseTranslationResponse` already iterates `expectedIds` in order, so the Map insert order IS the expected order. The fix is regression coverage: a test that puts response keys in REVERSE order and asserts the result Map iteration matches `expectedIds`. (services/base.ts, services/__tests__/base.test.ts)
- Glossary CSV header detection originally only matched `source,target` column order. Users (and exporters like Google Sheets) sometimes produce `target,source` order. Loosen the detection to match either order — accept the column-swap data loss on that rare case rather than treating the row as data and producing a confusing entry. (lib/glossary.ts, lib/__tests__/glossary.test.ts)

### Audit: dead `originalHTML` capture (Phase 3.3)

- `TranslationPiece.originalHTML` was captured in `domWalker.ts` but read by nothing in the entire codebase. Restore is handled via `[data-anyllm-translated]`/`[data-anyllm-role="original"]` markers + `removeAllTranslations()` walking the DOM. The capture was true dead code. Remove from type, from producer, and from all test fixtures (5 fixtures across `entrypoints/__tests__/content.test.ts`).
- `textNodes` is similarly captured-but-unread, but the cost-benefit of removing it is much lower and the field is referenced by callers in case of future restore strategies — leave it as-is and document the finding.

### Deferred items — now IMPLEMENTED (follow-up session 2026-06-11)

The items below were originally deferred, then implemented in the same track on user request.

#### Per-install salt + recoverable decrypt (Phase 1.2)

- The AES-GCM key now derives from `chrome.runtime.id` + a per-install random 16-byte salt persisted under `STORAGE_KEYS.ENC_SALT`. Cache the salt in a module variable to avoid a storage read on every encrypt/decrypt; fall back to the legacy `STATIC_SALT` when `chrome.storage` is unavailable (tests). (lib/crypto.ts)
- Keep the `enc:` prefix unchanged. On decrypt, try the per-install salt first, then the static salt — AES-GCM's auth tag makes a wrong-salt attempt throw, so try-both is safe and lets legacy `enc:` values keep decrypting. They migrate to the per-install salt on the next `saveSettings()`. This avoided changing the prefix (which would have broken the existing `/^enc:/` round-trip assertion).
- New `decryptApiKeyResult()` returns `{ value, ok, encrypted }`. `loadSettings()` uses it to blank the key (recoverable not-configured state) when an encrypted value can't be decrypted, instead of using ciphertext as the key. `decryptApiKey()` stays as a thin wrapper (returns raw on failure) for backward compat with its existing test.
- Gotcha: `configMigration.test.ts` mocks `../crypto` — when `config.ts` switched from `decryptApiKey` to `decryptApiKeyResult`, the mock had to export the new name or `loadSettings` crashed on `undefined`.

#### Interceptor lifecycle idempotency (Phase 2.1-2.2)

- The real bug: `XhrInterceptor.disable()` reset `window.XMLHttpRequest` but never restored the patched `prototype.open/addEventListener/send`. A disable→enable cycle then captured the already-patched method as the "original" and double-wrapped, firing `bridge.send` twice. Fix: capture the originals into instance fields at `enable()` and restore them in `disable()`.
- `FetchInterceptor.disable()` restored `originalFetch` unconditionally, which would clobber any patch installed on top. Now it only restores when `window.fetch === this.patchedFetch`.
- `originalFetch` is captured as `window.fetch.bind(window)` at module load — so after disable, `window.fetch` is the *bound* original, NOT identity-equal to the test's `mockFetch`. Assert behavior (delegates to mock) rather than identity.

#### Semaphore queue timeout determinism (Phase 2.3-2.4)

- The original queue stored resolve *wrapper* closures, but the timeout tried `queue.indexOf(resolve)` on the bare resolve (never in the queue) — so a timed-out waiter's wrapper stayed queued. A later `releaseSemaphore()` shifted that dead wrapper and called it without decrementing `active`, leaking a slot until concurrency wedged at the cap.
- Fix: queue holds `SemaphoreWaiter { grant, settled }` objects. Timeout marks `settled` + removes the exact waiter; `releaseSemaphore()` skips settled waiters and transfers the slot to the next live waiter (active unchanged) or decrements when none remain. Exported `__resetSemaphoreForTest` / `__getSemaphoreStateForTest` for deterministic tests.

#### Subtitle session cleanup on restore/navigation (Phase 2.5)

- `activeSessions: Map<tabId, session>` + keep-alive alarm outlived `restore` and SPA navigation. Added `stopSubtitleSession(tabId)` that drains `session.queue` (the running async loop exits on its next `while` check), deletes the session, and clears the alarm.
- Wired into: the `restore` handler, a new `CANCEL_SUBTITLE_SESSION` message, and `chrome.tabs.onRemoved` (`initSubtitleSessionCleanup`, registered in the background entrypoint). The coordinator sends `CANCEL_SUBTITLE_SESSION` from the SPA navigation handler (guarded best-effort send) — deliberately NOT from `resetCoordinatorState()` since that runs in many tests' `beforeEach`.

### Test count delta

- Initial baseline: 858 tests / 64 files.
- After first pass (origin, debug-log, parser, originalHTML): 876 tests / 65 files.
- After deferred follow-up: 899 tests / 67 files (+23): 6 crypto/migration + 5 fetch/XHR lifecycle + 6 semaphore + 5 subtitle-session + 1 config blank-on-decrypt-failure.
- Validators: tsc clean, eslint 0 errors, build ~749KB.
