# HBO Max — Bilingual Subtitle Translation via DOM Cue Scraping

**Track:** `hbomax-dom-cue-subtitles_20260619`
**Date:** 2026-06-19
**Status:** Archived (shipped to master)
**Workflow:** superpowers (retroactively archived into conductor)
**Full spec:** [`docs/superpowers/specs/2026-06-19-hbomax-subtitle-design.md`](../../../docs/superpowers/specs/2026-06-19-hbomax-subtitle-design.md)

## Goal

Add bilingual subtitle translation support for HBO Max (`max.com` / `play.hbomax.com`). Max streams DRM-protected MSE video and renders captions itself into the DOM — it exposes neither an interceptable subtitle URL nor native HTML5 `<track>`/`TextTrack` APIs. This required a new cue source: scraping Max's rendered caption overlay and feeding it into the existing subtitle translation/overlay pipeline.

## Key Architecture

- **`DomCueSource` contract** (new optional method on `SubtitleHandler`): platforms that render captions into the DOM return selectors + a `readActiveLanguage()` function instead of URL patterns.
- **`domCueSource.ts` scraper**: MutationObserver on a stable ancestor (`caption_renderer_overlay`), re-resolves `cueBoxRowTextCue` selector on each fire (React may recreate the node), samples `video.currentTime` to derive cue timing, emits rolling `SubtitleCue[]` via `SUBTITLE_DOM_CUES` bridge message.
- **Coordinator DOM branch**: `activateOverlayFromDom()` hides Max's native caption window (`visibility: hidden !important`), feeds cues into the existing `initializeOverlay` → `translateSubtitle` → `updateTranslatedCues` flow.
- **Auto-activate precondition**: fires on play only if Max's caption overlay is visible (captions on) AND active track language matches `preferredSubtitleLanguage`.

## Design Decisions

1. **Hide native captions via `visibility: hidden !important`** (not `display:none`, not clicking Max's "Off" button) — preserves cue scraping (Max keeps rendering captions), matches Max's own hide idiom (`up_next`/`skip`), no reflow.
2. **Auto-on-play preconditioned on visible Max captions** — respects user's Max caption preference; shows guidance toast when captions are off instead of silent failure.
3. **Never mutate Max's player state** — read-only on a premium DRM site.

## Honest Limitations

- Cue timing is approximate (derived from DOM text changes, not a sidecar file)
- Seek/scrub produces a seam (previous cue endTime capped, no filler)
- React cue-node replacement has inherent one-mutation-batch delay
- No E2E automation (DRM playback can't run headless)
