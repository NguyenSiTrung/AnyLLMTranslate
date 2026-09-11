# HBO Max / Max Subtitle Support — Potential Issues Audit

**Date:** 2026-09-11
**Scope:** the HBO Max (`max.com` / `hbomax.com`) subtitle pipeline end to end — MAIN-world capture and interception, MPD/DASH parsing, DOM cue scraping, coordinator/translation state machine, overlay/fullscreen, background sessions, manifest/permissions/settings.
**Method:** read-only audit of the current working tree (5 parallel subsystem audits + direct verification of every P1 claim at file:line). Targeted unit tests were run and pass (`domCueSource`, `platformHandlers`, `interception`, `maxMpdSubtitles`, `subtitleParsers` — 22/22). No files were modified by the audit.
**Not verified:** live Max traffic. Findings are code-derived; each carries a confidence note and the real-world trigger. The repo's own probe (`docs/superpowers/plans/2026-07-02-max-probe-results.md`) was used as ground truth where it exists.

---

## TL;DR — the risks most likely to bite a Max user

| # | Risk | Where | Trigger | Severity |
|---|------|-------|---------|----------|
| R1 | Manifest tier stalls → subtitles freeze, native captions stay hidden, no fallback ever | `inject/maxVttPerformanceCapture.ts` + `content/subtitleCoordinator.ts` | Any capture stop mid-session (CDN change, worker fetch, pause/resume edge) | **P1** |
| R2 | Capture locks onto one representation id → every later segment dropped | `inject/maxVttPerformanceCapture.ts:230,296` | URL shape `…/t/t6/1.vtt` (no `t<digit>` subdir) or multi-Period `t1`→`t3` transition | **P1** |
| R3 | SPA / next-episode navigation never resets MAIN-world capture or scraper | `maxVttPerformanceCapture.ts:86-122`, `inject/domCueSource.ts:55-64,152-199` | Auto-play next episode / player remount | **P1** |
| R4 | Superseded background chunk loops keep calling the LLM | `services/background.ts:279-288,1395,1410-1424` | Seek/Stop/track switch after a >25-cue delta | **P1** |
| R5 | Segments marked "seen" before the fetch; failures are silent and never retried | `inject/maxVttPerformanceCapture.ts:199-206,282-294` | One 403/CORS/timeout per segment | **P1** |
| R6 | Scraper stays bound to a detached caption root / stale `<video>` | `inject/domCueSource.ts:152-199` | Captions off→on, player remount, ad break | **P1** |
| R7 | Paused cue is closed and never reopened | `inject/domCueSource.ts:161-166` | Pause/resume inside a cue | **P2** |
| R8 | Language signal missing → silent `en` fallback / "captions off" toast | `lib/maxSubtitleLanguages.ts:52-75`, coordinator `:2048,3320` | Localized or renamed Max labels; picker unmounted | **P2** |
| R9 | MPD-discovered DASH tracks only ever fetch segment 1 | `content/subtitleCoordinator.ts:3612-3618` | Any fallback that uses the MPD track list | **P2** |
| R10 | Zero tests for the two Max-specific MAIN-world modules; `inject/**` excluded from coverage | `vitest.config.ts:41-47`; deleted in `fdfadb5` | Any refactor | **P2** (QA) |
| R11 | Default preferred source language `en` silently discards non-English Max tracks | `types/config.ts:799`; `content/subtitleCoordinator.ts:2296-2304` | Default install + Spanish/Portuguese/other non-English captions | **P1** |

---

## 0. How the Max path works today (so the findings map to reality)

Five tiers can feed the bilingual overlay, in precedence order `manifest > texttrack > mse > dom` (`content/subtitleCoordinator.ts:96-143`):

1. **Performance-API VTT capture (primary).** `inject/maxVttPerformanceCapture.ts` observes Resource Timing entries, page-context-fetches each `*.prd.media.max.com/**.vtt` segment, parses it, and posts the accumulated cue buffer as `SUBTITLE_MANIFEST_CUES` (`append:true` after the first segment).
2. **MPD manifest interception.** `HboMaxHandler.getManifestPatterns()` matches any `.m3u8`/`.mpd` on a Max page; `lib/maxMpdSubtitles.ts` extracts subtitle representations; discovered tracks flow to the coordinator.
3. **Intercept (`getPatterns()` `/\.vtt(?:\?|$)/i`)** — the Immersive-Translate-style hook added in `5e6247c`; the coordinator returns a blanked VTT to the player and renders its own overlay.
4. **HTML5 TextTrack discovery** (universal; the July probe confirmed Max *does* populate native `textTracks`).
5. **DOM cue scraping** (`inject/domCueSource.ts`, `cueBoxRowTextCue` / `caption_renderer_overlay`) — DRM-safe fallback.

The capture tier is the one that was live-probed as working, so most high-severity findings concentrate there and in the hand-offs between tiers.

---

## 1. P1 findings

### MAX-1 — Capture can die silently and the DOM fallback is permanently suppressed
**Where:** `inject/maxVttPerformanceCapture.ts:264-280` (`completeProcessing`), `:161-172` (deadline); `content/subtitleCoordinator.ts:137-143` (`shouldSuppressSource`), `:2008` (`handleDomCues`).

**Mechanism.** The first successfully parsed segment calls `completeProcessing(bridge, true)`, which latches `processingCompleted = true` and clears the 15 s deadline timer. There is no watchdog, no re-arm, and no "capture stalled" signal afterwards. Meanwhile the coordinator has `activeSource = 'manifest'`, and `shouldSuppressSource('dom')` returns `SOURCE_RANK['dom'] (3) > SOURCE_RANK['manifest'] (0)` → **every later DOM cue is dropped**. `hideNativeCaptions()` already hid Max's own caption window.

