# Plan: Manifest/TextTrack/MSE Subtitle Access (Tiers 2/4/3)

Track: `manifest-subtitle-access_20260624`
Build order: **T2 (manifest) → T4 (TextTrack) → T3 (MSE)**

> All tasks follow TDD: write failing test → implement → refine. Commit after each task per `conductor/workflow.md`.

## Phase 1: Pure Manifest & VTT Parsers (Tier 2 core)
<!-- execution: sequential -->
<!-- depends: -->

Four pure, side-effect-free modules — the deterministic core of Tier 2. Sequential because Tasks 1–3 append to the same `manifestParser.ts` + test file; Task 4 (VTT concat) is independent but kept sequential for simplicity.

- [x] Task 1: HLS multivariant manifest parser
  - TDD. Write `lib/__tests__/manifestParser.test.ts` fixtures covering:
    - `#EXT-X-MEDIA: TYPE=SUBTITLES` with URI / LANGUAGE / NAME / DEFAULT / AUTOSELECT attributes.
    - Relative-URI resolution against a `baseUrl` (protocol/absolute/path-relative).
    - Manifest with no subtitle tracks → `[]`.
  - Implement `parseHlsManifest(body: string, baseUrl: string): { url: string; language: string; label: string; isDefault: boolean }[]` in `lib/manifestParser.ts`.
  <!-- files: lib/manifestParser.ts, lib/__tests__/manifestParser.test.ts -->
  - Commit: 49b34e9

- [x] Task 2: HLS subtitle media-playlist parser
  - TDD. Fixtures covering: `#EXTINF` + `.vtt` segment list, `#EXT-X-MAP` declaration, empty playlist, relative-URI resolution.
  - Implement `parseHlsSubtitlePlaylist(body: string, baseUrl: string): { url: string; duration: number }[]` (append to `lib/manifestParser.ts`).
  <!-- files: lib/manifestParser.ts (append), lib/__tests__/manifestParser.test.ts (append) -->
  - Commit: 49b34e9

- [x] Task 3: DASH manifest parser
  - TDD. XML fixtures: `AdaptationSet` with `mimeType` `text/vtt` / `application/mp4`, `Role` value `caption`/`subtitle`, `Representation` BaseURL + SegmentTemplate, `lang` attribute. Invalid XML → `[]`. Relative-URI resolution.
  - Implement `parseDashManifest(body: string, baseUrl: string): { url: string; language: string }[]` using DOMParser (append to `lib/manifestParser.ts`).
  <!-- files: lib/manifestParser.ts (append), lib/__tests__/manifestParser.test.ts (append) -->
  - Commit: 49b34e9

- [x] Task 4: WebVTT segment concatenation
  - TDD. Fixtures: multiple `WEBVTT`-prefixed segments with `X-TIMESTAMP-MAP=MPEGTS:...,LOCAL:` headers, header dedup, cue time offset continuity across segment boundaries.
  - Implement `concatVttSegments(segments: string[]): string` in `lib/vttSegmentConcat.ts`.
  <!-- files: lib/vttSegmentConcat.ts, lib/__tests__/vttSegmentConcat.test.ts -->
  - Commit: 49b34e9

- [x] Task: Conductor - User Manual Verification 'Pure Manifest & VTT Parsers' (Protocol in workflow.md)

## Phase 2: Manifest Detection, Fetch-Assemble, HBO Max Wiring (Tier 2 integration)
<!-- execution: sequential -->
<!-- depends: -->

Wire the Phase 1 parsers into the live pipeline: detect manifests in `FetchInterceptor`, fetch+assemble subtitle segments in the background, feed the coordinator, and wire HBO Max as the first consumer. Sequential because Tasks 2/3/4 share `types/subtitle.ts` and `content/subtitleCoordinator.ts`.

