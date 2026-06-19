# HBO Max — Bilingual Subtitle Translation via DOM Cue Scraping

**Date:** 2026-06-19
**Status:** Design (awaiting implementation plan)
**Surface:** `inject/subtitleHandlers/`, `inject/domCueSource.ts` (new), `content/subtitleCoordinator.ts`, `types/subtitle.ts`, `entrypoints/content.ts`, `entrypoints/inject.content/index.ts`

## Goal

Add bilingual subtitle translation support for HBO Max (`max.com` / `play.hbomax.com`). Max streams DRM-protected MSE video and renders captions itself into the DOM — it exposes neither an interceptable subtitle URL nor native HTML5 `<track>`/`TextTrack` APIs. This requires a new cue source: scraping Max's rendered caption overlay and feeding it into the existing subtitle translation/overlay pipeline.

Youku is explicitly **out of scope** for this pass (deferred to a later design).

## Evidence (from saved Max watch-page HTML)

The design is grounded in the actual Max DOM structure:

```html
<div role="group" aria-label="video player" class="OverlayRootContainer-...">
  <div data-testid="caption_renderer_overlay" style="display: inline; visibility: visible;">
    <div class="Container-...">
      <div class="VerticalCueSpacer-..."></div>
      <div class="RowContainer-...">
        <div class="CaptionWindow-...">
          <div data-testid="cueBoxRowTextCue" class="TextCue-...">leaving his succession in doubt.</div>
        </div>
      </div>
    </div>
  </div>
  <div data-testid="up_next" style="display: inline; visibility: hidden;">…</div>
  <div data-testid="skip"    style="display: inline; visibility: hidden;">…</div>
</div>

<video data-testid="VideoElement" src="blob:https://play.hbomax.com/..."></video>
```

Track selection (separate from the caption overlay):

```html
<button data-testid="player-ux-text-track-button" aria-label="Off"     aria-checked="false" ...>
<button data-testid="player-ux-text-track-button" aria-label="English"  aria-checked="true"  ...>
<button data-testid="player-ux-text-track-button" aria-label="Chinese (Simplified)" aria-checked="false" ...>
<!-- ... Traditional, Indonesian, Malay, Thai, Vietnamese -->
```

Key findings:

1. **Video is DRM/MSE** — `src="blob:..."`. No media interception possible.
2. **No `<track>` element, no native `TextTrack`** — `transformResponse` and `textTrackDiscovery` are inapplicable.
3. **Max renders captions into the DOM** at `[data-testid="cueBoxRowTextCue"]`.
4. **Max hides its own overlays via `visibility: hidden`** (`up_next`, `skip`) — `display: inline` preserved. This is Max's idiomatic hide-pattern.
5. **Track list is exposed** via `[data-testid="player-ux-text-track-button"]` buttons; the active track has `aria-checked="true"`.
6. **If the active track is `Off`, `cueBoxRowTextCue` is absent** — the DOM cue source has nothing to scrape.

## Architecture

```
[Max watch page]
  <video src="blob:...">                     (DRM/MSE — untouched)
  <div data-testid="cueBoxRowTextCue">…</div>  (Max's rendered cue)
       │
       ▼  MutationObserver on stable ancestor (caption_renderer_overlay)
[DomCueSource]  ← NEW
  · observes cueBoxRowTextCue text changes (subtree+childList, re-resolves selector)
  · samples video.currentTime on each change → derives startTime/endTime
  · emits rolling SubtitleCue[] via SUBTITLE_DOM_CUES bridge message
       │
       ▼
[subtitleCoordinator]  (unchanged pipeline — new DOM branch in activation)
  · activateOverlayFromDom(handler)
       │
       ▼ translateSubtitle (chunked, seek-aware priority queue — unchanged)
       ▼
[subtitleOverlay]  (unchanged — renders bilingual over <video>)
       +
[NativeCaptionHider]  ← NEW: injects <style> visibility:hidden on caption_renderer_overlay
```

No new translation path, no new overlay renderer, no new UI. The only new work is *where the cues come from* and hiding Max's native caption window while our overlay is active.

## Design Decisions

### Decision 1: Hide Max's native captions via `visibility: hidden !important`

**Choice:** Inject a `<style>` element:
```css
[data-testid="caption_renderer_overlay"] { visibility: hidden !important; }
```
On teardown, remove the `<style>` element so Max's captions return to their prior state.

**Why this choice (analyzed against alternatives):**

