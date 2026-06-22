# Plan: HBO Max Subtitle Hardening

## Phase 1: P0 Manual activation and track-change sync

- [x] Task 1: Wire startSubtitleTranslation to tryAutoActivateForDom for DOM handlers (entrypoints/content.ts + tests)
- [x] Task 2: SUBTITLE_DOM_TRACK_CHANGED bridge and coordinator reset (domCueSource, subtitleCoordinator, types)
- [ ] Task: Conductor - User Manual Verification Phase 1

## Phase 2: P1 Track discovery and primary video

- [x] Task 1: discoverDomSubtitleTracks for hbomax (subtitleCoordinator + tests)
- [x] Task 2: Shared findPrimaryVideo (lib + domCueSource + subtitleOverlay)
- [ ] Task: Conductor - User Manual Verification Phase 2

## Phase 3: P2 Context menu, language map, popup

- [x] Task 1: Context menu URL patterns (entrypoints/background.ts)
- [x] Task 2: LABEL_TO_LANGUAGE extensions (hbomax.ts + tests)
- [x] Task 3: Popup track list without URL for hbomax if needed
- [ ] Task: Conductor - User Manual Verification Phase 3

## Phase 4: Verification

- [x] Task 1: pnpm test, lint, compile, wxt build; manual Max checklist
- [x] Task 2: Elevate patterns to conductor/patterns.md
- [ ] Task: Conductor - User Manual Verification Phase 4