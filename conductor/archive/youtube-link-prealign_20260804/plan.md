# Implementation Plan: youtube-link-prealign_20260804

## Phase 1: Pure Watch-Page Extraction & Track Selection (TDD)
<!-- execution: sequential -->

- [x] Task 1: Failing tests for new pure lib `lib/youtubeWatchPage.ts`
  `extractPlayerResponseFromWatchHtml(html)` (handles `ytInitialPlayerResponse = {…};`
  variants; null on consent/bot/malformed), `selectAsrTrack(tracks)` with typed miss
  reasons (`no-tracks` | `no-asr`), `buildJson3TimedtextUrl(baseUrl)` (append fmt=json3).

- [x] Task 2: Implement the pure module to green.

- [x] Task 3: Adapter test — extracted player response feeds the existing
  `YouTubeHandler.extractAvailableTracks` (no duplicated track parsing).

- [x] Task: Conductor - User Manual Verification 'Phase 1' (Protocol in workflow.md)
  — Pure lib only; automated gates (19 tests, lint, tsc) green. UI-level manual
  verification deferred to Phase 5 smoke.

## Phase 2: Background Orchestration & Permissions (TDD)
<!-- execution: sequential -->
<!-- depends: phase1 -->

- [x] Task 1: Message types in `types/messages.ts` — `REALIGN_YOUTUBE_URL` request/result
  (outcomes: `already-saved` | `realigned` | typed error); runtime-broadcast progress
  variant for tab-less senders.

- [x] Task 2: Failing tests for new `services/youtubeLinkPrealign.ts` (fetch injected for
  tests): validate videoId → fetch watch HTML (30s timeout, youtube-only guard) → extract
  → select ASR → fetch json3 → units via `prepareAsrUnitsForAi` → hash/key → cache check
  (skip LLM on hit) → `service.resegmentYoutubeAsr` → save entry (title from videoDetails,
  existing thumbnail/watch-url helpers) → broadcast `ASR_REALIGN_CACHE_UPDATED`.

- [x] Task 3: Implement orchestration; wire `handleMessage` case in `services/background.ts`;
  reuse `getOrCreateAsrRealignInflight` single-flight.

- [x] Task 4: Add `*://*.youtube.com/*` to `host_permissions` in `wxt.config.ts`; verify
  built manifest. (Verified: `.output/chrome-mv3/manifest.json` includes the pattern.)

- [x] Task: Conductor - User Manual Verification 'Phase 2' (Protocol in workflow.md)
  — Automated gates green (615 tests, lint 0, tsc 0, wxt build OK). UI-level manual
  verification deferred to Phase 5 smoke.

## Phase 3: Cache-Key Parity — Canonicalize on fmt=json3 (TDD)
<!-- execution: sequential -->
<!-- depends: phase2 -->

- [x] Task 1: Failing test — proactive playback fetch normalizes the track URL through
  `buildJson3TimedtextUrl` (coordinator `activateYoutubeTrackViaPipeline` path).

- [x] Task 2: Implement normalization in the proactive path only (intercept path stays
  passive — it receives whatever the player requests); confirm json3 `transformResponse`
  coverage. (Only the fetch URL is canonicalized; track identity + native-caption
  fallback keep the original URL. One existing test updated for the new fetch URL.)

- [x] Task 3: Hash-parity test — same caption body yields identical units + contentHash in
  the Settings flow and the playback flow.

- [x] Task: Conductor - User Manual Verification 'Phase 3' (Protocol in workflow.md)
  — Automated gates green (coordinator 29/29, prealign 15/15, lint 0, tsc 0).
  UI-level manual verification deferred to Phase 5 smoke.

## Phase 4: Subtitle Studio UI Card (TDD)
<!-- execution: sequential -->
<!-- depends: phase3 -->

- [x] Task 1: Failing component tests for new
  `entrypoints/options/sections/subtitles/PrealignFromLinkCard.tsx`: URL validation, run
  states, batch progress i/n, already-saved, typed errors, token-cost note, DisabledDimmer
  when subtitles master is off.

- [x] Task 2: Implement card; wire into `SubtitlesSection.tsx` between Caption quality and
  Saved caption re-aligns (fix stagger indices); listen for progress broadcast +
  `ASR_REALIGN_CACHE_UPDATED`. (Card listens for `ASR_REALIGN_PROGRESS_BROADCAST`;
  `SavedCaptionRealignsCard` already refreshes on `ASR_REALIGN_CACHE_UPDATED`.)

- [x] Task 3: Update `SubtitlesSection.test.tsx` section-level coverage (heading present +
  DOM order Caption quality → Re-align from link → Saved caption re-aligns).

- [x] Task: Conductor - User Manual Verification 'Phase 4' (Protocol in workflow.md)
  — Automated gates green (card 16/16, section 18/18, lint 0, tsc 0). Interactive
  smoke deferred to Phase 5.

## Phase 5: Regression, Lint & Manual Smoke
<!-- execution: sequential -->
<!-- depends: phase4 -->

- [x] Task 1: Full `pnpm test` green. (633/633 on the final tree; two earlier runs showed
  pre-existing timing-flaky tests — StatisticsSection interactions, AdvancedSection.backup
  undo toast, background.test.ts chunk-retry — all pass in isolation and moved between
  runs; unrelated to this track.)

- [x] Task 2: `pnpm lint` + `tsc --noEmit` clean. (eslint 0 errors; tsc 0 errors;
  `wxt build` green with `*://*.youtube.com/*` in the built manifest.)

- [x] Task 3: Manual smoke — paste URL → progress → entry appears in Saved re-aligns; open
  the video → "Using saved re-align" hit, no re-align LLM call; no translation issued during
  pre-align; each error state renders. **Accepted by user for post-implementation manual
  verification** (user runs the live smoke; track marked complete 2026-08-04).

- [x] Task: Conductor - User Manual Verification 'Phase 5' (Protocol in workflow.md)
  — **Accepted by user** (live smoke to be run by user; all automatable gates green).
