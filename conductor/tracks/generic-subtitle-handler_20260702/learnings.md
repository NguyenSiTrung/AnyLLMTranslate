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

## [2026-07-02 19:35] - Track Complete (all phases)

- **Implemented:** Generic subtitle handler — lowest-priority fallback that intercepts/translates subtitles on any site with a `<video>` element. URL patterns (.vtt/.srt/.ttml + caption path keywords), content-type secondary detection, DOM cue-scraping fallback, content-validation guard, settings toggle, UI.
- **Files changed:**
  - `inject/subtitleHandlers/generic.ts` (new) — GenericSubtitleHandler
  - `inject/subtitleHandlers/registry.ts` — `getContentTypePatterns?()` on interface + `getContentTypePatternsForCurrentHost()` collector
  - `inject/interceptorRegistry.ts` — `registerContentTypePatterns()` + `matchContentType()` + `normalizeContentType()` + `ContentTypeMatch` type
  - `inject/fetchInterceptor.ts` — content-type secondary probe after URL-miss; refactored shared `interceptSubtitle()` closure
  - `lib/subtitleParser.ts` — `validateSubtitleContent()` guard
  - `lib/subtitleSites.ts` — Generic entry in SUPPORTED_SUBTITLE_SITES
  - `types/subtitle.ts` — `SubtitleContentTypePattern` type
  - `types/config.ts` — `enableGenericSubtitleHandler` field (default true)
  - `entrypoints/inject.content/index.ts` — register handler LAST + content-type patterns
  - `entrypoints/content.ts` — register handler LAST
  - `content/subtitleCoordinator.ts` — 3 gates on enableGenericSubtitleHandler
  - `entrypoints/options/sections/SubtitlesSection.tsx` — standalone toggle
  - Tests: `tests/unit/genericHandler.test.ts` (44), `tests/unit/interceptorRegistry.test.ts` (+11), `tests/unit/fetchInterceptor.test.ts` (+3), `lib/__tests__/subtitleSites.test.ts`, `entrypoints/options/sections/__tests__/SubtitlesSection.test.tsx` (+5), `types/__tests__/config.test.ts`
- **Commits:** b5dfae3 (P1+3+4-precedence), d7b3b4b (P2), 48f5aa9 (P4 registration), a41b586 (P5), d4f6825 (P6 lint)
- **Learnings:**
  - **`detect()` timing & `getPatternsForCurrentHost()` accumulation:** Handlers are registered at `document_start` BEFORE any `<video>` mounts, and `getPatternsForCurrentHost()` runs immediately after registration in the MAIN world. So a generic handler's `detect()` must be stable at script-start. The generic handler's `detect()` = "no specific handler detects" (hostname-level fallback), and the `<video>` gate lives in `isWatchPage()` instead. This mirrors HBO Max/Youku where detect() is hostname-only.
  - **CRITICAL — `getPatternsForCurrentHost()` ACCUMULATES from ALL matching handlers, not first-match-wins.** Only `detectCurrentHandler()` is first-match. So if the generic `detect()` returned true broadly, its `.vtt` pattern would ALSO register on YouTube (double interception). The "no other handler detects" guard in `detect()` prevents this — generic patterns only register on unknown hosts.
  - **No module cycle between registry and handlers:** `registry.ts` imports only *types* from handlers (no runtime value imports), so handlers can safely statically import `getSubtitleHandlers` from the registry for their `detect()` guard. Initially tried `require()` (forbidden in ESM/WXT) — static import works.
  - **XHR vs Fetch content-type asymmetry:** XHR captures `load`/`readystatechange` handlers in `open()` *before* the Content-Type is known, so true post-response content-type blocking is infeasible there (would require capturing every request). Fetch is already async/blocking, so probing the response Content-Type after a URL-miss is natural. Content-type detection is wired into FetchInterceptor only; XHR stays URL-only. This is an acceptable architectural limitation documented in the code.
  - **`transformResponse` content-validation gate is essential for the generic handler:** broad `.vtt`/`.ttml` URL patterns produce false positives (app manifests, chapter markers served as .vtt, config XML). `validateSubtitleContent()` rejects non-subtitle bodies (random text, JSON, arbitrary XML without TTML root) by returning `[]` from `transformResponse`, which the coordinator's always-respond path passes through untouched — no LLM call wasted. Note: a real WEBVTT chapter-marker file (valid header + timing) is accepted — translating the title is harmless, over-rejecting risks dropping real cues.
  - **BCP-47 script subtag case must be preserved:** `extractLanguageFromUrl` preserves `zh-Hans` (canonical) rather than lowercasing to `zh-hans` (non-canonical). Matches Youku handler convention (`youkuCodeToLanguage` returns `zh-Hans`).
  - **Standalone boolean toggle vs per-site array:** The generic handler gets its own `enableGenericSubtitleHandler` boolean (default true) rather than joining the `disabledSubtitleSites` array, because it's opt-in semantics for a feature spanning all sites. The UI renders it as a separate `<Toggle>` (the per-site loop filters out `generic`). The coordinator gates at 3 activation points with `handler.platform === 'generic' && enableGenericSubtitleHandler === false`. The generic entry IS in `SUPPORTED_SUBTITLE_SITES` for display, but uses its own toggle.
  - **`extractSettings()` passes `subtitleSettings` wholesale** — adding a leaf field to `SubtitleSettings` requires NO store change; `deepMerge` carries it automatically. Only `types/config.ts` (interface + DEFAULT) needs the field.
  - **Pre-existing lint/tsc noise is vendored:** The 31585 lint errors are all in `ImmersiveTransalteExtensionCode/` (vendored reference extension, not project source). The one tsc error (`subtitleCoordinatorManifest.test.ts`) is pre-existing on master. Both are unrelated to this track.

---
