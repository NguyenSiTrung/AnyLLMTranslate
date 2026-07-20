# Implementation Plan — Web Translate Lifecycle & Bilingual Display Hardening

Track: `web-translate-hardening_20260720`
Branch: `feat/web-translate-hardening_20260720`

Hybrid approach: TDD lifecycle/cache first → SPA structure → display/a11y → fixture matrix.
Parallel annotations enabled where file ownership is disjoint.

---

## Phase 1: P0 Lifecycle Correctness
<!-- execution: sequential -->
<!-- depends: -->

Thin session contract first; remaining P0 tasks build on it. Task 1.5 and 1.6 are
file-disjoint after 1.1 and may be taken back-to-back by separate workers if desired
(still sequential within the phase default).

- [x] Task 1.1: Thin session contract + stream guard (FR-1)
  <!-- files: entrypoints/content.ts, content/__tests__/webTranslateLifecycle.test.ts -->
  - [x] Write failing fixture: stream `piece` after stop/restart must not write DOM
  - [x] Carry `translationSession` on stream path; check before every DOM apply
  - [x] Session registry for ports/controllers; abort/disconnect on stop, restart, body-swap
  - [x] Ensure non-stream late-response guard still passes

- [x] Task 1.2: Stop writes resume snapshot before clearing (FR-2)
  <!-- files: entrypoints/content.ts, lib/webResume.ts, lib/__tests__/webResume.test.ts, content/__tests__/webTranslateLifecycle.test.ts -->
  - [x] Failing fixture: translate pieces → stop → loadSnapshot → non-empty entries
  - [x] Reorder stopTranslation: snapshot (await where safe) then clear `allPieces`
  - [x] Keep pagehide/beforeunload writer coherent with stop path

- [x] Task 1.3: Start/stop lifecycle mutex (FR-3)
  <!-- files: entrypoints/content.ts, content/__tests__/webTranslateLifecycle.test.ts -->
  - [x] Failing fixture: concurrent start mid-`loadSettings` does not dual-observe
  - [x] Init mutex / serializing gate for start, stop, body-swap re-init
  - [x] Bump session before async startup; re-check session after every await
  - [x] Command handlers await start/stop where practical

- [x] Task 1.4: Resume before observe (FR-4)
  <!-- files: entrypoints/content.ts, lib/webResume.ts, lib/resumeIdentity.ts, content/__tests__/webTranslateLifecycle.test.ts -->
  - [x] Failing fixture: restored pieces do not dispatch LLM in same session
  - [x] Await restore (or pending gate) before viewport observe/dispatch
  - [x] Validate targetLanguage + config fingerprint before applying snapshot
  - [x] Document fingerprint fields in learnings

- [x] Task 1.5: Section dismiss = canonical restore (FR-5)
  <!-- files: content/sectionTranslate.ts, content/translationDisplay.ts, content/__tests__/sectionTranslate.test.ts, content/__tests__/translationDisplay.test.ts -->
  - [x] Failing fixture: translation-only → section dismiss → originals visible + wrappers unwrapped
  - [x] Reuse canonical unwrap/marker cleanup from `removeAllTranslations`
  - [x] Clear original roles and `data-anyllm-original-wrapper`

- [x] Task 1.6: Cache key fingerprint (FR-6)
  <!-- files: services/cacheManager.ts, services/background.ts, services/__tests__/cacheManager.test.ts, lib/__tests__/ if fingerprint helper extracted -->
  - [x] Failing fixture: glossary/model/prompt fingerprint change → cache miss
  - [x] Pure fingerprint helper (provider/endpoint, model, langs, prompt version, glossary/term-memory hash, category mode, temp, rich-format version)
  - [x] Apply to success + negative keys; old keys miss safely
  - [x] Preserve subtitle `subtitle:` namespace isolation

- [x] Task 1.7: Phase 1 verification
  <!-- files: conductor/tracks/web-translate-hardening_20260720/learnings.md -->
  - [x] `pnpm test` + `pnpm lint` green
  - [x] Capture learnings for session contract + snapshot order + fingerprint

- [x] Task: Conductor - User Manual Verification 'P0 Lifecycle Correctness' (Protocol in workflow.md)

---

## Phase 2: P1 SPA Stability & Scale
<!-- execution: parallel -->
<!-- depends: phase1 -->

Task 2.1 is the foundation (registry). Tasks 2.5–2.7 and 2.9 are file-disjoint and
can run in parallel after 2.1. Tasks 2.2–2.4 and 2.8 touch content/display and stay
ordered relative to 2.1.

- [x] Task 2.1: Piece registry + prune detached (FR-7)
  <!-- files: entrypoints/content.ts, content/__tests__/webTranslateLifecycle.test.ts -->
  <!-- depends: -->
  - [x] `Map<pieceId, piece>` + parent/text identity index
  - [x] Prune disconnected nodes on mutation flush and/or sweep
  - [x] Replace O(N×M) `allPieces.some` duplicate scans
  - [x] Fixture: remove node → piece pruned; no leak growth

