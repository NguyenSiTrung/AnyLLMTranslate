# Revisions

## Revision 1 — 2026-06-22 — Plan Issue
**Type:** Plan
**Triggered by:** Task 1.4 vs Task 2.1 contradiction
**Phase/Task:** Phase 1 Task 1.4

**Issue:** The spec's FR-1 says "Use `translationTimeout` setting (10-120s) instead of hardcoded 30s timeout" while FR-13 says "Remove `translationTimeout` from `SubtitleSettings` (unused in runtime)." Acceptance criteria #1 says to USE it, #13 says to REMOVE it. Task 1.4 planned to remove it, Task 2.1 planned to use it.

**Resolution:** Wire `translationTimeout` to interceptors (Task 2.1), making it no longer "unused in runtime." Keep it in `SubtitleSettings`. Task 1.4 only removes `buildBilingualVTT`/`buildTranslationOnlyVTT`/`BilingualOptions` dead code. Updated Task 1.4 plan to reflect this.
