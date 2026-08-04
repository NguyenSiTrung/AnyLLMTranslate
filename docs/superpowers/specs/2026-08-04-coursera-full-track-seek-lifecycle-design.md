# Coursera Full-Track Seek Lifecycle Design

**Status:** Approved 2026-08-04

## Problem

On the supplied Coursera lesson, AnyLLMTranslate discovers 30 HTML5 subtitle
tracks and selects the English `subtitleAssetProxy.v1` VTT. The overlay shell is
also attached to the correct video. Nevertheless, its original and translated
text nodes become empty.

The direct full-file VTT path currently duplicates the subtitle activation
pipeline and marks the static Coursera track as the progressive `manifest`
source. It does not register the parsed cues as full-track coverage and does not
allocate a content-owned translation session before awaiting the background.
Consequently:

- Coursera's startup or resume `seeked` event enters the rolling-source reset
  path, cancels translation, and sends an empty cue array to the renderer.
- Progressive translation chunks can be rejected before the response supplies
  a session ID.
- Later chunks can be routed through the manifest text-map path even though its
  rolling manifest cue buffer is empty.

The captured extension build was produced at 22:50, while the supplied log and
saved HTML were captured at 22:52. The failure was therefore reproduced with
the current build and is a remaining cue lifecycle defect, not an outdated
loaded extension.

## Goal

Coursera English subtitle tracks must produce a continuously visible
English-to-Vietnamese (`en` to `vi`) overlay. Player startup/resume seeks within
the downloaded track's cue range must preserve the overlay and translation
session.

## Non-goals

- Coursera-specific DOM selectors or settings.
- Changes to VTT URL discovery, language matching, overlay geometry, or player
  chrome.
- Redesigning the HLS/DASH, MSE, or DOM rolling-cue pipelines.
- Changing the behavior of genuinely out-of-range seeks.

## Chosen Approach

Route direct, complete subtitle files through the existing parsed full-track
activation lifecycle instead of maintaining a second translation path.

`activateOverlayMode` remains responsible for fetching and parsing a direct
subtitle URL. After parsing, it delegates cue rendering and translation to
`activateOverlayWithParsedCues`, the same lifecycle already used by intercepted
full files and proactive YouTube tracks. The caller supplies the selected
track's language as a source-language hint, allowing the accepted Coursera case
to resolve explicitly to English while the configured target remains
Vietnamese.

The existing `interceptOriginalCues` field already serves as the coordinator's
full-track coverage buffer and is used by seek and source-precedence guards.
This focused fix reuses that field through the shared helper; renaming or
generalizing all subtitle source state is outside scope.

Static `.vtt`, `.srt`, `.ttml`, and similar full-file URLs must not be labeled
as the progressive manifest tier. Only `.m3u8` and `.mpd` tracks continue down
the manifest assembly path.

## Components and Responsibilities

### Track selection

`selectSubtitleTrack` continues to distinguish HLS/DASH manifests from direct
subtitle files. For a direct Coursera VTT, it passes both the URL and selected
track language to the direct-file activation function.

### Direct-file fetch and parse

`activateOverlayMode` fetches the file with the existing content/background
fallback, parses it, and exits without disturbing native captions when fetching
or parsing fails. It no longer owns a duplicate translate-before-render block
or assigns `activeSource = 'manifest'` for a complete file.

### Shared full-track activation

`activateOverlayWithParsedCues` owns the rest of the lifecycle:

1. Record the complete parsed cue array as full-track coverage.
2. Attach the original English cues immediately to the coordinator-selected
   video through the shared renderer lifecycle.
3. Allocate and publish the content-owned session ID before the background
   translation request.
4. Request translation with source `en` and target `vi`.
5. Accept matching progressive chunk updates through the ordinary offset-based
   cue merge.
6. Replace source fallback text with Vietnamese translations as chunks arrive.

### Seek handling

The existing in-range seek guard checks the recorded full-track cue range.
Coursera startup/resume seeks within that range update the playback priority
anchor but do not cancel the session or clear renderer cues. Out-of-range seeks
and rolling-source seeks retain their current reset behavior.

## Data Flow

1. HTML5 discovery reports the Coursera English track and its VTT URL.
2. Auto-activation selects the track after playback starts.
3. The coordinator fetches and parses the complete VTT.
4. The shared full-track lifecycle renders English fallback cues immediately.
5. A session ID is allocated before the `translateSubtitle` request.
6. The background translates `en` to `vi` and returns matching chunk/session
   messages.
7. The overlay upgrades cues in place to Vietnamese.
8. A startup/resume seek inside the VTT range preserves both cues and session.

## Error Handling

- Fetch or parse failure leaves Coursera's native captions available and does
  not create an empty custom overlay.
- Renderer attachment failure continues to use the bounded dynamic-player
  retry lifecycle from the previous Coursera attachment fix.
- Translation failure destroys the custom overlay and restores any HTML5 track
  modes changed by AnyLLMTranslate, preserving readable native captions.
- Session-mismatched chunks remain rejected as stale.
- True HLS/DASH tracks remain on the manifest-map path and are unaffected.

## Testing

Add focused regression coverage that reproduces the supplied sequence:

1. Discover/select a Coursera English HTML5 VTT with target language `vi`.
2. Verify the direct track enters the shared full-track lifecycle rather than
   the progressive manifest-map lifecycle.
3. Verify original English cues are attached before translation completes.
4. Dispatch a startup/resume seek within the cue range and assert that no
   `CANCEL_SUBTITLE_SESSION` message or empty renderer update occurs.
5. Deliver a matching Vietnamese translation chunk and assert that the overlay
   receives the translated cue instead of an empty array.
6. Verify a mismatched session remains rejected.
7. Preserve existing out-of-range seek and HLS/DASH manifest regression tests.

Implementation must follow test-driven development: add and observe the focused
failure first, make the smallest production change, then run the relevant
subtitle suites followed by TypeScript, ESLint, the full Vitest suite, and the
production build.

## Acceptance Criteria

- The supplied Coursera player displays Vietnamese translations for its
  English subtitle track.
- The overlay remains populated after the player's startup/resume seek.
- Translation chunks are accepted only for the active session and update the
  ordinary cue array.
- Direct full-file tracks are not routed through empty progressive manifest
  buffers.
- Native captions remain available on fetch, parse, attachment, or translation
  failure.
- Existing progressive subtitle sources retain their current behavior and all
  quality gates pass.
