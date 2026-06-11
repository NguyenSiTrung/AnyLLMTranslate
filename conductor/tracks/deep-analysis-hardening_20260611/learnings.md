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

### Out-of-scope items (deliberately deferred)

- Phase 1.1-1.2 (per-install salt, recoverable decrypt failure) — touches the crypto path used by all settings; high blast radius, deferred to a focused follow-up track.
- Phase 2 (interceptor lifecycle idempotency, semaphore determinism, restore-navigates-subtitle-cleanup) — solid work, but each item is its own focused refactor. Defer to a follow-up to keep this track small.
- These remain in the plan.md for the next hardening iteration.

### Test count delta

- Before: 858 tests across 64 files
- After: 876 tests across 65 files (+18 net)
- New tests: 6 (debugLog) + 5 (glossary header variants) + 4 (parser ordering) + 2 (interceptor origin) + 1 (domWalker no-originalHTML)
- Updated fixtures: 5 (content.test.ts — originalHTML removed)
- Updated helper: 1 (xhrInterceptor.test.ts fireTranslatedMessage now sets origin)