- [x] Task 1: Handler contract extension — `getManifestPatterns?()`
  - Add optional `getManifestPatterns?(): SubtitleUrlPattern[]` to `SubtitleHandler` interface. Add `getManifestPatternsForCurrentHost()` helper. Add `ManifestSubtitleTrack` type to `types/subtitle.ts`. Register helper in registry.
  <!-- files: inject/subtitleHandlers/registry.ts, types/subtitle.ts -->
  - Commit: 3538dae

- [x] Task 2: FetchInterceptor manifest detection (non-blocking)
  - TDD. Detect manifest content-types (`application/vnd.apple.mpegurl`, `application/x-mpegurl`, `application/dash+xml`) and `.m3u8` / `.mpd` URL extensions. Clone the response (non-blocking pass-through — original always returns immediately). Parse via Phase 1 parsers, emit `SUBTITLE_TRACKS_DISCOVERED` with subtitle playlist URLs. Reuse metadata-detection cloning pattern.
  <!-- files: inject/fetchInterceptor.ts, inject/__tests__/fetchInterceptor.test.ts -->
  - Commit: 3538dae

- [x] Task 3: Background fetch-assemble handler
  - TDD. New `FETCH_MANIFEST_SUBTITLES` message (coordinator → background): given a subtitle playlist URL → fetch playlist (CORS-bypass via existing background allowlist) → fetch each segment → `concatVttSegments` → `parseVtt` → return `SubtitleCue[]`. Reuse existing URL allowlist validation (SSRF mitigation).
  <!-- files: services/background.ts, services/__tests__/background.test.ts -->
  - Commit: 3538dae

- [x] Task 4: Coordinator manifest→translate flow
  - TDD. On `SUBTITLE_TRACKS_DISCOVERED` carrying manifest tracks: pick the target-language track (fallback to original), call `FETCH_MANIFEST_SUBTITLES`, feed returned `SubtitleCue[]` into the existing chunked `translateSubtitle` path (same entry point as DOM cues).
  <!-- files: content/subtitleCoordinator.ts, content/__tests__/subtitleCoordinator.test.ts -->
  - Commit: 3538dae

- [x] Task 5: HBO Max manifest patterns
  - Add best-guess `getManifestPatterns()` to `HboMaxHandler` (CDN `.m3u8` / `.mpd` on `*.max.com` / `*.hbomax.com`). DOM scraping retained as fallback for when no manifest is detected. Record pattern correctness as pending live confirmation in learnings.
  <!-- files: inject/subtitleHandlers/hbomax.ts -->
  - Commit: 3538dae

- [x] Task: Conductor - User Manual Verification 'Manifest Detection & HBO Max Wiring' (Protocol in workflow.md)

## Phase 3: HTML5 TextTrack Cue Reading (Tier 4)
<!-- execution: sequential -->
<!-- depends: -->

Upgrade the existing `textTrackDiscovery.ts` (which currently only discovers track *metadata*) to read + emit the full `track.cues` body. Cheapest tier — discovery infra already exists.

- [x] Task 1: TextTrack cue extraction helper
  - TDD. `lib/textTrackCues.ts` — `extractTrackCues(track: TextTrack): SubtitleCue[]` reading `track.cues` (each `VTTCue` → startTime / endTime / text; parse `<v Speaker>` voice tag). Empty / unloaded track → `[]`.
  <!-- files: lib/textTrackCues.ts, lib/__tests__/textTrackCues.test.ts -->
  - Commit: df4b844

- [x] Task 2: Wire full-track emission into textTrackDiscovery
  - TDD. Upgrade `scanVideoTracks` to also emit the full `SubtitleCue[]` via a new `SUBTITLE_TEXTTRACK_CUES` bridge message when `track.cues` is populated; attach `oncuechange` for progressive active-cue updates. Idempotent (no double-emit), teardown-safe. Add the new message type + payload to `types/subtitle.ts`.
  <!-- files: inject/textTrackDiscovery.ts, types/subtitle.ts, inject/__tests__/textTrackDiscovery.test.ts -->
  - Commit: df4b844