- [x] Task 2.2: Route / document revision handling (FR-8)
  <!-- files: entrypoints/content.ts, content/mutationWatcher.ts, content/__tests__/webTranslateLifecycle.test.ts -->
  <!-- depends: task2.1 -->
  - [x] Detect pushState/replaceState/popstate and meaningful content-root revision
  - [x] On revision: bump session, reset pieces/context/observers as needed
  - [x] Fixture: history navigation mid-translate drops stale writes

- [x] Task 2.3: Incremental mutation extraction (FR-9)
  <!-- files: content/mutationWatcher.ts, content/domWalker.ts, content/__tests__/mutationWatcher.test.ts, content/__tests__/domWalker.test.ts -->
  <!-- depends: task2.1 -->
  - [x] Queue smallest stable block ancestors; coalesce overlapping roots
  - [x] Idle/time budget per flush
  - [x] Consume or remove unused `data-anyllm-walked`
  - [x] Observe newly discovered open shadow roots when enabled

- [x] Task 2.4: Per-piece inline clone map (FR-10)
  <!-- files: content/translationDisplay.ts, content/__tests__/translationDisplay.test.ts -->
  <!-- depends: task2.1 -->
  - [x] Piece-id-owned clone map; no document-wide rebuild
  - [x] Mode switch / single-piece update only touches affected clones
  - [x] Fixture: many short pieces — update one does not recreate all clones

- [x] Task 2.5: Bounded IDB cache lookup concurrency (FR-11)
  <!-- files: lib/parallelCacheLookup.ts, lib/__tests__/parallelCacheLookup.test.ts, services/background.ts -->
  <!-- depends: task2.1 -->
  - [x] Cap parallel lookups or batched multi-get per batch
  - [x] Tests for bound under large piece lists

- [x] Task 2.6: Provider throttle reservation + adaptive isolation (FR-12)
  <!-- files: services/providerPool.ts, lib/adaptiveBatching.ts, services/__tests__/ if present, lib/__tests__/adaptiveBatching.test.ts -->
  <!-- depends: task2.1 -->
  - [x] Atomic/reserved key throttle (no parallel burst past min interval)
  - [x] Adaptive EMA keyed by provider/model
  - [x] Tests with fake timers / concurrency

- [x] Task 2.7: Safer source-language skip gate (FR-13)
  <!-- files: lib/langDetect.ts, entrypoints/content.ts, lib/__tests__/langDetect.test.ts -->
  <!-- depends: task2.1 -->
  - [x] Script family ≠ single language when ambiguous
  - [x] Higher confidence bar before skip-as-complete
  - [x] Fixtures: Ukrainian not skipped as ru; JP kanji-heavy not skipped as zh

- [x] Task 2.8: Stream partial fallback + hover in-flight dedup (FR-14, FR-15)
  <!-- files: entrypoints/content.ts, content/hoverTranslate.ts, content/__tests__/webTranslateLifecycle.test.ts, content/__tests__/hoverTranslate.test.ts -->
  <!-- depends: task2.1 -->
  - [x] Stream error → re-request only unfinished piece ids
  - [x] Hover per-element pending promise map
  - [x] Fixtures for both paths

- [x] Task 2.9: Stronger response / rich-token validation (FR-16)
  <!-- files: lib/translationQualityCheck.ts, services/openaiCompatible.ts, lib/__tests__/translationQualityCheck.test.ts -->
  <!-- depends: task2.1 -->
  - [x] Verify rich token ids/counts/balance/allowed tags
  - [x] Revalidate repair output
  - [x] Reject incomplete id maps before DOM apply (content or background seam)

- [x] Task 2.10: Phase 2 verification
  <!-- files: conductor/tracks/web-translate-hardening_20260720/learnings.md -->
  - [x] `pnpm test` + `pnpm lint` green
  - [x] Capture SPA/registry/langDetect learnings

- [x] Task: Conductor - User Manual Verification 'P1 SPA Stability & Scale' (Protocol in workflow.md)

---

## Phase 3: P2 Bilingual Layout Isolation
<!-- execution: sequential -->
<!-- depends: phase2 -->

Display + CSS ownership is shared — keep sequential within phase.

- [x] Task 3.1: Context-aware insertion strategy (FR-17)
  <!-- files: content/translationDisplay.ts, styles/inject.css, content/__tests__/translationDisplay.test.ts -->
  - [x] Paths: normal flow, flex parent, grid parent, lists, cells, rows, headings, controls
  - [x] Avoid blind sibling injection into flex/grid item slots
  - [x] Fixture: flex parent does not create rogue column

- [x] Task 3.2: Translation-only full theme reset (FR-18)
  <!-- files: styles/inject.css, content/__tests__/translationDisplay.test.ts -->
  - [x] Clear filter, opacity, animation, text-decoration, forced widths, bubble pseudos, side widths
  - [x] Fixture: mask + translation-only → no residual blur

- [x] Task 3.3: Inline mode-correct rendering (FR-19)
  <!-- files: content/translationDisplay.ts, content/__tests__/translationDisplay.test.ts -->
  - [x] Store raw translation; re-render on dual ↔ translation-only
  - [x] Single spacing source; `dir="auto"`; rich dual delimiter
  - [x] Fixture: dual → TO → dual reformatting

