# Spec: Manifest/TextTrack/MSE Subtitle Access (Tiers 2/4/3)

Track: `manifest-subtitle-access_20260624`
Created: 2026-06-24
Priority: 🟡 Medium

## Overview

DRM/MSE streaming platforms (HBO Max, plus the allowlisted Netflix/Amazon/Vimeo) currently rely on **DOM cue scraping (Tier 5)**, which can only translate the *currently-displayed* cue with timing inferred from `video.currentTime`. This track upgrades subtitle access to higher tiers that yield the **full subtitle track upfront** with exact timestamps:

- **Tier 2 — HLS/DASH manifest parsing:** Detect & parse streaming manifests (`.m3u8`/`.mpd`) to find unencrypted WebVTT subtitle playlists/segments, fetch them directly, parse into the full cue list. **HBO Max is the first concrete consumer.**
- **Tier 4 — HTML5 TextTrack cue reading:** Upgrade the existing `textTrackDiscovery.ts` (which only *discovers* tracks) to read `track.cues` — the entire track — and emit it for upfront translation, plus `oncuechange` for progressive active-cue updates.
- **Tier 3 — MSE `SourceBuffer` hooking:** Monkey-patch `MediaSource.prototype.addSourceBuffer` + `SourceBuffer.prototype.appendBuffer` to catch subtitle segments fed to MSE-based players (Netflix-style obfuscated/DRM-token streams) as a hardened universal fallback.

All three feed the **existing** translation pipeline (chunking, caching, overlay). Build order: **T2 → T4 → T3**.

## Background — Access Tier Hierarchy

| Tier | Technique | When Available | Full Track Upfront? |
|------|-----------|----------------|---------------------|
| 🥇 1 | XHR/Fetch intercept of full VTT/SRT | YouTube, Udemy, Coursera | ✅ |
| 🥈 2 | Parse HLS/DASH manifest → fetch subtitle tracks directly | Netflix, HBO Max*, Disney+ | ✅ |
| 🥉 3 | MSE `SourceBuffer.appendBuffer` hooking | Encrypted segmented streams | ✅ (progressive) |
| 4 | `TextTrack` cue hijacking (`track.cues`) | Standard HTML5 players | ✅ |
| 5 | DOM scraping (current HBO Max/Youku path) | Last resort | ❌ only current |

Key technical truth: **DRM (Widevine/PlayReady/FairPlay) encrypts video + audio, not subtitles.** Subtitle tracks are delivered as separate, unencrypted WebVTT segments referenced in the HLS/DASH manifest. An extension can fetch them directly once it finds the manifest URL.

## Functional Requirements

### Tier 2 — Manifest Parsing

- **FR1** — Generic manifest parsers (pure, no network, side-effect-free):
  - `parseHlsManifest(body, baseUrl)` — multivariant playlist; extract `EXT-X-MEDIA: TYPE=SUBTITLES` entries (URI / LANGUAGE / NAME / DEFAULT / AUTOSELECT); resolve relative URIs against `baseUrl`.
  - `parseHlsSubtitlePlaylist(body, baseUrl)` — media playlist; extract segment URLs (`#EXTINF` + `.vtt`), handle `#EXT-X-MAP`, resolve relative URIs.
  - `parseDashManifest(body, baseUrl)` — XML via DOMParser; extract `AdaptationSet` with text/vtt|application/mp4 `mimeType`, `Role` value `caption`/`subtitle`, `Representation` BaseURL + SegmentTemplate; read `lang` attribute. Invalid XML → `[]`.
  - `concatVttSegments(segments: string[])` — dedup `WEBVTT` headers, handle `X-TIMESTAMP-MAP=MPEGTS:...,LOCAL:`, offset cue times across segment boundaries.

- **FR2** — Manifest detection in `FetchInterceptor` (content-type + extension, non-blocking pass-through like metadata interception): on match, clone the response, parse it, emit `SUBTITLE_TRACKS_DISCOVERED` with the discovered subtitle playlist URLs. **Never block playback** — original response always passes through immediately.