**Trigger.** Any event that stops VTT segments from surfacing to the observer after the first one: the player switching to a CDN host the regex does not match, MSE/worker fetch behaviour changing mid-title, a DRM/session renewal, or the user pausing long enough that no new segment is requested while the overlay is expected to keep working after resume.

**Impact.** Overlay freezes on the last cue, Max's captions remain hidden, and there is no error, toast, or fallback for the rest of the session.

**Confidence:** high (mechanism verified); medium on frequency of the trigger.
**Fix direction:** watchdog timer re-armed on every capture/reset; on expiry, demote `activeSource` so the DOM tier resumes; surface a toast/log rather than silent stall.

### MAX-2 — Representation-id lock drops all later segments in several real URL shapes
**Where:** `inject/maxVttPerformanceCapture.ts:230` (`if (emittedTrack !== null && emittedTrack !== trackId) return;`), `:296-299` (`extractTrackId`).

**Mechanism.** `extractTrackId` matches `/\/t\/[^/]+\/(t\d+)\//i`. When it returns `null` the code falls back to `trackId = url`, so the *second* segment of the same track has a different "id" and is discarded. Verified shapes from the repo's own fixtures:

| URL | extracted id |
|---|---|
| `…/fadb6e8d/t/t6/1.vtt?…` (`maxMpdSubtitles.test.ts:215`) | `null` → falls back to full URL → **all later segments dropped** |
| `…/fadb6e8d/t/caa516/t3/8.vtt?…` | `t3` ✅ |
| `…/apac/uuid/t/3_f384f7/t1/1.vtt` | `t1` |

The same lock breaks **multi-Period** Max manifests: the repo fixture (`lib/__tests__/maxMpdSubtitles.test.ts:274-311`) models a 29.96 s lead-in Period with representation `t1` on `gcp.apac-free…`, then the main Period with `t3` on `gcp.asia…`. Locking on `t1` discards every `t3` segment. `resetMaxVttCaptureForSeek()` deliberately preserves `emittedTrack` (`:106-122`), so even a seek does not recover; only the aria-checked track-switch observer or a full reset does.

**Trigger.** Playback that starts inside the lead-in Period, or any track served under the `/t/t6/…` shape. Also previews/trailers captured earlier in the same document (see MAX-3).

**Impact.** Subtitles stop after the first segment with no error — one of the worst possible failure modes.

**Confidence:** high on mechanism (regex verified); medium on how often the lead-in Period carries substantive cues.
**Fix direction:** derive identity from something stable (`Representation/@id` from the MPD, or the `t/<x>/` path component + language), accept a representation change as a re-seed rather than a hard drop, and clear the lock on Period transitions.

### MAX-3 — SPA / next-episode navigation leaves MAIN-world state stale
**Where:** `content/subtitleCoordinator.ts:2605-2612` (`handleNavigation` → `resetCoordinatorState`), `:2940-3000`; `inject/maxVttPerformanceCapture.ts:86-93` (full reset only on `pagehide`), `entrypoints/inject.content/index.ts:153`; `inject/domCueSource.ts:55-64, 152-199`.

**Mechanism.** Three separate pieces of MAIN-world state survive an in-document route change:

1. `cueBuffer` / `emittedTrack` / `seenUrls` (capture) — reset only by `pagehide`, the seek message (which is gated on overlay mode), and the track-switch observer.
2. `cues` / `lastText` / `openCue` (DOM scraper) — reset only by seek/track-switch.
3. `attached` observer + video binding (DOM scraper) — `tryAttach()` returns immediately whenever `attached` is truthy (`domCueSource.ts:193`) and never checks `isConnected`.

Because Max reuses representation ids across episodes (`…/t/<x>/t3/…`), the first segment of episode 2 takes the `append` path and re-sends the **merged** episode-1 + episode-2 buffer; the coordinator adopts it wholesale (`mergeManifestOriginalCues` replaces, `subtitleCoordinator.ts:1546-1548`). If the caption root or `<video>` was remounted, the scraper keeps observing a detached node (frozen `currentTime`) or a dead element, and the last open cue keeps `OPEN_CUE_END_SENTINEL` — a permanently stuck line.

**Trigger.** "Next episode", autoplay, or any player remount inside a single document.
**Impact.** Previous episode's lines at overlapping timestamps, wrong translations, wasted LLM calls; or a frozen/deaf scraper for the rest of the session.
**Confidence:** high (each reset path verified); medium on which sub-case a given user hits.
**Fix direction:** send an explicit navigation/reset message to MAIN world on `handleNavigation` (full capture reset keyed by video id), and make `tryAttach`/`attach` validate `isConnected` + video identity on every mutation batch.

### MAX-4 — Superseded background sessions keep translating (invisible LLM spend)
**Where:** `services/background.ts:279-288` (`stopSubtitleSession`), `:1395` + `:1410-1424` (session creation and chunk loop), callers `content/subtitleCoordinator.ts:1848, 1887, 2562-2577`.

**Mechanism.** `activeSessions` is keyed by `tabId` only, so a new `translateSubtitle` overwrites the map entry. The chunk loop closes over its own `session` object and only checks `session.cancelled`. `stopSubtitleSession` cancels **the map's current session**, so any earlier session that already spawned `while (!session.cancelled && session.queue.length > 0)` is unreachable. Its results are discarded by the coordinator's sessionId guard, but every remaining chunk is still sent to the provider.

**Trigger.** Any Max delta > 25 cues (`CHUNK_SIZE`) — e.g. the first VTT segment or a post-seek catch-up — followed by seek, Stop, track switch, or a tier preemption.
**Impact.** A movie-length track can keep translating with no UI attached; pure cost, invisible to the user.
**Confidence:** high.
**Fix direction:** key sessions by `(tabId, sessionId)` and cancel every session belonging to the tab.

### MAX-5 — A segment is marked seen before its fetch; failures are silent and permanent
**Where:** `inject/maxVttPerformanceCapture.ts:199-206` (`seenUrls.add` before `captureSegment`), `:213-216`, `:282-294` (`catch { return null }`).