| Option | Layout impact | React risk | Matches Max idiom | Cue scraping survives |
|---|---|---|---|---|
| A. `visibility:hidden` on `caption_renderer_overlay` ✅ | None | None | ✅ (same as `up_next`/`skip`) | ✅ |
| B. `visibility:hidden` on inner `CaptionWindow` only | None | None | ⚠️ partial | ✅ |
| C. `display:none` on overlay | Reflow risk | ⚠️ Max may detect 0-size | ❌ | ✅ |
| D. Click Max's "Off" button | Native | ✅ clean | ✅ | ❌ **kills our cue source** |

- **Max itself uses `visibility: hidden`** to hide `up_next`/`skip` while keeping `display: inline`. We play by Max's rules.
- `visibility: hidden` preserves box geometry, triggers no reflow, no React re-mount. Max's caption renderer keeps producing cues based on video time, unaware we've hidden them visually.
- `!important` is required because Max sets inline `visibility: visible`; we must win the cascade without mutating Max's inline style (which React would overwrite on next render anyway).
- **Cannot use Max's "Off" button** (option D): turning captions off stops `cueBoxRowTextCue` rendering, destroying our cue source. We must keep Max's caption renderer *active and updating*; we only make it visually invisible. This is a hard constraint.

### Decision 2: Auto-on-play activation, preconditioned on Max captions being visible

**Choice:** Reuse the existing `autoActivateSubtitles` + `preferredSubtitleLanguage` settings, with preconditions specific to DOM-sourced platforms:

```
on video 'play':
  if !subtitleSettings.enabled || !autoActivateSubtitles: return
  if !isOnWatchPage(): return
  if caption_renderer_overlay is NOT visibility:visible (captions off in Max):
     show one-time toast "Enable subtitles in Max to enable translation (Alt+S to retry)"
     return
  activeLang = readActiveLanguage()   // from aria-checked button's aria-label
  if preferredSubtitleLanguage != 'auto' && activeLang != preferredSubtitleLanguage:
     return   // respect user's preferred source language
  activateOverlayFromDom(handler)
```

**Why this choice (analyzed against alternatives):**

| Option | Respects Max caption state | Surprises user on DRM | Works when captions off | Invasive |
|---|---|---|---|---|
| A. Auto on play (unconditional) | ❌ | ⚠️ yes | ❌ silent fail | no |
| B. Manual only (hotkey/popup) | ✅ | ✅ | ✅ | no |
| C. Auto + precondition: Max captions visible ✅ | ✅ | ✅ | ✅ (guides via toast) | no |
| D. Auto + auto-click preferred track in Max | ⚠️ overrides | ❌ | ✅ but invasive | yes |

- **Respects the user's Max caption preference.** Max is a paid DRM site; users have explicitly chosen caption on/off (often for accessibility). Auto-firing when captions are off would surprise the user and silently fail (no cues to scrape).
- **Consistent with other platforms' UX where possible.** Users with `autoActivateSubtitles: true` get the same fire-on-play behavior, with a sensible precondition that there's actually something to translate.
- **Never mutates Max's player state.** No programmatic track switching on a premium DRM site — we read state only. Option D rejected as invasive.
- **Fails gracefully with guidance.** When captions are off, show a one-time toast teaching the precondition instead of silent failure.

**Semantics of `preferredSubtitleLanguage` for DOM-sourced platforms:** it does *not* mean "pick this track" (we don't pick — Max's active track is what we scrape). It means "only auto-activate if Max's currently-active track matches this language." If unset/`auto`, activate on any active Max track.

## Components

### 1. `inject/subtitleHandlers/hbomax.ts` — `HboMaxHandler` (new)

Implements `SubtitleHandler`. Platform-specific behavior:

- `platform = 'hbomax'`
- `detect()`: `hostname` is `play.hbomax.com` or `max.com` (Max rebranded; `play.hbomax.com` still serves content).
- `getPatterns()`: returns `[]` — no interceptable subtitle URLs.
- `transformResponse()`: returns `[]` (never called).
- `getMetadataPatterns()` / `extractAvailableTracks()`: reads `[data-testid^="player-ux-text-track-button"]` buttons, excluding `aria-label="Off"`. Returns `AvailableSubtitleTrack[]` with `platform: 'hbomax'`, `url: undefined` (DOM-sourced — no fetch URL), `label` from `aria-label`, `videoId` from the `/video/watch/<id>/` path segment.
- `getDomCueSource()` (new optional method): returns selectors + the active-language reader.
- `readActiveLanguage()`: maps Max's `aria-label` (e.g. "Chinese (Simplified)") to an ISO code (e.g. `zh-Hans`). A small label→code map covers the observed set; unknown labels fall back to the raw label string.

### 2. `SubtitleHandler` interface extension (registry.ts)

Add an optional method and `DomCueSource` type:

