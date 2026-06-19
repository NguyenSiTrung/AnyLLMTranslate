# Track Learnings: hbomax-dom-cue-subtitles_20260619

Patterns, gotchas, and context discovered during implementation.

## Key Patterns Discovered

### DOM Cue Scraping (new paradigm)
- **Stable-ancestor observation for React-rendered captions** — Observe a stable ancestor (`caption_renderer_overlay`), not the cue node directly. React may *recreate* `cueBoxRowTextCue` across transitions; a direct `characterData` observer on the cue node would silently detach. Re-resolve the cue selector from `document` on each mutation fire.
- **Far-future endTime for open cues** — Use `endTime = currentTime + 86400` for the currently-active cue so the overlay's `findActiveCue()` can match it. The next cue will close this one precisely. Without this, the open cue has `startTime === endTime` and never matches.
- **Deferred-attach for SPA players** — Max mounts its React player after `DOMContentLoaded`. The scraper observes `document.documentElement` for added nodes and (re)attaches the cue observer + video listener when both the `<video>` and caption overlay appear. Mirrors `textTrackDiscovery.ts`'s deferred-attach pattern.
- **Track-change observer must filter to text-track buttons only** — Max has other `aria-checked` controls (settings toggles, audio menu). The `trackObserver` must check `data-testid="player-ux-text-track-button"` before resetting the cue buffer, or unrelated UI interactions will wipe the buffer.
- **Rolling buffer reset on track switch** — A different track's cues are unrelated to the prior buffer. Reset `cues`, `lastText`, and `openCue` when the active track changes mid-session.

### Caption Hiding
- **`visibility: hidden !important` over `display: none`** — `visibility: hidden` preserves box geometry, triggers no reflow, and keeps the caption renderer producing cues (Max is unaware we've hidden them visually). `display: none` risks reflow and React re-mount detection. Max itself uses `visibility: hidden` for `up_next`/`skip` — play by the platform's rules.
- **`!important` required for inline styles** — Max sets inline `visibility: visible`; we must win the cascade without mutating Max's inline style (React would overwrite it on next render anyway).
- **Never click "Off" to hide captions** — Turning captions off stops `cueBoxRowTextCue` rendering, destroying the cue source. The caption renderer must stay *active and updating*; we only make it visually invisible.

### Activation
- **Precondition on visible captions for DRM platforms** — Auto-activate on play only if the platform's caption overlay is present and visible. If captions are off, show a guidance toast ("Enable subtitles in Max...") instead of silent failure. Respects the user's explicit accessibility choice on a paid DRM site.
- **`preferredSubtitleLanguage` is a filter, not a picker, for DOM-sourced platforms** — We don't pick tracks (no programmatic track switching on DRM sites). It means "only auto-activate if the currently-active track matches this language."

### Fullscreen Overlay
- **Reparent overlay into fullscreen player container** — For HBO Max, the fullscreen element is the player container (not the `<video>` itself). The overlay must be appended to the fullscreen element, not `document.body`. Use Popover API (`showPopover()`) for Top Layer support when the fullscreen element is the video.
- **Filter track-change observer to text-track buttons only** — (repeated from above, but this was a real bug: `aria-checked` mutations from settings/audio menus were falsely resetting the cue buffer).

### Auto Font Size
- **Auto font size based on video height** — `calculateAutoFontSize(videoHeight)` scales font size proportionally (`videoHeight * ratio` clamped to min/max), recalculated on video resize via ResizeObserver.

## Codebase Patterns (Inherited)

- **Cleanup function return pattern** — `startDomCueSource()` returns `() => void` cleanup, mirroring `textTrackDiscovery.ts` and `startVideoPlaybackWatcher()`.
- **Bridge message pattern** — New `SUBTITLE_DOM_CUES` message follows the existing `SUBTITLE_INTERCEPTED` / `SUBTITLE_TRACKS_DISCOVERED` pattern: type in `BridgeMessageType`, payload interface, sender in inject world, receiver in content world.
- **Coordinator state extension** — New `captionHideStyle: HTMLStyleElement | null` field added to `CoordinatorState`, restored in `resetCoordinatorState()` and coordinator cleanup.

## Gotchas

- **jsdom MutationObserver limitations** — Tests using `MutationObserver` under jsdom may need manual flushing (`vi.runAllTimers()`). jsdom has partial MutationObserver support.
- **`video.currentTime` must be mocked** — In unit tests, `Object.defineProperty(video, 'currentTime', { configurable: true, get: () => value })` is needed since it's a native getter.
- **DRM prevents E2E** — No headless automation possible for Max playback. Final verification is manual.
