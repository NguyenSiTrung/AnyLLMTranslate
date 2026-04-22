# Track: Multi-Video Page Subtitle State Isolation

## Problem
On pages with multiple videos (YouTube home, search results), the subtitle coordinator uses module-level singleton state with no video-ID scoping. This causes:

1. `availableTracks` pollutes with tracks from unrelated videos (thumbnails, recommendations)
2. `autoActivate` fires on the home page (not just watch pages), attaching overlay to home grid
3. `isOverlayMode` is a global lock — never reset across SPA navigations
4. `textTrackDiscovery` scans all `<video>` elements, including thumbnail previews

## Goal
Isolate subtitle coordinator state per video/navigation so auto-activation only fires on actual watch pages, using the correct video's subtitle tracks.

## Files Affected
- `inject/subtitleHandlers/youtube.ts` — add `videoId` extraction to `extractAvailableTracks`
- `types/subtitle.ts` — add `videoId?: string` to `AvailableSubtitleTrack`
- `content/subtitleCoordinator.ts` — SPA nav reset, watch-page guard, video-ID dedup
- `inject/textTrackDiscovery.ts` — scope to primary video only
- `inject/fetchInterceptor.ts` — per-navigation epoch keying (optional guard)
- Tests in `entrypoints/__tests__/` or `content/__tests__/`