**Mechanism.** URL is added to `seenUrls` first; `fetchSegment` swallows every failure (non-OK, CORS, timeout, abort) and returns `null` with no log and no retry. The URL can never be re-captured until something clears `seenUrls` (seek or full reset).

**Trigger.** A single transient 403/404/CORS/timeout per segment. If the failure is systemic (auth/CORS after a token rotation), every segment is consumed in turn and the session yields nothing, while `completeProcessing` may already have latched "success" from segment 1 (MAX-1).
**Impact.** Missing lines, or a silently dead capture session.
**Confidence:** high.
**Fix direction:** mark seen only after a successful parse; log failures; bounded retry with backoff.

### MAX-6 — DOM scraper binds one root and one `<video>` for the life of the page
**Where:** `inject/domCueSource.ts:152-159` (`attach` observes `rootEl` once), `:192-199` (`tryAttach` short-circuits on `attached`), `:178`, `:108`.

**Mechanism.** `findPrimaryVideo()` and the caption root are resolved only when `attached` is null. Neither `isConnected` nor identity is re-checked later. Max remounts the caption overlay when captions are toggled off→on, on fullscreen transitions, ad breaks, and episode changes; `<video>` can also be replaced (DRM re-init). After a remount the observer watches a detached subtree (`documentObserver` still fires, but `tryAttach` returns early), and cue timing is sampled from a stale element whose `currentTime` no longer advances.

**Trigger.** Captions off→on; fullscreen or episode remount; ad break.
**Impact.** Subtitles stop updating for the rest of the session (stuck on the last line), or appear at wrong times.
**Confidence:** high on mechanism, medium on how often Max remounts the overlay without a full page reload.
**Fix direction:** treat attachment as valid only while root **and** video are `isConnected` and still the primary video; re-attach otherwise.

### MAX-36 — Default `preferredSubtitleLanguage: 'en'` silently discards non-English Max tracks
**Where:** `types/config.ts:799` (default `'en'`); `content/subtitleCoordinator.ts:2296-2304` (silent `return`).

**Mechanism.** `handleManifestCues` drops every manifest emission whose `payload.language` is non-empty and does not match `preferredSubtitleLanguage` — with no toast, no log, and no fallback signal. `payload.language` for the primary capture tier comes from `readMaxActiveSubtitleLanguage()`. The settings UI cannot even choose "auto" (`entrypoints/options/sections/subtitles/SourceTrackCard.tsx:15` filters `'auto'` out of `LANGUAGES`), and `LANGUAGES` lacks several tracks that `MAX_LABEL_TO_LANGUAGE` supports (`nb`, `sl`, `et`, `lv`, `lt`, `ca`).

**Trigger.** Default/fresh install plus any non-English caption track — LATAM Spanish/Portuguese, EU markets, Nordics. (If the language read *fails* and returns `''`, the gate is skipped and translation proceeds with an `en` source hint instead — MAX-9. Both outcomes are wrong.)
**Impact.** The primary VTT-capture tier is discarded for the entire title; only degraded DOM scraping remains, and the user is never told why.
**Confidence:** high.
**Fix direction:** when the preference is the untouched default, use the first observed active track as the source (or surface an explicit "match any" option) and replace the silent `return` with a user-visible reason.

---

## 2. P2 findings