- [x] Task 3.4: Side layout + table colspan + wrapper safety (FR-20, FR-21, FR-22)
  <!-- files: content/translationDisplay.ts, styles/inject.css, content/__tests__/translationDisplay.test.ts -->
  - [x] Narrow fallback for `translationPosition="side"`
  - [x] Effective colspan from cell colSpan sums
  - [x] Safer contained wrappers + full unwrap on restore
  - [x] Fixture: colspan table row

- [x] Task 3.5: Custom border-none + constrained-cache invalidation (FR-23, FR-24)
  <!-- files: content/translationDisplay.ts, styles/inject.css, content/__tests__/translationDisplay.test.ts -->
  - [x] Root attribute/class for custom border style
  - [x] Invalidate constrained-layout cache on resize/mutation or per-pass scope

- [x] Task 3.6: Phase 3 verification
  <!-- files: conductor/tracks/web-translate-hardening_20260720/learnings.md -->
  - [x] `pnpm test` + `pnpm lint` green
  - [x] Capture layout/CSS learnings

- [x] Task: Conductor - User Manual Verification 'P2 Bilingual Layout Isolation' (Protocol in workflow.md)

---

## Phase 4: P2 A11y, Status, Site Rules
<!-- execution: parallel -->
<!-- depends: phase3 -->

Tasks 4.1–4.2 share display/status surfaces (coordinate carefully). Task 4.3 is
file-disjoint and fully parallel-safe. Task 4.4 may touch display after 4.1.

- [x] Task 4.1: Accessible retry + light ARIA pairing (FR-25, FR-26)
  <!-- files: content/translationDisplay.ts, content/__tests__/translationDisplay.test.ts -->
  <!-- depends: -->
  - [x] Real button / keyboard-operable retry; clones inherit retry in TO
  - [x] Lightweight aria-describedby or pair-group labeling (no bulk live-region flood)
  - [x] Keyboard fixture for retry

- [x] Task 4.2: Status semantics + tab scoping (FR-27)
  <!-- files: lib/webTranslateStatus.ts, entrypoints/content.ts, entrypoints/popup/hooks/usePopupTab.ts, entrypoints/popup/hooks/useTranslationToggle.ts, lib/__tests__/webTranslateStatus.test.ts -->
  <!-- depends: -->
  - [x] Distinguish viewportDone / pageDone / paused / partialFailure
  - [x] Status carries real tab identity; popup ignores other tabs
  - [x] Unit + popup hook tests

- [x] Task 4.3: Site-rule specificity + blocklist boundary (FR-28)
  <!-- files: lib/siteRules.ts, content/inlineTranslate/blocklist.ts, lib/__tests__/siteRules.test.ts, content/__tests__/inlineTranslate.test.ts -->
  <!-- depends: -->
  - [x] Most-specific match (or explicit documented order + UI)
  - [x] Fix `*.figma.com` / endsWith boundary (`evilfigma.com` must not match)
  - [x] Unit tests for both

- [x] Task 4.4: Safer piece element lookup (FR-29)
  <!-- files: content/translationDisplay.ts, content/__tests__/translationDisplay.test.ts -->
  <!-- depends: task4.1 -->
  - [x] Piece-id → element map and/or `CSS.escape`
  - [x] Root-aware lookup for open shadow roots when enabled

- [x] Task 4.5: Phase 4 verification
  <!-- files: conductor/tracks/web-translate-hardening_20260720/learnings.md -->
  - [x] `pnpm test` + `pnpm lint` green
  - [x] Capture a11y/status/rules learnings

- [x] Task: Conductor - User Manual Verification 'P2 A11y, Status, Site Rules' (Protocol in workflow.md)

---

## Phase 5: Integration Fixture Matrix & Shared-Seam Guard
<!-- execution: sequential -->
<!-- depends: phase4 -->

- [x] Task 5.1: Consolidated fixture matrix (FR-30)
  <!-- files: content/__tests__/webTranslateLifecycle.test.ts, content/__tests__/translationDisplay.test.ts, lib/__tests__/langDetect.test.ts, services/__tests__/cacheManager.test.ts -->
  - [x] Ensure full FR-30 matrix is covered (add any missing cases)
  - [x] Document pre-fix failure mode in test names/comments

- [x] Task 5.2: Full suite regression — subtitle/PDF seams (FR-31)
  <!-- files: (suite-wide) -->
  - [x] `pnpm test` + `pnpm lint` green
  - [x] Confirm subtitle cache namespace isolation after fingerprint change
  - [x] Note any intentional shared-cache impact in learnings

- [x] Task 5.3: Track completion
  <!-- files: conductor/tracks/web-translate-hardening_20260720/learnings.md, conductor/patterns.md -->
  - [x] Elevate reusable patterns to `conductor/patterns.md`
  - [x] Mark plan complete; ready for `/conductor-archive` when approved

- [x] Task: Conductor - User Manual Verification 'Integration Fixture Matrix' (Protocol in workflow.md)
