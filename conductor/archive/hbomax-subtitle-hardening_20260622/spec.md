# Spec: HBO Max Subtitle Hardening & UX Fixes

## Overview

Follow-up to **HBO Max DOM Cue-Scraping Subtitles** (`hbomax-dom-cue-subtitles_20260619`). Deep analysis (2026-06-22) identified gaps in manual activation, mid-session track switches, track discovery for UI, and video selection. This track fixes P0/P1 and selected P2 items without changing the DOM-scraping architecture.

## Functional Requirements

### FR1: Manual subtitle activation (Max / DOM platforms)

- `startSubtitleTranslation` (Alt+S, context menu): if `detectCurrentHandler()?.getDomCueSource`, call `tryAutoActivateForDom()` instead of requiring `track.url`.
- Unit test: DOM path used when `url` is undefined.

### FR2: Coordinator reset on Max track change

- On text-track change in MAIN world, notify content world; clear `domOriginalCues`, `domTranslatedCues`, `domTranslatedTexts`, `domTranslationMap`; cancel background subtitle session as appropriate.
- New bridge message from `domCueSource` (e.g. `SUBTITLE_DOM_TRACK_CHANGED`).

### FR3: Track discovery without metadata URLs

- On watch page, debounced `extractAvailableTracks` → merge `availableTracks` → `SUBTITLE_TRACKS_AVAILABLE` (tracks remain `url: undefined`).

### FR4: Shared primary video

- Single largest-area `findPrimaryVideo` for `domCueSource` and `subtitleOverlay`.

### FR5: Context menu

- Add `*://*.max.com/*`, `*://*.hbomax.com/*` to translate-subtitles patterns in `entrypoints/background.ts`.

### FR6: Language codes

- Extend `LABEL_TO_LANGUAGE`; tests for `preferredSubtitleLanguage` vs active track.

## Acceptance Criteria

1. Alt+S on Max watch with captions on retries/starts translation.
2. Switching Max subtitle language does not show stale translations.
3. Popup can list Max tracks without VTT URLs.
4. Overlay and DOM cues use same primary video when multiple videos exist.
5. Context menu includes Max hosts.
6. `pnpm test`, `pnpm lint`, `pnpm compile` pass.

## Out of Scope

Selector breakage fallback, cue buffer caps, BFCache DOM restart, DRM E2E, auto-clicking Max tracks, seek-priority for DOM text deltas.