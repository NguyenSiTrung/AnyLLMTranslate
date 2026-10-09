# Plan: Page Translation Hardening

**Track:** `page-translation-hardening_20261009` · **Spec:** [spec.md](./spec.md)

Each task is TDD: write the failing test → implement → run the affected suites → commit (`fix(<scope>): … [page-translation-hardening Px.Ty]`) with a git note. Phases 1 and 2 touch disjoint files and may run in parallel; Phases 3–5 run sequentially after both. No manual verification — each phase closes on the automated gate.

## Phase 1: Extraction correctness
<!-- execution: sequential -->
<!-- depends: -->
<!-- files: content/domWalker.ts, lib/richTranslate.ts, types/config.ts, related tests -->

- [ ] Task 1.1: `<br>` → `\n` in plain piece text (FR-3)
  - [ ] Test: `Plain<br>break` → `Plain\nbreak`; multiple `<br>` collapse sensibly; `sourceText` baseline matches what `isPieceSourceUnchanged` recomputes
  - [ ] Implement in `extractPieces` walk (track BR between text nodes of the current group) and keep `isPieceSourceUnchanged` consistent
- [ ] Task 1.2: Group-scoped rich encoding (FR-1)
  - [ ] Test: nested-list probe yields `Item <z id="0">here</z>`; excluded/`translate="no"`/`pre` subtree inside anchor never appears in rich text; multi-group parent (`Text A <p>…</p> Text B`) encodes each group separately
  - [ ] Implement a node-based encoder in `lib/richTranslate.ts` (`encodeInlineNodes(textNodes, anchor)`) and switch `domWalker.ts:255` to it; keep `encodeInlineHtml` for other callers or remove if unused
- [ ] Task 1.3: Entities and void tags (FR-2)
  - [ ] Test: `Tom &amp; Jerry<br>x <a>link</a>` encodes to `Tom & Jerry\nx <z id="0">link</z>`; decode renders no literal `&amp;`/`<br>`; `img[alt]` handling
  - [ ] Implement in the node-based encoder (text from `Text.data`, BR → `\n`)
- [ ] Task 1.4: Skip code blocks by default (FR-4)
  - [ ] Test: `<pre>` on a host without site rules is not extracted with default settings; inline `code` stays in the parent piece
  - [ ] Add `pre` (and block code containers) to `SMART_EXCLUDE_SELECTORS` in `types/config.ts`
- [ ] Task 1.5: CJK-aware, tag-safe splitting (FR-5)
  - [ ] Test: long Chinese paragraph splits only at `。！？；`; rich piece >1000 chars never cuts inside `<z id="N">`/`</z>` and each part has balanced tags
  - [ ] Implement in `splitAtSentenceBoundary` (`domWalker.ts:106`)
- [ ] Task 1.6: Visually-block custom elements split pieces (FR-6)
  - [ ] Test: two sibling `<x-card>` elements with text under one `<div>` become two pieces; `span` with computed `display:block` splits; standard inline tags never call `getComputedStyle`
  - [ ] Implement `isBlockElement` fallback with per-walk cache
- [ ] Task: Automated phase gate 'Phase 1: Extraction correctness' — `pnpm test` (known flaky files per workflow.md) + `pnpm lint` (≤38 errors); no manual verification

## Phase 2: Display safety
<!-- execution: sequential -->
<!-- depends: -->
<!-- files: content/translationDisplay.ts, styles/, related tests -->

- [ ] Task 2.1: Append-only LI/TD/TH insertion (FR-7)
  - [ ] Test: after translating an LI with held child references, `li.removeChild(child)` succeeds in dual and translation-only modes; original children keep their parent; translation-only hides originals via CSS; legacy `ORIGINAL_WRAPPER_ATTR` pages still restore cleanly
  - [ ] Implement in `insertIntoContainedElement` / `getInlineRenderTarget` / `removeAllTranslations` plus scoped CSS in `styles/`
- [ ] Task 2.2: Debounce translation-only inline copy sync (FR-8)
  - [ ] Test: N inline placeholders in translation-only mode cause one sync pass (spy), and clones still appear
  - [ ] Switch `showInlineLoadingPlaceholder` to `debouncedSyncInlineSiblings`
- [ ] Task: Automated phase gate 'Phase 2: Display safety' — `pnpm test` (known flaky files per workflow.md) + `pnpm lint` (≤38 errors); no manual verification

## Phase 3: Cost and reliability
<!-- depends: phase1, phase2 -->

- [ ] Task 3.1: Retry classifier and pause rules (FR-10)
  - [ ] Test: 401/403/"invalid api key"/quota → no automatic retry, enters the pause with a settings link; 429/503/network → one automatic retry
  - [ ] Add `isRetryableWebTranslationError` (string-based, in `lib/`) and an auth/quota pause predicate; use them in `translatePieces`
- [ ] Task 3.2: Automatic retry never clears the pause (FR-9)
  - [ ] Test: batch A enters the pause; batch B's automatic retry runs → pause and banner remain, nothing re-observed
  - [ ] Split "user retry" from "automatic retry" options in `translatePieces`
- [ ] Task 3.3: Live-text churn freeze (FR-11)
  - [ ] Test: element changed 5×/60 s → ≤3 requests, then frozen; translation removed on freeze; reset on Stop/Start
  - [ ] Implement a churn WeakMap in the mutation callback (`content.ts:1483+`)
- [ ] Task 3.4: Abortable non-streaming translate (FR-12)
  - [ ] Test (background): `restore` / `CANCEL_PAGE_TRANSLATE` aborts the per-tab controller; `handleTranslate` sees an aborted signal, no cache write, no failover
  - [ ] Test (content): Stop sends the cancel; late response writes nothing (existing session guard)
  - [ ] Implement per-tab `webTranslateControllers` in `services/background.ts`; pass `{ signal }` execution to `handleTranslate` for the `translate` action
- [ ] Task: Automated phase gate 'Phase 3: Cost and reliability' — `pnpm test` (known flaky files per workflow.md) + `pnpm lint` (≤38 errors); no manual verification

## Phase 4: Memory and performance

- [ ] Task 4.1: Release detached pieces fully (FR-13)
  - [ ] Test: 1,000 detach/append cycles keep `observedCount` and the display tracking map bounded
  - [ ] Add `ViewportObserver.unobserve(piece)`; call it plus `untrackPieceElement`/`removePieceArtifacts` from `pruneDetachedPieces`
- [ ] Task 4.2: Indexed mutation flush (FR-14)
  - [ ] Test: 5,000 pieces + 50 added elements — `contains` call count is O(added × depth) (counter/spy); existing sm7n invalidation tests still pass
  - [ ] Add parent→pieces and textNode→piece indexes maintained by `registerPiece`/`unregisterPiece`
- [ ] Task 4.3: Throttled, layout-free status (FR-15)
  - [ ] Test: 20 rapid status triggers → ≤2 broadcasts; no `getBoundingClientRect` calls on status computation
  - [ ] Track visible parents from IntersectionObserver entries; throttle `sendStatusUpdate`; reuse for look-ahead
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