```ts
export interface DomCueSource {
  /** Selector for the element whose textContent = current cue text */
  cueSelector: string;
  /** Selector for the native caption window/overlay to hide while active */
  captionWindowSelector: string;
  /** Selector for a stable ancestor to observe (survives cue node replacement) */
  observeRootSelector: string;
  /** Extract the active track's language from the DOM ('' if unknown/off) */
  readActiveLanguage(): string;
}

export interface SubtitleHandler {
  // ...existing members...
  /** For DOM-sourced platforms (e.g. Max): return cue-scraping contract.
   *  Platforms that intercept URLs return undefined. */
  getDomCueSource?(): DomCueSource;
}
```

Optional, so existing handlers (YouTube, Udemy, Coursera, LinkedIn) are unaffected.

### 3. `inject/domCueSource.ts` — `startDomCueSource(handler, bridge)` (new)

The DOM cue scraper. Mirrors `textTrackDiscovery.ts`'s shape (returns a cleanup function, started from the inject content entrypoint).

**Observer strategy — observe a stable ancestor, re-resolve the cue selector each fire:**

- Attach a `MutationObserver` to the element matching `observeRootSelector` (`[data-testid="caption_renderer_overlay"]`) with `{ childList: true, subtree: true, characterData: true }`. Observing the stable ancestor (not the cue node directly) is essential: React may **recreate** `cueBoxRowTextCue` across certain transitions rather than just mutating its `textContent`. A direct `characterData` observer on the cue node would silently detach when React replaces the node.
- On each mutation batch:
  - Re-query `cueSelector` from the document to get the current cue node.
  - Read its `textContent.trim()`. If empty or unchanged since last fire, skip.
  - Sample `video.currentTime`.
  - Close the previous cue: `endTime = currentTime` (the cue that was visible up to this moment).
  - Open a new cue: `startTime = currentTime`, `text = newText`.
  - Append to a rolling `SubtitleCue[]`.
- Emit the rolling `SubtitleCue[]` via a new bridge message `SUBTITLE_DOM_CUES` (dedicated message — keeps DOM-cue concerns separate from `SUBTITLE_TRACKS_DISCOVERED`).

**Seek handling:** On seek, Max re-renders the cue for the new position; the observer fires and we open a new cue at the seek target. The gap between the last cue's end and the seek point is **not** filled — cap the previous cue's `endTime` at the new cue's `startTime`. Do not fabricate filler cues.

