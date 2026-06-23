# Spec: Codebase Audit v2 - Deep Analysis Fixes & Improvements

## Overview

Comprehensive fix and improvement track addressing all findings from the June 2026 deep codebase analysis. The analysis reviewed every source file across `services/`, `content/`, `lib/`, `inject/`, `entrypoints/`, `stores/`, `types/`, and `ui/`, identifying ~80 issues across 4 severity levels: 4 P0 (crashes/data loss), 8 P1 (high-confidence bugs), 28 P2 (medium severity), and 40+ P3 (minor bugs, dead code, refactoring).

## Track Type

Bug Fix / Refactor / Hardening

## Functional Requirements

### FR1: Fix all P0 critical crashes
- Subtitle overlay crash from missing `translatedCues` assignment
- PDF viewer React Rules of Hooks violation
- Translation removal un-marking all elements
- DOM deduplication logic bug

### FR2: Fix all P1 high-confidence bugs
- Semaphore bypass allowing unbounded concurrent LLM calls
- Incomplete section translation cleanup
- Timer leak on SPA navigation
- Undefined response crash in fetchViaBackground
- Duplicate piece IDs on repetitive pages
- Stale closure in storage change listener
- Untracked fade timeout dismissing new notifications
- Unvalidated settings import (security)

### FR3: Fix all P2 security issues
- SSRF: missing 172.16/12 private IP range
- file:// protocol allowed from content scripts
- API key sent over cleartext HTTP
- Prompt injection via unsanitized pageContext
- API key serialized in cleartext export
- Legacy decryptApiKey returning ciphertext on failure

### FR4: Fix all P2 correctness bugs
- Partial translations reported as success
- Debug logging permanently broken in background SW
- Cache clear race condition
- Module-level mutable state in textTrackDiscovery
- XHR interceptor suppressing readyState callbacks
- XHR disable clobbering third-party patches
- Fetch interceptor pending translation leak
- Shallow spread in onSettingsChange
- Broad "model" keyword matching in error classification
- DOM cue source no seek handling

### FR5: Fix all P2 performance issues
- categoryStore tab cleanup never called (memory leak)
- Missing fetch timeouts (handleFetchSubtitle, providerTester x3)
- Stat overcounting for subtitle cues
- Fragile string matching for HTTP status detection
- No batching for PDF paragraph classification
- Hardcoded Vietnamese in translation test
- Forced reflow per translated piece (layout thrashing)
- O(N^2) inline translation sibling sync
- Layout thrashing in section picker
- Broad MutationObserver in subtitle coordinator
- New Map/object per render in PDF viewer App
- IntersectionObserver churn in usePdfPageTranslations

### FR6: Fix all P3 minor bugs
- `tabId || sender.tab?.id` treating 0 as falsy (use `??`)
- Hardcoded chunk size 25 duplicating CHUNK_SIZE constant
- clearKeepaliveAlarm redundancy (move to finally)
- ensureKeepaliveAlarm race condition
- Missing .catch() on updateSettings handler
- Unclosed think-block regex handling
- validateProviderConfig not checking protocol
- Batcher not passing glossary/custom prompt
- Unhandled rejection risk in batcher add()
- Sequential cache key deletion (use clear())
- flushLruUpdates silently dropping updates
- neverAutoOpenSites exact hostname match (misses subdomains)
- UTC date for daily stats (misaligns with local day)
- categoryStore initTabCleanup registering listener every call
- And 25+ more minor items across content, inject, lib, UI

### FR7: Remove all dead code
- pendingRequests Map never populated in subtitleCoordinator
- Dead selectors in sectionTranslate
- createControlsUI never imported
- Stale closure dead code in content.ts
- Dead paragraphCount prop in PDF viewer
- Dead onTranslateCurrentPage prop in SetupWizard

## Non-Functional Requirements

- All existing tests must continue to pass
- New tests should be written for each fix where feasible (TDD encouraged)
- No new lint errors introduced
- TypeScript compilation must pass
- WXT build must succeed
- No changes to user-facing behavior unless fixing the bug itself

## Acceptance Criteria

1. All P0 crashes resolved with tests verifying the fix
2. All P1 bugs resolved with tests verifying the fix
3. All P2 security issues mitigated
4. All P2 performance issues addressed
5. All P3 minor issues fixed or documented as intentional
6. `pnpm test` passes with 0 failures
7. `pnpm lint` passes with 0 errors
8. `pnpm compile` (tsc --noEmit) passes
9. `pnpm build` succeeds
10. Learnings captured for patterns discovered during fixes

## Out of Scope

- New features or enhancements beyond fixing identified issues
- Refactoring of working code not flagged in the analysis
- UI/UX design changes
- Changes to the build system or tooling configuration