| ID | Finding | Where | Notes |
|----|---------|-------|-------|
| MAX-7 | **Paused cue closes and never reopens.** `pauseHandler` sets `openCue.endTime` but leaves `lastText` set; after resume the identical text short-circuits, so the rest of the cue is never displayed. | `inject/domCueSource.ts:161-166`, `:106` | High confidence; visible on every mid-cue pause. Fix: keep the cue open or reseed on `play`. |
| MAX-8 | **Only the first `cueBoxRowTextCue` in the document is read.** `document.querySelector(...).textContent` ignores additional rows; a rolling/multi-row window shows the older row (one-line lag) or drops the second line. | `inject/domCueSource.ts:94` | Medium confidence (depends on Max rendering 2 rows as 2 nodes). |
| MAX-9 | **Language is unreadable in common states → silent `en` and misleading toast.** `readMaxActiveSubtitleLanguage()` requires `aria-checked="true"` on `[data-testid="player-ux-text-track-button"]` and a label in a 39-entry English map (+6 locales). Empty → `tryAutoActivateForDom` toasts "Enable subtitles in Max…" although captions are on, and `payload.language \|\| 'en'` sends a non-English track to the model as English. | `lib/maxSubtitleLanguages.ts:52-75,90-128`; `content/subtitleCoordinator.ts:2048-2050, 3320-3336` | Medium; also the intercept path can pass a CDN track id as "language" (`inject/subtitleHandlers/hbomax.ts:132-137`). |
| MAX-10 | **MPD-discovered DASH tracks never reach multi-segment assembly.** The coordinator only routes `.m3u8`/`.mpd` URLs into `FETCH_MANIFEST_SUBTITLES`; `extractSubtitleTracks()` returns a **segment** URL (`.vtt`), so `segmentUrls`/`segmentFetch` are never consumed → only segment 1 is fetched. The background DASH branch additionally fetches every segment sequentially with no cap and clears its 30 s abort timer right after the response headers (`services/background.ts:1761-1772`), so the body read is unbounded. | `content/subtitleCoordinator.ts:3612-3618`; `services/background.ts:1661-1681, 1761-1772` | High confidence; silent "No cues found" if the primary capture is unavailable. |
| MAX-11 | **Multi-Period manifests collapse to Period 0.** Tracks are deduped by `language+platform` in the coordinator and by `find(match) ?? tracks[0]` in the background, so the main Period's track is discarded. | `content/subtitleCoordinator.ts:3101-3113`; `services/background.ts:1655-1656` | Same fixture as MAX-2. |
| MAX-12 | **MPD grace window is re-armed indefinitely + 200 ms busy-wait.** `armMpdDomGraceWindow()` re-arms 8 s on every `SUBTITLE_TRACKS_DISCOVERED`; `waitForMpdGraceIfNeeded()` loops on `mpdProcessingInFlight \|\| now < grace` and never consults the 15 s `MAX_MPD_IN_FLIGHT_CAP_MS` cap. DOM cues can be parked in `pendingDomCuesPayload` for a long time. | `content/subtitleCoordinator.ts:121-126, 304-328, 3403` | Medium confidence on real trigger. |
| MAX-13 | **Track switch discards in-flight translations without re-queueing.** `handleDomTrackChanged` cancels the session and replaces `domTranslatedTexts`/`manifestTranslatedTexts` with fresh Sets; responses arriving afterwards are dropped, so that batch's texts are never translated unless the player re-sends them. | `content/subtitleCoordinator.ts:1885-1898, 1524-1531, 1741-1748` | Medium. |
| MAX-14 | **Disabling subtitles or the site does not tear down an active session.** `settingsChangeListener` only refreshes cached settings/styles; the overlay keeps rendering and the background keeps translating. | `content/subtitleCoordinator.ts:2713-2724, 3296-3306` | High confidence; "Subtitles processing…" toast persists. |
| MAX-15 | **Translations equal to the source are never cached.** `if (src && c.text !== src) map.set(...)` skips them, and `reconcilePendingTranslatedTexts` only keeps texts present in the map → they are re-sent after every seek. | `content/subtitleCoordinator.ts:1580-1590, 1837, 1843` | High confidence on logic. |
| MAX-16 | **DOM tier sends no sessionId.** Guard is `sessionId !== null && sessionId !== active`; the background mints an id and the coordinator adopts it, which can leave it holding a pre-seek session id and cause later chunk messages to be ignored. | `content/subtitleCoordinator.ts:1500-1512, 2146-2152` | Mechanism verified; impact downgraded from the audit's first pass because `rebuildTranslatedCues()` rebuilds from the cleared `domOriginalCues`, so stale *text* is not repainted. |
| MAX-17 | **Tier preemption at slow playback start.** Capture sends `SUBTITLE_MPD_PROCESSING started` at DOMContentLoaded on **any** Max page; the 15 s deadline is one-shot. If the user presses play later, the DOM tier (or texttrack tier) can activate first and the manifest tier then preempts it (`preemptLowerTierOverlay` cancels the session), re-seeding the overlay and re-translating the visible cues. | `inject/maxVttPerformanceCapture.ts:144-172, 267-280`; `content/subtitleCoordinator.ts:104-107, 2177-2235` | Medium; bounded duplicate spend because preemption cancels the earlier session. |
| MAX-18 | **Native TextTrack tier races the manifest tier on Max.** Probe 3 confirmed Max populates `<video>.textTracks`; `startTextTrackDiscovery` runs on every site and `handleTextTrackCues` activates at rank 1 with **no** MPD deferral (unlike `handleDomCues`), so it can activate first and then be preempted by the manifest tier. | `inject/textTrackDiscovery.ts:43-59`; `content/subtitleCoordinator.ts:1905-1930` | Medium; adds duplicate activation/render churn. |
| MAX-19 | **Progressive append is O(n²) and `cueBuffer` is uncapped.** Every segment re-posts the whole growing buffer (structured clone) and the coordinator replaces + rebuilds + re-renders the full array; `seenUrls`, translation map and text set also grow for the session (DOM tier caps at 200, `domCueSource.ts:20`). | `inject/maxVttPerformanceCapture.ts:232-243`; `content/subtitleCoordinator.ts:1546-1570` | High confidence; long-film jank/traffic, no functional break. |
| MAX-20 | **Sequential segment fetches head-of-line block.** `for (const url of newUrls) await captureSegment(...)` — one stuck fetch (up to the 15 s page-fetch timeout) delays every later segment, e.g. during seek bursts. | `inject/maxVttPerformanceCapture.ts:208-210, 40, 282-294` | Medium-high. |
| MAX-21 | **Track-switch race can re-lock the old track.** `captureSegment` awaits the network before reading `emittedTrack`; a mid-flight `resetMaxVttPerformanceCaptureLock()` lets the stale continuation re-set `emittedTrack` to the old id, after which all new-track segments are dropped at `:230`. | `inject/maxVttPerformanceCapture.ts:208-248`; `inject/domCueSource.ts:230-233` | Medium. |
| MAX-22 | **BaseURL hierarchy violated / Representation BaseURL treated as a file.** `getEffectiveMediaBaseUrl` returns the Period BaseURL whenever present (a relative AdaptationSet BaseURL is dropped, MPD-root `<BaseURL>` never read); any non-empty Representation `<BaseURL>` returns early even when it is a directory. | `lib/maxMpdSubtitles.ts:204, 501-533, 206-215` | Medium; produces wrong URLs → silent empty track list. |
| MAX-23 | **`$Time$` / format-specifier templates unsupported.** Only `$RepresentationID$`, `$Bandwidth$`, `$Number$` are substituted; `$Number%05d$` and `$Time$` stay literal. | `lib/maxMpdSubtitles.ts:333-338` | Medium (speculative on Max manifests). |
| MAX-24 | **Segment count derived from the wrong duration.** Uses `mediaPresentationDuration`, else the **first** Period's `duration`, ignoring the current Period's start/duration → undercount (truncated) or overcount (many 404s). | `lib/maxMpdSubtitles.ts:363-387, 450-461` | Medium-high. |
| MAX-25 | **XHR non-200 permanently swallows page completion handlers.** Page `load`/`readystatechange` listeners are diverted at `addEventListener` and the property handlers are wrapped/null'd; `handleResponse` returns at `status !== 200` without replaying, so a 403/304 response never completes for the player. | `inject/xhrInterceptor.ts:101-110, 195-204, 209-210` | Medium-high; general (affects Max subtitle requests with expired tokens). |
| MAX-26 | **Substituted `Response` copies status/headers verbatim.** The translated body is rebuilt with the original `status`, `statusText` and headers (`content-length`, `content-range`, `content-encoding`); a 206 now has a mismatched length/range, and a null-body status (204/205/304) makes the `Response` constructor throw inside the message listener, leaving the interceptor's promise **unsettled** (the page's `fetch` hangs). | `inject/fetchInterceptor.ts:105-116` | Medium-low probability, high impact when hit. |
| MAX-27 | **XHR hold is incomplete.** Only `onreadystatechange` and `onload` are withheld; `loadend`, `progress`, `error`, `timeout` and `addEventListener('loadend'…)` fire before translation completes, so some players can read untranslated text or double-complete. | `inject/xhrInterceptor.ts:195-207` | Medium. |
| MAX-28 | **HTML5 TextTracks can reappear over the overlay.** `hideHtml5TextTracks()` runs once at attach over the then-present videos; Max re-asserts `mode='showing'` on track change/new episode, and the CSS sibling only hides the DOM caption window. | `content/subtitleCoordinator.ts:521, 689-707`; `content/subtitleRenderer.ts:66-78` | Medium; duplicated caption lines. |
| MAX-29 | **Fullscreen popover fallback can claim success without painting.** For `fullscreenElement === video` the overlay stays on `document.body` and relies on `showPopover()`; `showManualPopover` returns `overlay.hasAttribute('popover')` when `showPopover()` throws — i.e. **true** even though nothing is displayed — and the caller ignores the return value. On engines without the Popover API the body-level overlay simply never renders in fullscreen. | `content/subtitleOverlay.ts:128-141, 214-224` | Low-medium; modern Chrome is fine. |
| MAX-30 | **Max caption window hidden with `display:none`, though the design chose `visibility:hidden`.** `HboMaxHandler.getDomCueSource()` omits `captionHideMethod`, so the default `display:none !important` is applied to the very node being observed. The archived design rejected this ("Max may detect 0-size"; the renderer must keep producing cues). The current inline comment asserts the opposite without a recorded live check. | `inject/subtitleHandlers/hbomax.ts:106-118`; `content/subtitleCoordinator.ts:645, 676`; design: `docs/superpowers/specs/2026-06-19-hbomax-subtitle-design.md:84-102` | Medium; verify live, then either declare `visibility` or update the design note. |
| MAX-31 | **MPD detection is hard-wired to today's URL shape.** Extensionless manifests require `manifest-params` in the query **and** a single path segment (`lib/maxMpdSubtitles.ts:63-66`); the auth token is only merged onto `*.prd.media.max.com` or same-origin URLs (`:639-641`). A renamed param, nested path, or new CDN host silently disables discovery/auth. | `lib/maxMpdSubtitles.ts:63-66, 628-649` | Forward-looking. |
| MAX-32 | **Capture URL filter is `.vtt`-only and host-pinned to `prd.media.max.com`.** `MAX_VTT_RESOURCE_URL` requires `*.prd.media.max.com/**.vtt`, yet `inject/subtitleHandlers/hbomax.ts:43-46` itself says Max streams through "generic Akamai/Fastly CDN edges whose hostnames are NOT max.com/hbomax.com (e.g. `beam-*.prd.api.hbomax.com`, `dl.delivery.mp.microsoft.com`)". TTML / subtitle-in-MP4 (`stpp`) tracks are also invisible to the primary capture even though the MPD parser and `parseSubtitleContent` support TTML. If an edge outside the pin is used: capture never fires (15 s deadline → DOM only), an extensionless manifest is not classified as DASH (`services/background.ts:1592`) so it is parsed as direct VTT → empty cues → "Failed to fetch manifest subtitles", and nested-MPD responses are rejected (`services/background.ts:1562-1568`). | `inject/maxVttPerformanceCapture.ts:34-35, 216`; `lib/maxMpdSubtitles.ts:31-68, 146-156`; `wxt.config.ts:15-18` | Medium (verified fixtures all use `*.prd.media.max.com`, and `cf.asia`/`cf.eu.prd.media.max.com` resolve live; other edges are named only in the comment). |
| MAX-33 | **Resource Timing buffer overflow is unhandled.** No `setResourceTimingBufferSize` / `resourcetimingbufferfull` handling; a seek burst's network activity can overflow the 250-entry buffer before `buffered:true` replays. | `inject/maxVttPerformanceCapture.ts:174-191` | Low-medium (observer delivery is otherwise robust to `clearResourceTimings`). |
| MAX-34 | **DOM overlay drag handle swallows control-bar clicks.** Only the hidden state is click-through; while a cue is visible the bottom-centred box overlaps the seek bar/buttons and `mousedown` starts a drag. | `styles/subtitle.css:11-15, 143-186` | Medium; UX. |
| MAX-35 | **Alt+S is a silent no-op off `/video/watch/`.** `manualActivateSubtitles` → `tryAutoActivateForDom({manual:true})` returns `{reason:'not a watch page'}` without a toast. | `content/subtitleCoordinator.ts:3279-3284, 3766-3787` | Low-medium. |
| MAX-37 | **document_start→document_end bridge race drops Max lifecycle/cue messages.** `QUEUED_UNTIL_READY` holds only `SUBTITLE_INTERCEPTED`/`TRACKS_DISCOVERED`/`METADATA`; `SUBTITLE_MPD_PROCESSING` and `SUBTITLE_MANIFEST_CUES` post immediately. The MAIN-world capture starts on DOMContentLoaded and can send `started` (and the first segment) before the `document_end` coordinator announces readiness, so the grace window never arms and the first buffer can be lost (the next append re-sends the full buffer, so it usually self-heals one segment later). | `inject/messageBridge.ts:20-24, 90-96`; `inject/maxVttPerformanceCapture.ts:153-157`; `entrypoints/content.ts:1589-1593` | Medium-high (lifecycle) / medium (first cues). |
| MAX-38 | **Chinese script-variant matching can select the wrong track.** The both-scripts guard in `subtitleLanguagesMatch` only fires when *both* tags carry a 4-char script subtag, so `subtitleLanguagesMatch('zh-Hant', 'zh') === true`; `LANGUAGES` uses `zh` for Simplified while Max exposes both `zh-Hans` and `zh-Hant`. A "Simplified" preference therefore passes the gate for a Traditional track. | `lib/subtitleLanguageMatch.ts:84-92`; `lib/languages.ts:17-18`; `lib/maxSubtitleLanguages.ts:10-11` | High confidence (deterministic logic). |
| MAX-39 | **Background subtitle allowlist is broader than `host_permissions`.** The allowlist permits `cloudfront.net`, `akamaized.net`, `hbo.com`, `delivery.mp.microsoft.com`, etc., but `wxt.config.ts` grants none of them; an MV3 service-worker fetch to those hosts passes the allowlist check and then fails CORS. `inject/subtitleHandlers/hbomax.ts:43-46` itself names Akamai/Fastly edges and `dl.delivery.mp.microsoft.com` as Max sources. | `services/background.ts:1458-1483, 1546, 1586`; `wxt.config.ts:14-32` | High confidence on the mismatch; medium on Max reachability. |