**Active language changes:** A separate light observer on `[data-testid^="player-ux-text-track-button"]` `aria-checked` attribute. If the active Max track changes mid-session, re-run discovery so `state.availableTracks` reflects the new source language, and reset the rolling cue buffer (the new track's cues are unrelated to the old).

**Cleanup:** disconnect both observers, remove the `timeupdate` listener (used to cap dangling open cues when video pauses without a cue change), restore nothing — coordinator handles caption-hide teardown.

### 4. `subtitleCoordinator.ts` additions

- **New bridge message handler** `handleDomCues(payload)`: merges incoming DOM cues into coordinator state and drives the translate→overlay flow (delegates to `activateOverlayFromDom`).
- **New activation function** `activateOverlayFromDom(handler)`:
  1. Get `DomCueSource` from handler.
  2. Inject the caption-hide `<style>` (Decision 1). Store a reference for teardown.
  3. Start `domCueSource` to populate cues.
  4. Wait for the first batch of cues (with a reasonable timeout, e.g. 10s — if none arrive, toast "No captions detected; ensure subtitles are enabled in Max").
  5. Run the existing translate flow: `initializeOverlay(cues, config, video)` + `translateSubtitle` message + `updateTranslatedCues` on chunk. Reuses `buildSubtitleOverlayConfig`, `initializeControls`, `enableDragReposition` — same as `activateOverlayMode`.
- **`isOnWatchPage()` extension:** add a `max.com` / `play.hbomax.com` branch — watch page is `/video/watch/...`.
- **Teardown:** on `resetCoordinatorState()` / SPA navigation / coordinator cleanup, remove the injected caption-hide `<style>` so Max's native captions return. Add the style element reference to `CoordinatorState`.

### 5. `types/subtitle.ts`

- Add `DomCueSource` interface (re-exported from registry or defined here — prefer here for type locality, re-exported from registry).
- Add `'SUBTITLE_DOM_CUES'` to `BridgeMessageType`.
- Add `SubtitleDomCuesPayload`:
  ```ts
  export interface SubtitleDomCuesPayload {
    cues: SubtitleCue[];
    platform: string;   // 'hbomax'
    language: string;   // active source language
    videoId?: string;
  }
  ```

### 6. Registration (`entrypoints/content.ts`, `entrypoints/inject.content/index.ts`)

Add `new HboMaxHandler()` to the `registerSubtitleHandlers([...])` array in both entrypoints (mirrors existing handler registration). Start `domCueSource` from the inject entrypoint when `detectCurrentHandler()?.getDomCueSource()` is defined.

### 7. CORS allowlist (`services/background.ts`)

**No change.** We do not make background subtitle fetches for Max (no subtitle URL — DOM-sourced). Adding hosts we don't fetch from would be noise. Revisit only if a real fetch need emerges.

## Non-Goals

- Youku support (deferred to a separate design).
- Interception of Max network traffic (impossible — MSE blob + DRM).
- Reliance on `<track>`/`TextTrack` (Max doesn't expose them).
- A new overlay renderer (reuse `subtitleOverlay.ts`).
- New translation/chunking logic (reuse `translateSubtitle`).
- Persisting a per-site "Max enabled" toggle (the existing `subtitleSettings.enabled` + `autoActivateSubtitles` + `preferredSubtitleLanguage` cover this).
- Auto-clicking Max's track buttons (invasive on a DRM site — rejected in Decision 2).

## Honest Limitations

1. **Timing is approximate.** Cue `startTime`/`endTime` derive from when Max's rendered text *changes* (observed via MutationObserver), not from a precise sidecar file. There is inherent lag: Max renders → observer fires → we sample `currentTime`. For overlay sync this is acceptable (we display the active cue by matching `currentTime` against our own derived window), but cue boundaries may be a few tens of ms off true positions.

2. **Seek/scrub produces a seam.** On seek, the previous cue's `endTime` is capped at the new cue's `startTime` (no filler). Cue boundaries around seeks are best-effort.

3. **React cue-node replacement.** `cueBoxRowTextCue` may be recreated by React across certain transitions. The scraper mitigates this by observing a stable ancestor and re-resolving the cue selector on each fire — but cannot observe a node that doesn't yet exist. There is an inherent delay (one mutation batch) between React creating a new cue node and the scraper picking it up.

4. **Source language is read once at activation, then re-checked.** A light observer catches mid-session track changes, but a race between the user switching Max's track and our re-discovery is possible (worst case: one cue translated under the old language assumption before correction).

5. **Site is mid-rebrand.** `max.com` is the current brand; `play.hbomax.com` redirects/serves legacy. `detect()` covers both hostnames. If Max fully retires `play.hbomax.com`, removing that branch is trivial.

6. **No E2E automation.** DRM playback cannot run headless. Final verification is manual against the saved Max page / a live session.

## Testing

- **Unit — `HboMaxHandler`**: `detect()` across `max.com`/`play.hbomax.com`/unrelated hosts; `extractAvailableTracks()` against a trimmed fixture from the saved HTML (assert track list, exclusion of `Off`, `videoId` from path, `url: undefined`); `getDomCueSource()` returns expected selectors.
- **Unit — `domCueSource`**: feed a sequence of cue-text mutations + a fake `video.currentTime` advancing; assert emitted `SubtitleCue[]` with correct `startTime`/`endTime`, dedupe of unchanged text, seek handling (gap capped, no filler), cleanup disconnects observers.
- **Unit — coordinator DOM branch**: a `hbomax` track with `url: undefined` and a handler exposing `getDomCueSource()` routes to `activateOverlayFromDom` (not `selectSubtitleTrack`/`activateOverlayMode(url)`); caption-hide `<style>` is injected on activation and removed on `resetCoordinatorState()`; `isOnWatchPage()` returns true for `/video/watch/...` on Max hostnames.
- **Unit — activation precondition**: auto-on-play is skipped when `caption_renderer_overlay` is not visible (toast shown), skipped when active language ≠ `preferredSubtitleLanguage`, proceeds otherwise.
- **No E2E** (DRM playback can't run headless). Manual verification against the saved Max page is the final gate.

## Files Touched

- **New:** `inject/subtitleHandlers/hbomax.ts`, `inject/domCueSource.ts`, plus unit tests.
- **Modified:**
  - `inject/subtitleHandlers/registry.ts` — add `getDomCueSource?` to `SubtitleHandler` interface; add/re-export `DomCueSource` type.
  - `content/subtitleCoordinator.ts` — DOM-cue branch (`handleDomCues`, `activateOverlayFromDom`), caption-hide lifecycle, `isOnWatchPage()` Max branch.
  - `entrypoints/content.ts` + `entrypoints/inject.content/index.ts` — register `HboMaxHandler`; start `domCueSource` when the current handler exposes it.
  - `types/subtitle.ts` — `DomCueSource`, `'SUBTITLE_DOM_CUES'` message type, `SubtitleDomCuesPayload`.