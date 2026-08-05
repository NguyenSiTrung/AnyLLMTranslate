# YouTube Caption Request Guards

## Problem

YouTube can return multiple player-metadata responses while a watch page is
open. The coordinator currently accepts any response that contains caption
tracks and may proactively request its `/api/timedtext` URL. A response for a
preview or stale player can therefore produce a request whose `v` parameter
does not match the active watch URL.

The play watcher and repeated metadata discovery can also enter automatic
activation more than once. The current per-URL pipeline guard coalesces only
overlapping work; after a failed fetch, a later event can retry automatically.

## Goal

Never send a proactive YouTube caption request unless the active page ID, the
discovered track ID, and the timed-text URL's `v` ID are all present and equal.
Attempt automatic activation only once per video, language, and track kind in a
navigation. Explicit user selection remains available as a retry path.

## Design

1. When handling YouTube track discovery, discard a payload with a known video
   ID that differs from the active YouTube watch-page ID. This prevents stale
   tracks from entering coordinator state or the popup list.
2. Add a final validation helper at the YouTube fetch boundary. It resolves
   relative URLs against the page, extracts the timed-text `v` parameter, and
   requires `page ID === track.videoId === URL v`. A failed validation exits
   before direct fetch, background fallback, or native-caption fallback.
3. Track automatic attempts in coordinator state using
   `videoId + language + caption kind`; clear the set on SPA/reset navigation.
   The automatic paths reserve this key before selecting the track. Manual
   `selectSubtitleTrack()` calls do not reserve it, so the user can explicitly
   retry after a transient YouTube failure.

## Non-goals

- Do not alter YouTube's own video playback (`googlevideo`) requests.
- Do not change the passive interception response behavior.
- Do not add retries, request spoofing, or anti-detection behavior.

## Validation

- A discovered caption for another video produces no `fetch`, `FETCH_SUBTITLE`,
  or `YOUTUBE_REQUEST_CAPTIONS` call.
- A valid current-video track continues through the existing proactive JSON3
  pipeline.
- Repeated automatic play/discovery triggers after a failure create one
  proactive fetch for the same video/language/kind; an explicit selection can
  still retry.
