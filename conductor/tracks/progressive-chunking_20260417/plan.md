# Implementation Plan: Progressive Chunked Subtitle Translation
*(Last Revised: 2026-04-17 - Added Priority Queue)*

## Phase 1: Background Chunking Logic

- [ ] Task 1: Update message types in `types/messages.ts` to include a new `SUBTITLE_CHUNK_TRANSLATED` event for asynchronous updates.
- [ ] Task 2: Refactor `services/background.ts` (`handleTranslateSubtitle`) to slice `cues` into chunks of 20-30.
- [ ] Task 3: Implement context overlap logic in `background.ts` to prepend 2-3 previous cues as read-only context before calling the LLM.
- [ ] Task 4: Implement background loop to sequentially process chunks and dispatch `SUBTITLE_CHUNK_TRANSLATED` to the active tab via `chrome.tabs.sendMessage`.
- [ ] Task 5: Conductor - User Manual Verification 'Background Chunking Logic' (Protocol in workflow.md)

## Phase 2: Coordinator & Overlay Integration

- [x] Task 1: Update `content/subtitleOverlay.ts` to gracefully append or merge incoming cue chunks without overwriting unaffected cues.
- [x] Task 2: Refactor `content/subtitleCoordinator.ts` to immediately activate the Custom Subtitle Overlay fallback upon interception instead of waiting for the full translation.
- [x] Task 3: Add event listener in `subtitleCoordinator.ts` to receive `SUBTITLE_CHUNK_TRANSLATED` events and push updates to the overlay.
- [x] Task 3.1 (REVISED): Listen to `seeked` event in overlay to send `PRIORITIZE_SUBTITLE_CHUNK` message to background.
- [x] Task 3.2 (REVISED): Implement Priority Queue in `services/background.ts` to reorder the chunk translation queue dynamically based on user skips.
- [ ] Task 4: Conductor - User Manual Verification 'Coordinator & Overlay Integration' (Protocol in workflow.md)