- **FR3** — Handler contract extension: optional `getManifestPatterns?(): SubtitleUrlPattern[]` + manifest-track extraction. HBO Max declares best-guess manifest patterns (correctness pending live confirmation — out of scope for this track).

- **FR4** — Subtitle segment fetch + assemble: coordinator/background fetches the discovered subtitle playlist URL (CORS-bypass via existing background allowlist), fetches the listed segments, runs `concatVttSegments` → `parseVtt` → `SubtitleCue[]` → feeds the existing chunked `translateSubtitle` path (same entry point as DOM cues).

### Tier 4 — TextTrack Cue Reading

- **FR5** — For each detected `subtitles`/`captions` `TextTrack`, read `track.cues` and emit the full `SubtitleCue[]`. Attach `oncuechange` to surface progressive active-cue updates. Upgrade the existing `textTrackDiscovery.ts` (which currently only *discovers* track metadata) to also read + emit cue bodies.

### Tier 3 — MSE `SourceBuffer` Hooking

- **FR6** — `inject/mseInterceptor.ts`: monkey-patch `MediaSource.prototype.addSourceBuffer` (tag buffers created with `text/vtt` or `application/mp4` mime) and `SourceBuffer.prototype.appendBuffer` (decode the chunk, detect WebVTT/IMSC1 content, parse, emit `SUBTITLE_MSE_CUES` progressively). Idempotent patching + BFCache-safe teardown matching the existing `FetchInterceptor`/`XhrInterceptor` patterns.

### Integration

- **FR7** — Coordinator source precedence: `manifest > texttrack > mse > dom`. First full-track source to resolve wins and suppresses lower tiers (and DOM scraping) for the current video. Track-switch / seek resets the precedence state to allow re-resolution.

## Non-Functional Requirements

- Pure parsers are deterministic, side-effect-free, fully unit-tested with fixture data (sample `.m3u8` / `.mpd` / `.vtt` segments).
- Interceptors are idempotent (safe to re-enable), BFCache-safe (teardown on `pagehide`, re-enable on `pageshow` with `event.persisted`), and follow the same teardown patterns as `FetchInterceptor`/`XhrInterceptor`.
- **No new permissions** required — content-type + URL-extension detection avoids `webRequest`/`webNavigation`.
- **≥ 80% test coverage** on all new modules.
- Reuse the existing background CORS-bypass allowlist for segment fetches (no new SSRF surface).
- Maintain the postMessage bridge origin-validation invariant on all new MAIN-world listeners.

## Acceptance Criteria

- **AC1** — Manifest/VTT parsers pass against fixture `.m3u8` / `.mpd` / `.vtt` data (correct language code, playlist URL, segment URL, and cue timing extracted; relative-URI resolution correct).
- **AC2** — `FetchInterceptor` detects manifest content-types, emits `SUBTITLE_TRACKS_DISCOVERED` with subtitle track URLs, and **never blocks playback** (original response always returns immediately).
- **AC3** — `textTrackDiscovery` emits the full `track.cues` as a `SubtitleCue[]` (with correct timing + `<v Speaker>` voice parse) for a standard HTML5 player fixture.
- **AC4** — `mseInterceptor` parses a fixture WebVTT segment from `appendBuffer` into the correct `SubtitleCue[]`.
- **AC5** — All new modules unit-tested; full test suite passes; `pnpm lint` clean (no new errors); `wxt build` succeeds.
- **AC6** — HBO Max handler routes through the generic manifest engine via `getManifestPatterns()`. (Pattern correctness against live Max traffic is pending live confirmation — tracked as a follow-up.)

## Out of Scope

- **Live testing** on HBO Max / Netflix (fixtures only this track).
- **Tier 1 changes** — YouTube/Udemy/Coursera XHR interception remains unchanged.
- **DRM decryption** — subtitles are unencrypted by nature; no decryption attempted.
- **New platform handlers** beyond HBO Max wiring (Netflix/Amazon/Vimeo benefit automatically from the generic engine once they expose manifests).
- **IMSC1 / TTML-in-MP4 deep parsing** — detected & emitted as raw bytes for now; deep IMSC1 parsing deferred to a follow-up.
