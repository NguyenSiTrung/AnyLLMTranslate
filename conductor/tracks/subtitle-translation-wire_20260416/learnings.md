# Track Learnings: subtitle-translation-wire_20260416

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

### Subtitle & Interception (most relevant)
- postMessage bridge uses channel `'anyllm-translate'` + `requestId` correlation for MAIN ↔ ISOLATED world communication. Both interceptors (XHR + fetch) block handlers until `SUBTITLE_TRANSLATED` with matching `requestId` arrives.
- Fetch interceptor must call `response.clone()` before `.text()` — body can only be consumed once.
- XHR `responseText` override via `Object.defineProperty` needs `configurable: true` for reassignment.
- CORS bypass for subtitle fetching: direct fetch first, fallback to `chrome.runtime.sendMessage` via background worker.

### Architecture (critical for this track)
- `handleTranslateSubtitle` in `services/background.ts` is fully implemented with cache read/write — no changes needed.
- `lib/subtitleBuilder.ts` exports `buildBilingualVTT(cues, options)` and `buildTranslationOnlyVTT(cues)` — use these, don't reimplement.
- `content/messageBridge.ts` `sendTranslatedSubtitle()` is defined but never called — this track makes the first call site.
- `loadSettings()` is a `chrome.*` API — only callable from ISOLATED world content scripts (coordinator is in ISOLATED world ✅).

### Cache Integration
- `getCachedTranslation` returns `null` on miss — the background `handleTranslateSubtitle` already handles this internally.

### Testing Patterns
- Mock `chrome.runtime.sendMessage` with `.mockResolvedValue(...)` — content scripts call `.catch()` on the result.
- Module-level state persists across tests — reset coordinator state in `beforeEach` via `resetCoordinatorState()`.

---

<!-- Learnings from implementation will be appended below -->
