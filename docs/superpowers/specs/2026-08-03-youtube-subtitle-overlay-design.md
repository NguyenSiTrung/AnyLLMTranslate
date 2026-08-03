# YouTube Subtitle Overlay Activation

## Problem

On YouTube watch pages, subtitle tracks may be present only in the embedded
player response (`ytInitialPlayerResponse` or
`ytplayer.config.args.raw_player_response`) rather than in a fetch response
matching the extension's `/youtubei/v1/player` metadata pattern. When
auto-activation is enabled, the coordinator can therefore have no track to
activate.

Some YouTube caption URLs also require a player-generated PoToken. A direct
content-script fetch can return HTTP 429 even though the YouTube player can
request the same captions successfully. The reported video exhibits both
conditions.

## Goals

- Discover YouTube caption tracks from embedded player metadata.
- Preserve the existing interception, parsing, translation, and overlay
  rendering pipeline.
- Recover from direct timedtext fetch failures by asking YouTube's own player to
  request captions, allowing the existing MAIN-world interceptor to capture the
  tokenized response.
- Avoid leaving native captions enabled when the translated overlay owns
  display.
- Restore the original native-caption state during cleanup.

## Non-goals

- Reimplement YouTube's PoToken generation.
- Depend on YouTube's private token format or player internals beyond the stable
  caption button and embedded player response locations.
- Change subtitle translation, cue parsing, ASR resegmentation, or renderer
  behavior outside YouTube activation.

## Architecture and Data Flow

1. The MAIN-world YouTube metadata watcher checks the embedded player response
   on initial load and after `yt-navigate-finish`/SPA changes.
2. It normalizes the response through `YouTubeHandler.extractAvailableTracks`
   and emits `SUBTITLE_TRACKS_DISCOVERED` through the existing bridge.
3. When the video starts and auto-activation is enabled, the coordinator tries
   the current direct timedtext pipeline first.
4. If the direct request fails or produces no cues, the coordinator sends a
   `YOUTUBE_REQUEST_CAPTIONS` command to the MAIN world.
5. The MAIN world clicks `.ytp-subtitles-button` only when captions are
   currently off. The existing fetch/XHR interceptor captures the resulting
   tokenized `/api/timedtext` response and emits `SUBTITLE_INTERCEPTED`.
6. The coordinator translates and displays the intercepted cues through the
   existing overlay path, then hides YouTube's caption DOM.
7. Cleanup restores native captions only if the extension enabled them for this
   fallback request.

The fallback is guarded per video/track request so a failed direct fetch does
not cause repeated button clicks or activation loops. SPA navigation resets
that guard with the existing coordinator navigation epoch.

## Error Handling

- Embedded response parsing failures are ignored without affecting YouTube.
- Missing caption controls produce a warning and leave native/player state
  untouched.
- Direct timedtext HTTP failures trigger the player-request fallback once.
- If the player request cannot be captured, the existing interceptor timeout
  returns the native response and the user retains normal YouTube captions.
- Native caption restoration is best-effort and only applies to state changed by
  the extension.

## Testing

- Test extraction of auto-generated tracks from embedded player-response
  objects, including video ID and caption URL.
- Test the MAIN-world caption request helper for off/on button states and
  idempotent fallback requests.
- Test that the coordinator dispatches the player fallback after direct fetch
  failure and does not repeat it for the same track.
- Run focused subtitle tests, the complete Vitest suite, TypeScript compile,
  and ESLint.

## Acceptance Criteria

- With auto-activation enabled, the reported YouTube video discovers its
  English auto-generated track without requiring a `/youtubei/v1/player`
  response.
- If direct timedtext fetch returns HTTP 429, the extension requests captions
  through the YouTube player and the existing interceptor receives the
  tokenized response.
- The translated overlay appears while native YouTube captions are hidden.
- Native captions are restored when the extension session is cleaned up.
- Existing subtitle tests and project quality checks pass.
