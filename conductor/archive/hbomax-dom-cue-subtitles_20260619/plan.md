# HBO Max DOM Cue-Scraping Subtitle Implementation Plan

**Track:** `hbomax-dom-cue-subtitles_20260619`
**Full plan:** [`docs/superpowers/plans/2026-06-19-hbomax-subtitle.md`](../../../docs/superpowers/plans/2026-06-19-hbomax-subtitle.md)

## Task Summary (all completed and shipped to master)

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Add `DomCueSource` type + `SUBTITLE_DOM_CUES` bridge message to `types/subtitle.ts` | `e00683e` |
| 2 | Add optional `getDomCueSource?()` to `SubtitleHandler` interface | `ca8869d` |
| 3 | Create `HboMaxHandler` with detect/extractTracks/getDomCueSource | `2f04f28` |
| 4 | Create `domCueSource.ts` scraper with MutationObserver | `17e0bbd` |
| 5 | Add `onDomCues` bridge receiver | `c7b8435` |
| 6 | Wire coordinator DOM branch + caption-hide lifecycle | `90bffd7` |
| 7 | Register `HboMaxHandler` + start domCueSource in entrypoints | `d5de222` |
| 8 | Gate auto-activate on visible Max captions + language match | `30ab337` |
| 9+ | Bug fixes: progressive DOM-cue translation, track-change reset, stale-nav guard, deferred-attach scraper, DOM cue timing fix, auto font size mode, fullscreen overlay fixes | `6e7bbde`...`491f59f` |

## Files Touched

**New:**
- `inject/subtitleHandlers/hbomax.ts` — `HboMaxHandler`
- `inject/domCueSource.ts` — DOM cue scraper with deferred-attach
- `tests/unit/hbomaxHandler.test.ts`
- `tests/unit/domCueSource.test.ts`
- `tests/unit/subtitleCoordinatorDom.test.ts`

**Modified:**
- `types/subtitle.ts` — `DomCueSource`, `SUBTITLE_DOM_CUES`, `SubtitleDomCuesPayload`
- `inject/subtitleHandlers/registry.ts` — `getDomCueSource?()` on interface
- `content/messageBridge.ts` — `onDomCues` receiver
- `content/subtitleCoordinator.ts` — DOM branch, caption-hide lifecycle, `isOnWatchPage()` Max branch, `tryAutoActivateForDom()`
- `content/subtitleOverlay.ts` — fullscreen reparent into player container, Popover API, auto font size mode
- `entrypoints/content.ts` + `entrypoints/inject.content/index.ts` — registration
