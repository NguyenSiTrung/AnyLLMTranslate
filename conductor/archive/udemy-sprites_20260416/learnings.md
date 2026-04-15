# Track Learnings: udemy-sprites_20260416

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

[Read from conductor/patterns.md]

---

<!-- Learnings from implementation will be appended below -->

## [2026-04-16 02:00] - Phase 1 Task 1: Update UdemyHandler.getPatterns() with negative lookahead
- **Implemented:** Added negative lookahead regex `(?!.*(sprite|thumbnail|board))` to exclude sprite/thumbnail URLs
- **Files changed:** `inject/subtitleHandlers/udemy.ts`
- **Commit:** 721aef3
- **Learnings:**
  - Patterns: Negative lookahead in regex `(?!.*(keyword1|keyword2|keyword3))` effectively excludes multiple patterns from matching
  - Gotchas: The negative lookahead must be placed before the matching pattern to work correctly
  - Context: Udemy video player requests sprite files in WebVTT format for thumbnail previews, which should not be translated

## [2026-04-16 02:00] - Phase 1 Task 2: Implement early-exit heuristic
- **Implemented:** Added early-exit check in transformResponse to drop whole track if first cue is sprite metadata
- **Files changed:** `inject/subtitleHandlers/udemy.ts`
- **Commit:** 721aef3
- **Learnings:**
  - Patterns: Early-exit optimization for pure sprite tracks avoids unnecessary processing
  - Gotchas: Initial implementation checked only first cue, which broke mixed content filtering
  - Context: Early-exit should only trigger when ALL cues are filtered, not just the first one

## [2026-04-16 02:00] - Phase 1 Task 3: Implement cue-level filtering
- **Implemented:** Added filter to remove cues matching image file patterns (.jpg, .png, .jpeg, .webp, .gif) or coordinate syntax (#xywh=)
- **Files changed:** `inject/subtitleHandlers/udemy.ts`
- **Commit:** 721aef3
- **Learnings:**
  - Patterns: Cue-level filtering allows mixed content (some sprite cues, some real subtitles)
  - Gotchas: Regex for image extensions must be case-insensitive (`/i` flag)
  - Context: Sprite metadata uses format like `thumb-sprites.jpg#xywh=0,0,100,100` for coordinate-based thumbnail loading

## [2026-04-16 02:00] - Phase 2 Task 1 & 2: Add sprite filtering tests
- **Implemented:** Added 3 new tests for URL exclusion, sprite metadata filtering, and mixed content handling
- **Files changed:** `tests/unit/udemyHandler.test.ts`
- **Commit:** 4944e95
- **Learnings:**
  - Patterns: Test sprite URLs with actual patterns (sprite-en.vtt, thumb-sprites.jpg#xywh=...)
  - Gotchas: Initial test for mixed content failed because early-exit triggered on first sprite cue
  - Context: Fixed implementation to only early-exit when ALL cues are filtered, allowing mixed content
