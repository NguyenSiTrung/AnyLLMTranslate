# Track Learnings: manifest-subtitle-access_20260624

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

Relevant patterns from `conductor/patterns.md` primed for this track:

### Interception & Bridge (directly reused)
- WXT MAIN world injection uses `world: 'MAIN'` and `run_at: 'document_start'` in wxt.config.ts for XHR/fetch access. New MSE interceptor lives in the same MAIN-world entrypoint.
- postMessage bridge uses channel identifier (`anyllm-translate`) with **origin validation as the FIRST guard** in MAIN-world listeners and `requestId` correlation for MAIN ↔ ISOLATED communication. All new bridge messages (`SUBTITLE_TRACKS_DISCOVERED` manifest variant, `SUBTITLE_TEXTTRACK_CUES`, `SUBTITLE_MSE_CUES`) must follow this.
- `FetchInterceptor` captures `window.fetch` at module load — tests must mock `window.fetch` **before** dynamic import. Same applies to `MediaSource`/`SourceBuffer` mocking for the MSE interceptor.
- Fetch interceptor must call `response.clone()` before `.text()` — Response body can only be read once. Reuse this pattern for manifest cloning.
- **Interceptor enable/disable: capture originals into instance fields.** `disable()` must restore only when identity-equal to its own patch; capture/restore prototype methods, not just reset globals. Avoids double-wrapping on disable→enable cycles (BFCache). Apply identically to `mseInterceptor`.
- **BFCache interceptor lifecycle:** `pagehide` (always) to disable, `pageshow` (with `event.persisted`) to re-enable. Both `mseInterceptor` and any new manifest-detection paths must follow.
- Background service worker's `SUBTITLE_ALLOWLIST` must include CDN domains to permit CORS-bypass subtitle downloads. Manifest segment fetches reuse this — may need to add Max CDN hosts.
- **URL allow-list hostname validation:** Parse URL → validate protocol (HTTP/S only) → block private IPs/localhost → match hostname-only with end-anchored regex. Reuse for manifest + segment fetches (no new SSRF surface).
- jsdom `XMLHttpRequest` fires real `readystatechange` events — use spies to capture handlers when testing interceptors.

### Subtitle Parsing (extend)
- DOMParser (browser API) for XML parsing (YouTube srv3) — no external parser needed. Reuse for DASH `.mpd` parsing.
- BOM marker (`\uFEFF`) handling in subtitle parsers — strip before parsing. Apply to VTT segment concatenation.
- Format detection heuristics: WEBVTT header, sequence number pattern, comma vs period in timing. Reuse for MSE segment detection.

### Coordinator & Testing (extend)
- Subtitle coordinator tests: `vi.resetModules()` before dynamic import in `beforeEach`, then call `startCoordinator()` explicitly; capture listener handlers in module-level vars from mock factories.
- Use shared `lib/findPrimaryVideo()` for consistent video selection.
- Monotonic session id (captured at request issue, re-checked at response) drops stale async writes after a state reset — apply to the new precedence state.

### Architecture
- WXT uses `entrypoints/` for entrypoints; other code at project root (`lib/`, `types/`, `services/`, `content/`, `inject/`). New pure parsers go in `lib/`; MSE interceptor in `inject/`.
- Background service worker is stateless per-session (tab states in memory Map, recreated on SW restart). Cache is persistent via IndexedDB.

---

<!-- Learnings from implementation will be appended below -->
