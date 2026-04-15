# Track Learnings: cache-hardening_20260415

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

### Relevant from patterns.md

- **Cache architecture**: Background service worker is stateless per-session; cache is persistent via IndexedDB (`idb-keyval`). Cache key = `SHA-256(sourceLanguage:targetLanguage:text)`. (from: phase1-foundation_20260409)
- **Silent fail pattern**: `cacheTranslation()` and `getCachedTranslation()` use try/catch with silent fail — cache is best-effort, never breaks translation flow. Maintain this contract in all new code.
- **`promise.finally().catch()`**: Needed to suppress unhandled rejections when storing promises in Maps. Keep in mind for any dedup / in-flight tracking additions. (from: phase1-foundation_20260409)
- **Glossary pattern**: Pass `glossaryBlock || undefined` (not empty string) to preserve "no glossary" semantics. (from: glossary-wire_20260410)
- **Module-level state in tests**: `let isEnabled`, `let store` etc. persist across test cases — reset in `beforeEach`. Apply same discipline to `pendingLruUpdates` and `lruFlushTimer` test resets. (from: phase4-launch-ready_20260410)
- **Mock background storage**: `module-level mockStorage` in `background.test.ts` is shared — add cleanup in `beforeEach` to prevent pollution. (from: glossary-wire_20260410)
- **chrome.alarms**: Must be listed in manifest permissions. WXT manifest config is in `wxt.config.ts` under `manifest.permissions[]`. (from: phase4-launch-ready_20260410 — contextMenus pattern)
- **MV3 service worker restart safety**: `chrome.alarms` are registered in the browser and persist across SW restarts. Safe to call `chrome.alarms.create` with same name multiple times — use `chrome.alarms.get` first or handle duplicate gracefully.
- **Inspect LLM request body in tests**: `JSON.parse(fetchMock.mock.calls[0][1]?.body).messages[0].content`. (from: glossary-wire_20260410)

---

<!-- Learnings from implementation will be appended below -->
