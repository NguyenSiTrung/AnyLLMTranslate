# Spec: Youku Subtitle Support

## Overview

Add bilingual subtitle translation for **Youku** (`youku.tv`, `youku.com`, `m.youku.com`).

Youku uses a custom H5 player (KUI framework) with DRM/MSE streaming that renders captions
as **SVG `<text>` inside `<div id="subtitle">`** — there is no `<track>`/`textTracks` and no
interceptable `.vtt` URL visible in the static HTML. This is structurally identical to the
HBO Max problem (DRM + DOM-rendered captions).

Two phases:
1. **DOM cue-scraping** via the existing `DomCueSource` contract (proven on HBO Max). Reliable,
   works today without knowledge of Youku's subtitle API. Scrape `#subtitle` SVG text + sample
   `video.currentTime` for cue timing.
2. **XHR interception** (conditional): if the subtitle API endpoint is discovered via a live
   DevTools session, add `getPatterns()` + `transformResponse()` + CDN allow-list entries for
   higher-fidelity cues. Ships only if the endpoint is confirmed.

## Functional Requirements

### Phase 1 — DOM Cue Scraping
1. New `YoukuHandler` class in `inject/subtitleHandlers/youku.ts` implementing `SubtitleHandler`.
2. `platform = 'youku'`.
3. `detect()`: exact-hostname + subdomain matching for `youku.tv`, `youku.com`, `m.youku.com`
   (and their subdomains). Reject spoofed hosts (e.g. `notyouku.com`) via anchored `hostname ===`
   or `endsWith('.' + domain)` checks.
4. `isWatchPage()`: true on Youku watch URLs — `/v/v_show/id_*` (youku.tv) and the equivalent
   watch paths on youku.com / m.youku.com.
5. `getDomCueSource()`: `DomCueSource` mirroring HBO Max — MutationObserver on a stable ancestor
   of `<div id="subtitle">`, scrape `<text>/<tspan>` text content per mutation, re-resolve the cue
   selector on each fire, sample `video.currentTime` for cue timing, deferred-attach for the
   late-mounting SPA player, rolling buffer reset on track switch. Use shared `findPrimaryVideo()`.
6. Language code map: Youku internal codes (`CHS, CHT, EN, KR, ES, PO, TH, AR, ID, VI, MS`)
   → BCP-47 (`zh-Hans, zh-Hant, en, ko, es, pt, th, ar, id, vi, ms`).
7. `extractAvailableTracks()`: parse the subtitle language picker DOM (`com="subtitle"` panel,
   `data-val` / language labels) into `AvailableSubtitleTrack[]` with `url: undefined` (DOM-sourced).

### Phase 1 — Wiring
8. Register `YoukuHandler` in BOTH worlds: `entrypoints/inject.content/index.ts` (MAIN) and
   `entrypoints/content.ts` (ISOLATED).
9. Add Youku to `SUPPORTED_SUBTITLE_SITES` in `lib/subtitleSites.ts`; update
   `lib/__tests__/subtitleSites.test.ts` (length 5→6, ordered array).
10. Activation: auto-activate on watch pages when the active caption language differs from the
    target language; Alt+S / context-menu manual fallback (`tryAutoActivateForDom({ manual: true })`).
11. Translation profile: map Youku hostnames → `'cinematic'` in `DOMAIN_PROFILE_MAP`
    (`lib/subtitleProfiles.ts`) so the cinematic register/brevity knobs apply.
12. Context-menu `documentUrlPatterns` coverage for Youku hosts (existing subtitle context menu).

### Phase 2 — XHR Interception (conditional)
13. Discovery spike: observe Youku subtitle XHR endpoint via DevTools during live playback.
14. If endpoint found: implement `getPatterns()` (Youku CDN/`c.youku.com`/`mtop` patterns) +
    `transformResponse()` (parse JSON/SRT/VTT payload) + add Youku domains to `SUBTITLE_ALLOWLIST`
    (`services/background.ts`). XHR path becomes primary; DOM scraping remains fallback.

## Non-Functional Requirements
- Follow existing handler conventions (mirror `linkedin.ts` / `coursera.ts` structure, `courseraHandler.test.ts` test pattern).
- No changes to `subtitleCoordinator.ts` or `registry.ts` (both platform-agnostic by design).
- TypeScript strict mode, no `any` leaks, named exports only.
- XSS-safe: `textContent` for DOM reads, never `innerHTML` with caption text.
- ≥80% test coverage for the new handler.
- All existing tests remain green; lint + build clean.

## Acceptance Criteria
- `YoukuHandler.detect()` returns true on `www.youku.tv`, `v.youku.com`, `m.youku.com` watch pages and false on spoofed hosts / listing pages.
- Bilingual subtitles render via the overlay on a playing Youku video.
- Native SVG captions are hidden (`visibility: hidden !important`) during translation and restored on disable.
- Alt+S and the context-menu item activate translation on Youku watch pages.
- Auto-activation triggers when the active caption language ≠ target language.
- Switching caption language resets the rolling cue buffer (`SUBTITLE_DOM_TRACK_CHANGED` bridge sync).
- Youku appears in Options → Subtitles → Supported Sites with a working enable/disable toggle.
- Youku resolves to the `cinematic` translation profile.
- BCP-47 mapping is correct for all 11 Youku language codes.
- `pnpm test`, `pnpm lint`, `pnpm compile`, `wxt build` all pass.

## Out of Scope
- Subtitle / VTT export or download.
- Translating audio **dub** tracks (caption text only).
- youku.com-specific player/API differences beyond what the shared DOM-scraping path covers
  (assumes all three domains use the KUI player with a `#subtitle` SVG container — flagged for
  live validation during Phase 1).
- Phase 2 XHR endpoint implementation if discovery fails (DOM scraping remains the shipped path).
