# Plan: Page Translation Hardening

**Track:** `page-translation-hardening_20261009` · **Spec:** [spec.md](./spec.md)

Each task is TDD: write the failing test → implement → run the affected suites → commit (`fix(<scope>): … [page-translation-hardening Px.Ty]`) with a git note. Phases 1 and 2 touch disjoint files and may run in parallel; Phases 3–5 run sequentially after both. No manual verification — each phase closes on the automated gate.

## Phase 1: Extraction correctness
<!-- gate 2026-10-09: tsc 0; lint 38 (baseline); pnpm test 755/757 — 2 timeouts in known-flaky subtitleCoordinator.test.ts, moving set on 3 isolated reruns (2 green) -->
<!-- execution: sequential -->
<!-- depends: -->
<!-- files: content/domWalker.ts, lib/richTranslate.ts, types/config.ts, related tests -->

- [x] Task 1.1: `<br>` → `\n` in plain piece text (FR-3)
  - [x] Test: `Plain<br>break` → `Plain\nbreak`; multiple `<br>` collapse sensibly; `sourceText` baseline matches what `isPieceSourceUnchanged` recomputes
  - [x] Implement in `extractPieces` walk (track BR between text nodes of the current group) and keep `isPieceSourceUnchanged` consistent
- [x] Task 1.2: Group-scoped rich encoding (FR-1)
  - [x] Test: nested-list probe yields `Item <z id="0">here</z>`; excluded/`translate="no"`/`pre` subtree inside anchor never appears in rich text; multi-group parent (`Text A <p>…</p> Text B`) encodes each group separately
  - [x] Implement a node-based encoder in `lib/richTranslate.ts` (`encodeInlineNodes(textNodes, anchor)`) and switch `domWalker.ts:255` to it; keep `encodeInlineHtml` for other callers or remove if unused
- [x] Task 1.3: Entities and void tags (FR-2)
  - [x] Test: `Tom &amp; Jerry<br>x <a>link</a>` encodes to `Tom & Jerry\nx <z id="0">link</z>`; decode renders no literal `&amp;`/`<br>`; `img[alt]` handling
  - [x] Implement in the node-based encoder (text from `Text.data`, BR → `\n`)
- [x] Task 1.4: Skip code blocks by default (FR-4)
  - [x] Test: `<pre>` on a host without site rules is not extracted with default settings; inline `code` stays in the parent piece
  - [x] Add `pre` (and block code containers) to `SMART_EXCLUDE_SELECTORS` in `types/config.ts`
- [x] Task 1.5: CJK-aware, tag-safe splitting (FR-5)
  - [x] Test: long Chinese paragraph splits only at `。！？；`; rich piece >1000 chars never cuts inside `<z id="N">`/`</z>` and each part has balanced tags
  - [x] Implement in `splitAtSentenceBoundary` (`domWalker.ts:106`)
- [x] Task 1.6: Visually-block custom elements split pieces (FR-6)
  - [x] Test: two sibling `<x-card>` elements with text under one `<div>` become two pieces; `span` with computed `display:block` splits; standard inline tags never call `getComputedStyle`
  - [x] Implement `isBlockElement` fallback with per-walk cache
- [x] Task: Automated phase gate 'Phase 1: Extraction correctness' — `pnpm test` (known flaky files per workflow.md) + `pnpm lint` (≤38 errors); no manual verification

## Phase 2: Display safety
<!-- execution: sequential -->
<!-- depends: -->
<!-- files: content/translationDisplay.ts, styles/, related tests -->

- [x] Task 2.1: Append-only LI/TD/TH insertion (FR-7)
  - [x] Test: after translating an LI with held child references, `li.removeChild(child)` succeeds in dual and translation-only modes; original children keep their parent; translation-only hides originals via CSS; legacy `ORIGINAL_WRAPPER_ATTR` pages still restore cleanly
  - [x] Implement in `insertIntoContainedElement` / `getInlineRenderTarget` / `removeAllTranslations` plus scoped CSS in `styles/`
- [x] Task 2.2: Debounce translation-only inline copy sync (FR-8)
  - [x] Test: N inline placeholders in translation-only mode cause one sync pass (spy), and clones still appear
  - [x] Switch `showInlineLoadingPlaceholder` to `debouncedSyncInlineSiblings`
<!-- gate 2026-10-09: tsc 0; lint 38 (baseline); pnpm test 762/763 — sole red is known flake services/__tests__/background.streamStats.test.ts (workflow.md; 1/3 isolated reruns green, services/ untouched) -->
- [x] Task: Automated phase gate 'Phase 2: Display safety' — `pnpm test` (known flaky files per workflow.md) + `pnpm lint` (≤38 errors); no manual verification

