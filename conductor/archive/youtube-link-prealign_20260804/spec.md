# Spec: YouTube Link AI Pre-Align from Settings

## Overview
Let users paste a YouTube URL in Options → Subtitle Studio to run AI caption
re-alignment immediately — without playing the video and without translating.
The result is stored in the existing AI re-align cache
(`ai:{videoId}:{language}:{contentHash}`), so a later watch reuses the saved
re-aligned cues and only translation runs at playback.

## Functional Requirements
- FR-1: New dedicated card in Subtitle Studio (between Caption quality and
  Saved caption re-aligns) with a URL input + "Re-align now" button. Accepts
  watch / youtu.be / shorts / embed URLs via existing
  `extractYoutubeVideoIdFromUrl`.
- FR-2: Background fetches the watch-page HTML, extracts
  `ytInitialPlayerResponse`, and reuses the existing track parser to list
  caption tracks; selects the ASR track (`kind=asr`).
- FR-3: Fetch the ASR track `baseUrl` with `fmt=json3` (word-level), build
  timed units with existing pure helpers, compute contentHash + cache key.
- FR-4: Cache check first — if the key exists, report "already saved" and make
  no LLM call (zero token cost).
- FR-5: On miss, run the existing RESEGMENT_YOUTUBE_ASR pipeline (BYOK pool,
  batched, single-flight dedupe) and save via the existing cache store with
  title (from videoDetails), thumbnail, and watch URL.
- FR-6: No translation is triggered at any point in this flow.
- FR-7: Batch progress (i/n) shown in the card via runtime broadcast (options
  page has no tab id; mirrors ASR_REALIGN_CACHE_UPDATED pattern).
- FR-8: Specific error states: invalid URL; video unavailable/private/
  age-gated; no caption tracks; human-uploaded only (no ASR); fetch blocked
  (consent/bot page); provider not configured; LLM failure. Fail-open —
  playback behavior is never affected.
- FR-9: Cache-key parity — Settings flow AND the proactive playback path both
  fetch `fmt=json3` so units and contentHash are identical (also fixes the
  latent proactive-vs-intercept hash divergence).
- FR-10: New entries appear in Saved caption re-aligns via the existing
  ASR_REALIGN_CACHE_UPDATED broadcast.
- FR-11: Token-cost notice in the card; repeat clicks deduped via the existing
  inflight single-flight map.

## Non-Functional Requirements
- NFR-1: Add `*://*.youtube.com/*` to static host_permissions (no new install
  warning; content scripts already match `<all_urls>`).
- NFR-2: Watch-HTML extraction isolated as a pure, testable module; network
  only in background. A youtubei fallback can be added later without touching
  callers.
- NFR-3: No DOMParser in the service worker (json3 path only).
- NFR-4: 30s fetch timeout, consistent with FETCH_SUBTITLE.
- NFR-5: Tests — pure extractor, message handler, UI card, and a hash-parity
  test proving Settings-flow units == playback-path units for the same body.

## Acceptance Criteria
- AC-1: Paste a valid watch URL with ASR captions → progress → success; entry
  visible in Saved caption re-aligns with title/thumbnail.
- AC-2: Opening the same video with subtitles enabled hits the cache ("Using
  saved re-align"), makes no re-align LLM call, and translates the re-aligned
  cues.
- AC-3: Re-running the same URL reports already-saved with zero LLM calls.
- AC-4: Invalid URL / no ASR / unavailable video → specific error, no crash,
  no cache write.
- AC-5: No translation request is issued by this flow (test-verified).
- AC-6: pnpm test, pnpm lint, tsc --noEmit all green.

## Out of Scope
- youtubei/v1/player API fallback (watch-HTML only in v1)
- Translating from Settings (translation stays a playback-time action)
- Non-YouTube platforms; human-uploaded tracks (unchanged by design)
- Playlist/batch URL input
