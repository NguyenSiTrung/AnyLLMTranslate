# Track Learnings: hbomax-subtitle-hardening_20260622

## Codebase Patterns (Inherited)

- DOM cues: stable ancestor observer; far-future endTime; visibility hide; never Max Off.
- Handlers in content + inject entrypoints.
- Archive: conductor/archive/hbomax-dom-cue-subtitles_20260619/learnings.md

## Analysis Context (2026-06-22)

- Alt+S needs track.url; Max has none.
- Track switch: MAIN reset only; domTranslationMap stale.
- No metadata patterns; popup tracks empty.
- First vs largest video mismatch.

---

## 2026-06-22 - Implementation (Phases 1–4 code)

- **Implemented:** Manual `manualActivateSubtitles()`, `SUBTITLE_DOM_TRACK_CHANGED`, DOM track discovery debounce, `findPrimaryVideo`, context menu Max hosts, Spanish `es` map.
- **Files changed:** content/subtitleCoordinator.ts, entrypoints/content.ts, inject/domCueSource.ts, lib/findPrimaryVideo.ts, types/subtitle.ts, tests (dom + coordinator mocks need `onDomTrackChanged`).
- **Learnings:**
  - Patterns: `tryAutoActivateForDom({ manual: true })` bypasses auto-activate and preferred-language gates for Alt+S.
  - Gotchas: Any `messageBridge` mock must export `onDomTrackChanged` after coordinator registers it in `startCoordinator`.
  - Context: Phase 3 Task 3 satisfied by `discoverDomSubtitleTracks` + existing popup `SUBTITLE_TRACKS_AVAILABLE` flow.

---