## Phase 3: Cost and reliability
<!-- depends: phase1, phase2 -->

- [x] Task 3.1: Retry classifier and pause rules (FR-10)
  - [x] Test: 401/403/"invalid api key"/quota → no automatic retry, enters the pause with a settings link; 429/503/network → one automatic retry
  - [x] Add `isRetryableWebTranslationError` (string-based, in `lib/`) and an auth/quota pause predicate; use them in `translatePieces`
- [x] Task 3.2: Automatic retry never clears the pause (FR-9)
  - [x] Test: batch A enters the pause; batch B's automatic retry runs → pause and banner remain, nothing re-observed
  - [x] Split "user retry" from "automatic retry" options in `translatePieces`
- [x] Task 3.3: Live-text churn freeze (FR-11)
  - [x] Test: element changed 5×/60 s → ≤3 requests, then frozen; translation removed on freeze; reset on Stop/Start
  - [x] Implement a churn WeakMap in the mutation callback (`content.ts:1483+`)
- [x] Task 3.4: Abortable non-streaming translate (FR-12)
  - [x] Test (background): `restore` / `CANCEL_PAGE_TRANSLATE` aborts the per-tab controller; `handleTranslate` sees an aborted signal, no cache write, no failover
  - [x] Test (content): Stop sends the cancel; late response writes nothing (existing session guard)
  - [x] Implement per-tab `webTranslateControllers` in `services/background.ts`; pass `{ signal }` execution to `handleTranslate` for the `translate` action
<!-- gate 2026-10-09: tsc 0; lint 38 (baseline); pnpm test: all 121 tracked files green (829/829). The only red file is untracked .review-scratch/__tests__/repro.test.ts (8 intentional bug repros, created 21:29 outside this track; not staged) -->
- [x] Task: Automated phase gate 'Phase 3: Cost and reliability' — `pnpm test` (known flaky files per workflow.md) + `pnpm lint` (≤38 errors); no manual verification

## Phase 4: Memory and performance

- [x] Task 4.1: Release detached pieces fully (FR-13)
  - [x] Test: 1,000 detach/append cycles keep `observedCount` and the display tracking map bounded
  - [x] Add `ViewportObserver.unobserve(piece)`; call it plus `untrackPieceElement`/`removePieceArtifacts` from `pruneDetachedPieces`
- [x] Task 4.2: Indexed mutation flush (FR-14)
  - [x] Test: 5,000 pieces + 50 added elements — `contains` call count is O(added × depth) (counter/spy); existing sm7n invalidation tests still pass
  - [x] Add parent→pieces and textNode→piece indexes maintained by `registerPiece`/`unregisterPiece`
- [x] Task 4.3: Throttled, layout-free status (FR-15)
  - [x] Test: 20 rapid status triggers → ≤2 broadcasts; no `getBoundingClientRect` calls on status computation
  - [x] Track visible parents from IntersectionObserver entries; throttle `sendStatusUpdate`; reuse for look-ahead
- [ ] Task: Automated phase gate 'Phase 4: Memory and performance' — `pnpm test` (known flaky files per workflow.md) + `pnpm lint` (≤38 errors); no manual verification

## Phase 5: Lifecycle and small fixes

- [ ] Task 5.1: bfcache-safe teardown (FR-16)
  - [ ] Test: `pagehide` (persisted) then `pageshow` (persisted) → features re-initialized; `beforeunload` alone tears nothing down
  - [ ] Implement in `entrypoints/content.ts` main()
- [ ] Task 5.2: SPA route handling for page translation (FR-17)
  - [ ] Test: route change resets term memory; the snapshot is written under the old URL
  - [ ] Wire `startSpaNavigationWatcher` into the page session; correct its doc comment
- [ ] Task 5.3: Provider-accurate cache scope (FR-18)
  - [ ] Test: translation served by slot B is cached under B's scope; identically configured slots still share hits
  - [ ] Return the serving slot's identity from the pool; key cache writes by it
- [ ] Task 5.4: Explicit backfill ids (FR-19)
  - [ ] Test: partial response with a genuine source-identical translation is not marked backfilled
  - [ ] Add `backfilledIds` to `TranslationResult` in `services/openaiCompatible.ts`; consume it in `handleTranslate`
- [ ] Task 5.5: Small cleanups (FR-20)
  - [ ] `data-anyllm-walked` → WeakSet (or remove); `VIEWPORT_MARGIN`-derived margin; O(n) `deduplicateAncestors` for same-tree inputs
- [ ] Task: Automated phase gate 'Phase 5: Lifecycle and small fixes' — `pnpm test` (known flaky files per workflow.md) + `pnpm lint` (≤38 errors); no manual verification
