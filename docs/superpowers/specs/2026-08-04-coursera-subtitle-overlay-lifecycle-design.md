# Coursera Subtitle Overlay Lifecycle Design

## Problem

On Coursera lesson pages, subtitle translation reaches the successful
`Subtitles processing…` state, but the translated overlay is not visible. The
player is dynamic and can expose more than one `<video>` element or replace the
active element while metadata is loading. The current coordinator marks the
overlay session active while the renderer performs a separate video lookup,
which can select a different element or find no ready element. Because the
session is already active, there is no reliable retry. HTML5 native captions
also remain visible when the overlay is driven by a `TextTrack`.

## Goals

- Attach the overlay to the same primary video selected by the coordinator.
- Retry attachment when a dynamic player becomes ready or is remounted.
- Preserve the existing overlay positioning and fullscreen behavior.
- Hide native HTML5 subtitle tracks only after the custom overlay is attached.
- Restore native track visibility during cleanup or failed attachment.
- Keep the fix platform-agnostic, without adding Coursera-specific selectors or
  settings.

## Non-goals

- Redesigning the overlay's player-root positioning.
- Changing Coursera subtitle URL parsing or language detection.
- Adding a new subtitle setting or changing auto-activation behavior.
- Replacing the existing custom overlay with native `VTTCue` rendering.

## Architecture

The coordinator remains the owner of subtitle-session state and video
selection. `SubtitleRenderer.initialize` receives the resolved video element
and returns whether attachment succeeded. `OverlayRenderer` forwards that
element to the overlay module, which uses it directly rather than resolving a
second element.

When initialization cannot attach because no usable video exists, the
coordinator retains the translated cue/session state and schedules a bounded
retry lifecycle. Retry triggers are:

- `loadedmetadata`, `canplay`, and `play` on the current video;
- player/video DOM replacement observed by a narrowly scoped mutation observer;
- a short retry timer for a player that mounts after the initial message.

When a new primary video is selected, the renderer is destroyed and
reinitialized with the new element. Existing cue state and overlay settings are
reused. The lifecycle has one active retry observer/timer per coordinator
session and clears all of them on cleanup, navigation, track change, or
successful attachment.

## Data Flow

1. Coursera interception or TextTrack discovery produces parsed cues.
2. The coordinator resolves the primary video and begins the existing
   translation request.
3. The renderer initializes using that exact video reference.
4. If attachment succeeds, the overlay receives cues and native HTML5 subtitle
   tracks are set to `hidden`.
5. If attachment is not yet possible, the renderer/session remains pending and
   retries when the player signals readiness or remounts.
6. Translation updates continue through the existing `updateCues` path.
7. Cleanup destroys the renderer, removes retry listeners/observers, and
   restores native track modes that were changed by the extension.

The native-track restoration logic records only tracks changed from `showing`
to `hidden`; it does not alter tracks that were already hidden or disabled.

## Error Handling

- Missing video during initial activation is treated as a recoverable pending
  attachment, not a successful active renderer.
- If a renderer initialization or retry throws, the session remains safe to
  retry and the original subtitle path is not modified further.
- If translation fails, existing failure handling remains unchanged and native
  captions remain available.
- If the video is replaced, stale event listeners and observers are removed
  before binding the replacement.
- Cleanup is idempotent and best-effort, including when a page or extension
  context is already unloading.

## Testing

Add focused unit coverage for:

- forwarding the coordinator's selected video into renderer initialization;
- delayed attachment when no video is available initially;
- attachment after `loadedmetadata`/`play`;
- replacement of the selected video without duplicate listeners;
- native TextTrack hiding only after successful overlay attachment;
- restoration of previously showing tracks on cleanup;
- preserving existing cue updates and overlay configuration.

Run the relevant subtitle coordinator and overlay suites first, followed by
type-checking, lint, and the full test suite.
