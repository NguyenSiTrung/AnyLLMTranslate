# Track Learnings: generic-subtitle-handler_20260702

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

### Subtitle Handler Architecture
- `SubtitleHandler` interface lives in `inject/subtitleHandlers/registry.ts`. Methods: `platform`, `detect()`, `getPatterns()`, `transformResponse()`, optional `getMetadataPatterns()` / `extractAvailableTracks()` / `getDomCueSource()` / `isWatchPage()` / `getNativeCaptionHide()`.
- Handlers live in `inject/subtitleHandlers/`. 9 existing: youtube, udemy, coursera, linkedin, hbomax, youku, netflix, disneyplus, wetv.
- `subtitleCoordinator.ts` and `registry.ts` are platform-agnostic — no edits needed to add a handler.
- Handlers must be registered in BOTH worlds: `entrypoints/inject.content/index.ts` (MAIN) + `entrypoints/content.ts` (ISOLATED). Content scripts match `<all_urls>` so no manifest/host-permission changes.
- `detectCurrentHandler()` returns the FIRST handler whose `detect()` returns true — registration order determines priority.
- `getPatternsForCurrentHost()` only includes patterns when `handler.detect()` is true on current hostname.

### DOM Cue Scraping (HBO Max / Youku precedent)
- `getDomCueSource(): DomCueSource` contract — MutationObserver on stable ancestor, re-resolve cue selector per fire, sample `video.currentTime` (via shared `findPrimaryVideo()`) for timing, deferred-attach for late-mounting SPA player, rolling buffer reset on track switch.
- Native captions hidden via `visibility: hidden !important` (coordinator DOM branch).
- `extractAvailableTracks()` returns `url: undefined` for DOM-sourced platforms.
- Manual activation: `tryAutoActivateForDom({ manual: true })` (Alt+S / context menu) — does not require `track.url` or `autoActivateSubtitles`.
- Track switch: MAIN emits `SUBTITLE_DOM_TRACK_CHANGED` → ISOLATED clears `domOriginalCues`/`domTranslationMap`, empties overlay, sends `CANCEL_SUBTITLE_SESSION`.

### Wiring Touchpoints
- `lib/subtitleSites.ts` — add to `SUPPORTED_SUBTITLE_SITES`. MUST update `lib/__tests__/subtitleSites.test.ts` (length + ordered array assertion).
- `lib/subtitleProfiles.ts` — `DOMAIN_PROFILE_MAP` hostname → `'educational'|'media'|'cinematic'`. Unknown domains fall back to `'media'` via `resolveProfile()`.
- `services/background.ts` — `SUBTITLE_ALLOWLIST` gates the CORS-bypass `FETCH_SUBTITLE` path. Add CDN domains here if needed.
- `lib/findPrimaryVideo()` — shared video-selection helper for cue sampling + overlay attachment.

### Subtitle Parser
- `lib/subtitleParser.ts` `parseSubtitles()` auto-detects VTT, SRT, TTML, ASS formats. Generic handler can delegate directly.
- `detectFormat()` checks: XML/TTML root, WEBVTT header, SRT sequence numbers, comma vs period in timing, ASS [Script Info]/Dialogue headers.
- BOM marker (`\uFEFF`) stripping is handled inside individual parsers.

### Testing Conventions
- Test files in `inject/subtitleHandlers/__tests__/` or `tests/unit/`, vitest (`describe`/`it`/`expect`).
- `setLocation(hostname, pathname)` via `Object.defineProperty(window, 'location', ...)`, restore in `afterEach`.
- Nested `describe` per method. Standard cases: `platform` id, `detect()` true/false, `getPatterns` match real URLs, `transformResponse` parses fixtures.
- Coordinator test pattern: `vi.resetModules()` before dynamic import in `beforeEach`, then call `startCoordinator()` explicitly; capture listener handlers in module-level vars from mock factories.
- `FetchInterceptor` captures `window.fetch` at module load — mock `fetch` before dynamic import of inject modules.
- jsdom `XMLHttpRequest` fires real `readystatechange` — use spies to capture handlers.
- Test helpers for origin-checking must set `MessageEvent.origin` explicitly in jsdom.

### Interceptor Hardening
- Interceptor always-respond rule: Every early-return path in `handleIntercepted()` must call `sendTranslatedSubtitle()` with original content.
- Session identity for stale chunk rejection: monotonic `subtitleSessionCounter` in background + `activeSubtitleSessionId` in coordinator.
- Origin validation as FIRST guard in MAIN-world postMessage handlers.
- BFCache interceptor lifecycle: `pagehide` to disable, `pageshow` with `event.persisted` to re-enable.

### URL Pattern Filtering
- Negative lookahead regex `(?!.*(keyword1|keyword2|keyword3))` for excluding multiple URL patterns.
- Domain-anchored `detect()` using `hostname === 'x.com' || hostname.endsWith('.x.com')` to reject spoofed domains.
- Language extraction from URL: use `[_-]({2,3}...)` before path segments to avoid matching API path components.

---

<!-- Learnings from implementation will be appended below -->