### P3 findings

| ID | Finding | Where |
|----|---------|-------|
| MAX-40 | `attrLang` overrides the label map: a UI-locale `lang`/`data-language` beats the real `aria-label`, producing a wrong language code (and then MAX-36's gate drops valid cues). No fixture covers `attrLang`. | `lib/maxSubtitleLanguages.ts:69-75` |
| MAX-41 | Progressive DASH fetch silently truncates at `MAX_PROGRESSIVE_DASH_SEGMENTS = 500` and still returns success (~83 min at 10 s segments) — loses later subtitles on long titles using that tier. | `services/background.ts:215, 1731` |
| MAX-42 | `docs/PUBLISHING.md:70` justifies host access with only `*.youtube.com`/`*.max.com`, omitting `hbomax.com` — the live player host after the verified redirect chain. Store-review justification mismatch only, no runtime effect. | `docs/PUBLISHING.md:70` |

---

## 3. Latent / conditional risks

- **Segment-relative VTT offsets (MPD-1 in the first pass) — currently *not* a bug, but latent.** `lib/dashSegmentOffsets.ts` has no production consumer and `captureSegment` emits cue times verbatim. That is *correct today* because the repo's own live probe (`docs/superpowers/plans/2026-07-02-max-probe-results.md`, Probe 1) confirmed Max serves absolute-timed files with `X-TIMESTAMP-MAP MPEGTS:0`. If Max ever switches to segment-relative VTT (or another CDN edge does), every cue collapses into the first seconds with no safety net. The probe's "Probe 2 — in-flight observability" is also still marked PENDING.
- **Max → HBO Max rebrand / domain move.** `detect()` already covers both `max.com` and `hbomax.com`, but every selector and URL assumption is a single literal; the `5e6247c` intercept, the `/video/watch/` path check, and the three `data-testid`s are all unversioned.
- **Message-bridge early queue omits the subtitle messages that Max depends on** — tracked as MAX-37.
- **MPD grace/`MAX_MPD_IN_FLIGHT_CAP_MS` only caps the DOM path**, not the `waitForMpdGraceIfNeeded` loop.
- **`autoActivateSubtitles` is only enforced by the DOM tier.** The manifest and TextTrack tiers activate and spend LLM calls regardless of the toggle (`content/subtitleCoordinator.ts:2162-2235, 1905-1930` vs `:3299`), even though its default is `false` and the UI says "Automatically fetch and translate when the preferred language is detected". Not Max-specific, but Max is where it is most visible because the capture tier is primary there.

---

## 4. QA / coverage gaps (why these survived)

- **`inject/maxVttPerformanceCapture.ts` (311 lines, the primary Max path) has zero direct tests**, and **`inject/subtitleHandlers/hbomax.ts` has zero tests**. They are the only two `inject/**` modules with none.
- Commit `fdfadb5` ("delete peripheral UI + per-platform handler test files") removed `tests/unit/hbomaxHandler.test.ts` alongside three other handler tests; nothing replaced the Max coverage.
- `vitest.config.ts:41-47` sets `coverage.include` to `services/**`, `lib/**`, `content/**`, `types/**` — **`inject/**` is not measured at all**, so the ≥80% target can be met while the entire MAIN-world capture layer is untested.
- `vitest.config.ts:33` still lists `lib/__tests__/maxSubtitleLanguages.test.ts` in `environmentMatchGlobs`, but that file no longer exists (dangling reference).
- What *is* tested and green today: `lib/__tests__/maxMpdSubtitles.test.ts`, `tests/unit/domCueSource.test.ts`, plus Max branches in `content/__tests__/subtitleCoordinator.test.ts`. Targeted run of the Max-adjacent suites: 22/22 passing.

---

## 5. Suggested fix order

1. **MAX-1 + MAX-2 + MAX-5** — make the primary capture path fail-safe: watchdog/demotion, identity that survives representation and Period changes, mark-seen-after-success with logged retry. These are the "subtitles silently stop" class.
2. **MAX-3 + MAX-6** — reset MAIN-world state on SPA/episode navigation and validate `isConnected`/video identity. This is the "wrong subtitles / dead scraper" class.
3. **MAX-4 + MAX-36** — cancel all of a tab's background sessions (pure cost, no UX risk), and stop the default `en` preference from silently discarding non-English tracks.
4. **MAX-7, MAX-9, MAX-10, MAX-11, MAX-14, MAX-38** — visible correctness/UX of the fallback tiers and language selection.
5. **Tests** — restore `hbomaxHandler` + `maxVttPerformanceCapture` unit tests (fixtures already exist in `maxMpdSubtitles.test.ts`), and add `inject/**` to coverage.
6. Everything else as opportunistic hardening.

---

## Appendix — verification notes

- **Live host probe (2026-09-11, DNS/HTTP):** `max.com → www.max.com → www.hbomax.com` (301 chain); `play.max.com → play.hbomax.com`; `play.hbomax.com/video/watch/<uuid>` = 200 while `www.hbomax.com/video/watch/...` = 404; `cf.asia.prd.media.max.com` and `cf.eu.prd.media.max.com` resolve; `prd.media.max.com` and `media.hbomax.com` are NXDOMAIN. This confirms the `/video/watch/` gate and both brand domains are correct today, and that the `*.prd.media.max.com` pin matches current fixtures.
- Every P1 mechanism was re-read directly (`maxVttPerformanceCapture.ts:86-311`, `domCueSource.ts:51-256`, `xhrInterceptor.ts:95-214`, `services/background.ts:279-288, 1380-1432, 1458-1500, 1761-1772`, `subtitleCoordinator.ts:96-143, 1440-1580, 1756-1855, 2288-2383, 2600-2660, 2935-3006, 3270-3360, 3596-3625`, `lib/subtitleLanguageMatch.ts:70-100`, `lib/maxSubtitleLanguages.ts`, `types/config.ts:790-815`).
- `extractTrackId` behaviour was executed against the repo's own fixture URLs; `…/t/t6/1.vtt` yields no id (MAX-2).
- `subtitleLanguagesMatch('zh-Hant', 'zh')` was traced through the code and evaluates `true` (MAX-38).
- One first-pass claim was **rejected**: the XHR wrapper's `xhrRef` TDZ concern is impossible — no readyState transition can occur between the handler assignment and the `const` initialization.
- The first-pass "P0 offsets" claim was **downgraded to latent** because the repo's live probe (`docs/superpowers/plans/2026-07-02-max-probe-results.md`) supersedes the design hypothesis.

## Verified sound (no need to re-check)

- **Tier precedence and suppression** (`SOURCE_RANK`, `shouldSuppressSource`, `invalidateDirectFullTrackActivations` generation guards) behave as documented, apart from the stall case in MAX-1.
- **Seek handling**: both `seeked` and the `SUBTITLE_SEEK_RESET` bridge message call `resetAndSample`, keeping cue start times ascending for the overlay's binary search; the in-range full-content check prevents needless buffer clears during normal playback.
- **`adaptCueTimings`** never shortens the open sentinel cue and its neighbor cap prevents overlap; idempotent on re-application.
- **Page-context capture fetch** uses the pre-patch `nativeFetch`, clones/swallows failures without consuming the page's body, and the PerformanceObserver path is unaffected by `clearResourceTimings()`; `entry.name` is the full URL cross-origin.
- **BFCache lifecycle** (`pagehide`/`pageshow` disable→re-enable with identity-checked prototype restores) is correct.
- **Max is absolute-timed** per the July probe, so the missing offset math is correct today (latent risk only).
- **Host/permission coverage**: `*.hbomax.com`, `*.max.com`, `*.media.max.com` match patterns cover the live player and CDN hosts (Chrome's `*.example.com` also matches the bare domain); content scripts match `<all_urls>` in both worlds; the context menu lists both brands.
- **Per-site toggle** key `hbomax` matches `handler.platform` and short-circuits the intercept, DOM and manifest paths; whole-array settings writes persist correctly.
- **Manifest/URL parsing**: `parseWebVTT`/SRT + BOM handling, TTML-vs-manifest guard, SegmentTimeline `t/d/r` math (including negative-`r` rejection), `startNumber`, `$RepresentationID$`/`$Bandwidth$`, self-referential/root-path URL guard, `mpdResolveBase` extensionless-directory + query re-attachment, ISO-8601 `PT` durations.
- **`resolveProfile`** subdomain walk resolves `play.hbomax.com`/`www.max.com` without enumeration; `readMaxActiveSubtitleLanguage` correctly treats "Off".
- **`NativeTrackRenderer`** is retained but not in the live path (consistent with the probe's duplicate-line regression note).

---

## 6. Fix status (implementation, 2026-09-11)

All 42 findings were implemented in eight TDD phases; the plan and per-phase
implementation notes live in
[docs/superpowers/plans/2026-09-11-hbomax-subtitle-fixes.md](superpowers/plans/2026-09-11-hbomax-subtitle-fixes.md).
Nothing in this audit was fixed by "looks right" reasoning: every task started
from a failing test, and the Max-specific behaviour that cannot be reproduced
without live traffic is listed in the plan's **Live-verification backlog**
(repeated in §7 below).

| Finding | Status | What changed |
|---------|--------|--------------|
| MAX-1 | Fixed | watchdog (`watchdogTimer` + progress deadline) demotes the manifest tier and surfaces the existing toast |
| MAX-2 | Fixed | `resolveTrackIdentity` + `captureGeneration` invalidation cover the `t/t6/1.vtt` shape and Period transitions |
| MAX-3 | Fixed | `SUBTITLE_CAPTURE_RESET` is sent on SPA navigation before the coordinator resets |
| MAX-4 | Fixed | per-tab session set + cancellation generations stop superseded chunk loops |
| MAX-5 | Fixed | segments are marked seen only after a successful parse; bounded retry + loud failures |
| MAX-6 | Fixed | `ensureAttached()` re-validates root/video identity on every observer tick; navigation/video-change resets |
| MAX-7 | Fixed | pause only emits; the open cue keeps its sentinel end |
| MAX-8 | Fixed | all `cueBoxRowTextCue` rows in the cue root are read and joined |
| MAX-9 | Fixed | checked-state detection scans descendants; label map + qualifier stripping; `attrLang` fallback |
| MAX-10 | Fixed | `segmentUrls`/`segmentFetch` + language pass through to the background segment path |
| MAX-11 | Fixed | same-language Period tracks merge in discovery order (concat + dedup) |
| MAX-12 | Fixed | TextTrack tier defers to the manifest tier; grace window clamped to 3× and the wait is bounded three ways |
| MAX-13 | Fixed | `shouldTeardownSubtitleSession` tears down on disable/site-disable |
| MAX-14 | Fixed | DOM session ids are allocated before the request and stale responses dropped |
| MAX-15 | Fixed | source-equal translations are stored instead of left pending |
| MAX-16 | Fixed | manifest re-activation only sends texts missing from the translation map |
| MAX-17 | Fixed | deadline extensions only accrue once playback has started |
| MAX-18 | Fixed | Max TextTrack cues are held while the MPD tier may still win (Task 5.2) |
| MAX-19 | Fixed | capture posts sequenced deltas (`append:true`) instead of re-sending the whole buffer |
| MAX-20 | Fixed | ordered concurrent segment fetch with an in-flight set |
| MAX-21 | Fixed | `captureGeneration` guards stale fetch continuations |
| MAX-22 | Fixed | `getMpdRootBaseUrl` + `resolveBaseChain` fold MPD → Period → AdaptationSet → Representation |
| MAX-23 | Fixed | `$Time$` from the SegmentTimeline and `%0Nd` widths on `$Number$`/`$Bandwidth$` |
| MAX-24 | Fixed | segment counts use the enclosing Period duration (presentation-minus-start fallback) |
| MAX-25 | Fixed | non-200 XHR responses replay the divested page handlers exactly once |
| MAX-26 | Fixed | null-body statuses return the original response; body-describing headers are dropped |
| MAX-27 | Fixed | `loadend`/`onloadend` are held and replayed in native order |
| MAX-28 | Fixed | native TextTracks are re-hidden on track change, `play` and `loadedmetadata` |
| MAX-29 | Fixed | `showManualPopover` drops the attribute and returns false; caller warns + toasts once |
| MAX-30 | Fixed (defensive) | `captionHideMethod: 'visibility'` is declared and pinned by a handler test — live confirmation is backlog item 1 |
| MAX-31 | Fixed | nested extensionless manifests detected; the token is re-attached on every Max-owned host |
| MAX-32 | Partially fixed | capture covers `*.media.max.com`/`*.hbomax.com`/`*.max.com` `.vtt`+`.ttml` with a `/t/` marker; subtitle-in-MP4 (`stpp`) stays out of scope |
| MAX-33 | Fixed | `setResourceTimingBufferSize` + `resourcetimingbufferfull` re-buffer and replay |
| MAX-34 | Fixed | the box is click-through and only the explicit drag handle is interactive |
| MAX-35 | Fixed | Alt+S toasts off a watch page and when no DOM cue source exists |
| MAX-36 | Fixed | `Auto (match the active track)` option + skip toast (approved product decision) |
| MAX-37 | Fixed | `SUBTITLE_MPD_PROCESSING`/`SUBTITLE_MANIFEST_CUES`/`SUBTITLE_DOM_CUES` join the `COORDINATOR_READY` early queue |
| MAX-38 | Fixed | bare `zh`/`zho`/`chi` normalise to `zh-Hans`; Traditional tags no longer match |
| MAX-39 | Fixed | `*://*.hbo.com/*` + `*://*.delivery.mp.microsoft.com/*` added, plus a permissions pre-flight warning |
| MAX-40 | Fixed | the label map wins over `attrLang`; `ui-locale`-style values are rejected as language tags |
| MAX-41 | Fixed | hitting the 500-segment cap logs the truncation with the fetched count |
| MAX-42 | Fixed | `docs/PUBLISHING.md` names `hbomax.com` and the CDN edges |

**Verification (2026-09-11):** `npx vitest run` → **725 tests / 213 files
passing**; `npx tsc --noEmit` → 0 errors; `npx eslint .` → 0 errors;
`npx vitest run --coverage` → all files 78.31% statements, **inject 81.86%**,
lib 89.25%, content 68.09%, services 73.01%, types 99.62%. `inject/**` is now
part of `coverage.include`, so the two previously untested MAIN-world modules
(the MAX-specific capture and the Max handler) are measured.

Sections 3 (latent risks), 4 (QA gaps) and the "Verified sound" appendix above
describe the state **before** this work; the QA gap they record (R10 / MAX-32
tests) is closed by `inject/__tests__/maxVttPerformanceCapture.test.ts` (19
cases) and `tests/unit/hbomaxHandler.test.ts` (9 cases).

---

## 7. Live-verification backlog (needs a real Max session)

These changes are defensive but cannot be proven from fixtures. None blocks the
automated work; each must be checked manually before release.

1. **Caption-hide method** (MAX-30): confirm `visibility: hidden` keeps Max's
   caption renderer producing cues with no ghost box over the controls. If it
   regresses, revert to `display: none` and update the design note.
2. **Multi-row cue text** (MAX-8): a two-line cue must arrive as one cue with two
   rows and translate as a unit.
3. **Representation switch** (MAX-2): on a title with a lead-in Period, confirm
   the main Period's cues are captured after the lead-in.
4. **Watchdog** (MAX-1): no false stall while paused; a genuine stall produces
   the toast plus the DOM fallback.
5. **Selector inventory** (MAX-9/28): re-record the live `data-testid` values for
   the cue rows, caption root and track button after any Max UI update.
6. **Manifest multi-segment fallback** (MAX-10/11): with the performance capture
   disabled, confirm a DASH track assembles beyond segment 1.
7. **Popover fullscreen** (MAX-29): subtitles still render when Max fullscreens
   the `<video>` element itself.