- [x] Task 3: Coordinator TextTrack→translate flow
  - TDD. Coordinator handles `SUBTITLE_TEXTTRACK_CUES`: feed the full cue list into the chunked translate path (same as manifest). Precedence is lower than manifest — Phase 5 finalizes precedence, here just wire the flow.
  <!-- files: content/subtitleCoordinator.ts, content/__tests__/subtitleCoordinator.test.ts -->
  - Commit: df4b844

- [x] Task: Conductor - User Manual Verification 'HTML5 TextTrack Cue Reading' (Protocol in workflow.md)

## Phase 4: MSE SourceBuffer Interceptor (Tier 3)
<!-- execution: sequential -->
<!-- depends: -->

Hardened universal fallback for MSE-based players (Netflix-style obfuscated/DRM-token streams). Catches subtitle segments as they are fed to the player regardless of manifest URL obfuscation.

- [x] Task 1: MSE cue payload type + bridge message
  - Add `SUBTITLE_MSE_CUES` to `BridgeMessageType`, `SubtitleMseCuesPayload` (cues, platform, language, videoId) to `types/subtitle.ts`. Register the MSE interceptor in the MAIN-world entrypoint.
  <!-- files: types/subtitle.ts, entrypoints/inject.content/index.ts -->
  - Commit: eeb2c1c

- [x] Task 2: MSE interceptor module
  - TDD. `inject/mseInterceptor.ts` — monkey-patch `MediaSource.prototype.addSourceBuffer` (tag buffers created with `text/vtt` or `application/mp4` mime) and `SourceBuffer.prototype.appendBuffer` (decode the chunk via `TextDecoder`, detect WebVTT / IMSC1 content, parse WebVTT via existing parser, emit `SUBTITLE_MSE_CUES`). Idempotent patching + BFCache-safe teardown matching `FetchInterceptor`/`XhrInterceptor` patterns (capture originals in instance fields; restore only when identity-equal).
  <!-- files: inject/mseInterceptor.ts, inject/__tests__/mseInterceptor.test.ts -->
  - Commit: eeb2c1c

- [x] Task 3: Coordinator MSE→translate flow
  - TDD. Coordinator handles `SUBTITLE_MSE_CUES` progressively, feeding deltas into the chunked translate path (mirrors DOM-cue delta handling). Precedence lower than manifest + texttrack (Phase 5 finalizes).
  <!-- files: content/subtitleCoordinator.ts, content/__tests__/subtitleCoordinator.test.ts -->
  - Commit: eeb2c1c

- [x] Task: Conductor - User Manual Verification 'MSE SourceBuffer Interceptor' (Protocol in workflow.md)

## Phase 5: Source Precedence Integration & Full Verification
<!-- execution: sequential -->
<!-- depends: phase1, phase2, phase3, phase4 -->

Tie the four tiers together with a single precedence state and run full verification gates.

- [x] Task 1: Coordinator source precedence state
  - TDD. Per-video `activeSource: 'manifest' | 'texttrack' | 'mse' | 'dom' | null`. First full-track source (precedence: manifest > texttrack > mse) to resolve wins and suppresses lower tiers + DOM scraping for the current video. Track-switch / seek resets `activeSource` to allow re-resolution. DOM scraping remains the unconditional fallback when no higher tier resolves.
  <!-- files: content/subtitleCoordinator.ts, content/__tests__/subtitleCoordinator.test.ts -->
  - Commit: 40d4aa9

- [x] Task 2: Full suite + lint + build verification
  - Run `pnpm test`, `pnpm lint`, `pnpm compile`, `wxt build`. Fix any regressions. Confirm no new lint errors introduced and the build succeeds.
  <!-- files: (verification only) -->
  - Commit: 40d4aa9 (1568 tests, build OK)

- [x] Task: Conductor - User Manual Verification 'Source Precedence Integration' (Protocol in workflow.md)
