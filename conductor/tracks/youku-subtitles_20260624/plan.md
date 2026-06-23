# Plan: Youku Subtitle Support

## Phase 1: Handler & Language Mapping (TDD)

- [x] Task 1.1: Scaffold test file `tests/unit/youkuHandler.test.ts` with RED tests for `platform`, `detect()` (true for youku.tv/youku.com/m.youku.com + subdomains, false for spoofed hosts like notyouku.com), `isWatchPage()` (true on `/v/v_show/id_*`, `/v_show/id_*`, false on listing pages).
  <!-- files: tests/unit/youkuHandler.test.ts -->
  ✅ 58 tests, RED→GREEN confirmed.

- [x] Task 1.2: Implement `YoukuHandler` skeleton in `inject/subtitleHandlers/youku.ts` — `platform = 'youku'`, `detect()` (anchored hostname match for youku.tv, youku.com, m.youku.com + subdomains, reject spoofs), `isWatchPage()`. GREEN against Task 1.1.
  <!-- files: inject/subtitleHandlers/youku.ts -->

- [x] Task 1.3: Add Youku internal-code → BCP-47 language map (`CHS→zh-Hans, CHT→zh-Hant, EN→en, KR→ko, ES→es, PO→pt, TH→th, AR→ar, ID→id, VI→vi, MS→ms`) as a pure exported function. Add RED tests asserting each mapping + unknown-code fallback.
  <!-- files: inject/subtitleHandlers/youku.ts, tests/unit/youkuHandler.test.ts -->
  Exported as `youkuCodeToLanguage()`; `CHS` exposed as `data-val="default"`.

- [x] Task 1.4: Implement `getDomCueSource()` mirroring HBO Max — MutationObserver on stable ancestor of `<div id="subtitle">`, scrape `<text>/<tspan>` text per fire, re-resolve cue selector, sample `video.currentTime` (shared `findPrimaryVideo()`) for cue timing, deferred-attach for late-mounting SPA player, rolling buffer reset on track switch. RED→GREEN tests for cue extraction, timing sampling, and selector re-resolution.
  <!-- files: inject/subtitleHandlers/youku.ts, tests/unit/youkuHandler.test.ts -->
  Selectors: `#subtitle` (cue + caption window), `#ykPlayer` (observe root). Timing/deferred-attach/rolling-buffer logic lives in the shared `domCueSource.ts` (no edits needed — handler only supplies the contract).

- [x] Task 1.5: Implement `extractAvailableTracks()` — parse the subtitle language picker DOM (`com="subtitle"` panel, `data-val`, language labels) into `AvailableSubtitleTrack[]` with `url: undefined`, applying the Task 1.3 code map. RED→GREEN tests for picker parsing + malformed-DOM → `[]`.
  <!-- files: inject/subtitleHandlers/youku.ts, tests/unit/youkuHandler.test.ts -->

- [ ] Task: Conductor - User Manual Verification 'Handler & Language Mapping' (Protocol in workflow.md)

## Phase 2: Wiring & Registration

- [x] Task 2.1: Register `YoukuHandler` in MAIN world — import + add to `registerSubtitleHandlers([])` array in `entrypoints/inject.content/index.ts`.
  <!-- files: entrypoints/inject.content/index.ts -->

- [x] Task 2.2: Register `YoukuHandler` in ISOLATED world — import + add to `registerSubtitleHandlers([])` array in `entrypoints/content.ts`.
  <!-- files: entrypoints/content.ts -->

- [x] Task 2.3: Add Youku to `SUPPORTED_SUBTITLE_SITES` (`lib/subtitleSites.ts`) with `methodHint: 'DOM cue scraping'`; update `lib/__tests__/subtitleSites.test.ts` length 5→6 and ordered array to include `'youku'`.
  <!-- files: lib/subtitleSites.ts, lib/__tests__/subtitleSites.test.ts -->

- [x] Task 2.4: Map Youku hostnames → `'cinematic'` in `DOMAIN_PROFILE_MAP` (`lib/subtitleProfiles.ts`) so the cinematic register/brevity knobs apply.
  <!-- files: lib/subtitleProfiles.ts -->
  Also made `resolveProfile()` subdomain-aware (label-stripping walk) so `v.youku.com`/`www.youku.tv`/`m.youku.com` resolve correctly without enumerating each — fixes a latent HBO Max gap (`play.hbomax.com` previously fell back to `media`).

- [x] Task 2.5: Add Youku hosts to subtitle context-menu `documentUrlPatterns` (find existing subtitle context menu; add `*://*.youku.tv/*`, `*://*.youku.com/*`, `*://*.m.youku.com/*`).
  <!-- files: entrypoints/background.ts -->
  Added `*://*.youku.tv/*` + `*://*.youku.com/*` (`*.m.youku.com/*` is covered by the `*.youku.com/*` glob).

- [ ] Task: Conductor - User Manual Verification 'Wiring & Registration' (Protocol in workflow.md)

## Phase 3: Activation & Hardening

- [ ] Task 3.1: Verify auto-activate path for Youku — `tryAutoActivateForDom` fires on watch pages when active caption language ≠ target language; native SVG captions hidden via `visibility: hidden !important`; overlay renders bilingual cues. Manual smoke test against a playing Youku video.
  <!-- files: inject/subtitleHandlers/youku.ts, content/subtitleCoordinator.ts (if needed) -->

- [ ] Task 3.2: Verify manual activation — Alt+S shortcut and the Youku context-menu item both call `tryAutoActivateForDom({ manual: true })`. Manual smoke test.
  <!-- files: content/subtitleCoordinator.ts (if needed) -->

- [ ] Task 3.3: Verify track-switch buffer reset — switching caption language in the Youku picker emits `SUBTITLE_DOM_TRACK_CHANGED`, clears `domOriginalCues`/`domTranslationMap`, empties overlay, sends `CANCEL_SUBTITLE_SESSION`. Manual smoke test + any needed handler hook.
  <!-- files: inject/subtitleHandlers/youku.ts -->

- [ ] Task: Conductor - User Manual Verification 'Activation & Hardening' (Protocol in workflow.md)

## Phase 4: XHR Interception (conditional on endpoint discovery)

- [ ] Task 4.1: Discovery spike — observe Youku subtitle XHR/fetch endpoint via DevTools during live playback (network tab, filter for subtitle/lyric/cc/VTT/JSON payloads to c.youku.com / mtop.youku.com / acs.youku.com). Record: endpoint URL shape, payload format (JSON/SRT/VTT), required auth params (ckey), and language-code-in-response mapping.
  <!-- files: conductor/tracks/youku-subtitles_20260624/learnings.md (record findings) -->

- [ ] Task 4.2 (SKIP if 4.1 finds nothing): Implement `getPatterns()` (Youku CDN / API patterns) + `transformResponse()` (parse discovered payload format into cues) on `YoukuHandler`. Add RED→GREEN tests.
  <!-- files: inject/subtitleHandlers/youku.ts, tests/unit/youkuHandler.test.ts -->

- [ ] Task 4.3 (SKIP if 4.1 finds nothing): Add Youku CDN/API domains to `SUBTITLE_ALLOWLIST` (`services/background.ts`) for the CORS-bypass overlay fallback path.
  <!-- files: services/background.ts -->

- [ ] Task: Conductor - User Manual Verification 'XHR Interception' (Protocol in workflow.md)
