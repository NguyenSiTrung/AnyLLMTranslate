# Implementation Plan: Udemy Sprite Subtitle Fix

## Phase 1: Implementation
<!-- execution: sequential -->

- [x] Task 1: Update `UdemyHandler.getPatterns()` to actively exclude URL paths containing sprite/thumbnail keywords using negative lookahead formatting.
- [x] Task 2: Implement early-exit heuristic in `UdemyHandler.transformResponse` to drop the whole track if the first cue is identified as a `.jpg` or `.png` sprite metadata.
- [x] Task 3: Implement cue-level filtering inside `transformResponse` to strictly remove cues that match image file coordinate syntaxes (e.g., `.jpg#xywh=...`).
- [ ] Task 4: Conductor - User Manual Verification 'Implementation' (Protocol in workflow.md)

## Phase 2: Validation
<!-- execution: sequential -->
<!-- depends: phase1 -->

- [ ] Task 1: Insert mock VTT sprite payload logic in `tests/unit/udemyHandler.test.ts`.
- [ ] Task 2: Add test asserting that `udemyHandler` returns an empty array `[]` when processing the mocked payload.
- [ ] Task 3: Conductor - User Manual Verification 'Validation' (Protocol in workflow.md)
