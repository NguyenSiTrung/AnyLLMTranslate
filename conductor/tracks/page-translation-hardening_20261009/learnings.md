# Track Learnings: page-translation-hardening_20261009

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

From `conductor/patterns.md` — "Page translation — shadow roots, lifecycle, per-piece failure":
- Centralize root discovery (`content/shadowDomRoots.ts`) — extraction, retirement and teardown must agree on one root set.
- Retire pieces when the page edits its own source; never append a sibling translation.
- Stop means abort, not just clear — in-flight stream AND fallback requests (FR-12 closes the non-stream gap).
- Never mark a deduplicated piece translated when its canonical batch failed.
- Streaming and non-streaming paths share cache and batch budgets.

From Beads memory `subtitle-chunk-retry-classification`:
- `lib/translationErrors.ts` `isTransientTranslationError` is for the NEGATIVE CACHE only and deliberately treats auth/quota as transient — do not use it for retry decisions (FR-10).

## Analysis evidence (2026-10-09 probe)
- Plain: `Plain<br>break` → `Plainbreak`.
- Rich: `Tom &amp; Jerry<br>x <a>link</a>` → `Tom &amp; Jerry<br>x <z id="0">link</z>`; decode round-trip shows literal `&amp;` and `<br>`.
- Rich: nested `<li>` content duplicated as raw `<ul><li>…` in the parent piece.

---

<!-- Learnings from implementation will be appended below -->

## [2026-10-09] - Phase 1 Task 1.1: `<br>` → `\n` in plain piece text (FR-3)
- **Implemented:** `content/pieceText.ts` `joinGroupText()` / `groupSeparator()` — one `\n` per `<br>` between adjacent group text nodes (capped at 2), found by a bounded document-order scan. Used by `extractPieces` and by `isPieceSourceUnchanged` in `entrypoints/content.ts`.
- **Files changed:** content/pieceText.ts (new), content/domWalker.ts, entrypoints/content.ts, content/__tests__/domWalker.hardening.test.ts (new)
- **Learnings:**
  - Gotchas: `webTranslateLifecycle.test.ts` `vi.doMock`s `@/content/domWalker` as `{ extractPieces }` only — any new helper content.ts needs from the walker must live in a separate module (hence `pieceText.ts`).
  - Patterns: the extraction baseline (`sourceText`) and the sm7n live recompute must use one shared join function, or every `<br>` paragraph invalidates on the first mutation.
---

## [2026-10-09] - Phase 1 Task 1.2: Group-scoped rich encoding (FR-1)
- **Implemented:** `encodeInlineNodes(textNodes, anchor, separator)` in `lib/richTranslate.ts` replaces the regex `encodeInlineHtml(anchor.innerHTML)`. It walks the group's own text nodes, diffs each node's whitelisted inline-ancestor chain against the open stack, and emits `<z id>` / `</z>` transitions; `openHtml` is serialized from `el.attributes`. `encodeInlineHtml` removed (only tests used it); the rich test keeps its assertions through a small snippet→nodes helper.
- **Files changed:** lib/richTranslate.ts, content/domWalker.ts, lib/__tests__/richTranslate.test.ts, content/__tests__/domWalker.hardening.test.ts
- **Learnings:**
  - Patterns: encode from the walker's accepted nodes, never from serialized HTML — the walker's accept/reject decisions (exclude selectors, `translate="no"`, SKIP_ELEMENTS, block splits) are then automatically honored by the rich text.
  - Gotchas: `lib/` must not import `content/`; the `<br>` separator is injected as a callback (`groupSeparator`).
---

## [2026-10-09] - Phase 1 Task 1.3: Entities and void tags (FR-2)
- **Implemented:** Text/`<br>`/void handling came with the node encoder (Text.data, `groupSeparator`, voids are never text nodes). New here: `decodeAttrEntities()` in `parseOpenTag`, so `href="/q?a=1&amp;b=2"` decodes to `a=1&b=2` (it was a pre-existing bug in the innerHTML path too). `img alt` is not carried (spec "may").
- **Files changed:** lib/richTranslate.ts, lib/__tests__/richTranslate.test.ts, content/__tests__/domWalker.hardening.test.ts
- **Learnings:**
  - Gotchas: decode attribute entities BEFORE the `isSafeUrl` check — `&#106;avascript:` must be judged as `javascript:`.
---

## [2026-10-09] - Phase 1 Task 1.4: Skip code blocks by default (FR-4)
- **Implemented:** `pre`, `.CodeMirror`, `.cm-editor`, `.monaco-editor` added to `SMART_EXCLUDE_SELECTORS` (types/config.ts). `enableSmartExcludes` defaults on, so code blocks are skipped without a site rule; inline `code` stays soft-preserved because the walker only hard-skips non-inline matches.
- **Files changed:** types/config.ts, content/__tests__/domWalker.hardening.test.ts
- **Learnings:**
  - Context: smart excludes are merged in `translatePage` (`entrypoints/content.ts`), so a walker test with `excludeSelectors: [...SMART_EXCLUDE_SELECTORS]` is the faithful default-settings check. Avoided `.highlight` — some sites use it on prose.
---

## [2026-10-09] - Phase 1 Task 1.5: CJK-aware, tag-safe splitting (FR-5)
- **Implemented:** `splitAtSentenceBoundary` (now exported) picks cuts via `SENTENCE_END_RE` (ASCII `.?!`+space, `。！？；｡．`, `\n`), falls back to whitespace outside `<z>` tokens, then a forced cut moved back before any token (`tagSafeCut`). `balanceZTags` closes open `<z>` at each part end and reopens them at the next part start; tag-only parts are dropped.
- **Files changed:** content/domWalker.ts, content/__tests__/domWalker.hardening.test.ts
- **Learnings:**
  - Gotchas: never call `.test()` on a shared `/g` regex — `lastIndex` persists between calls, so the second call can return false. Use `matchAll`/`replace` (stateless) or `includes`.
  - Patterns: a split link becomes two `<a>` elements with the same attributes — acceptable, and each part decodes independently.
---

## [2026-10-09] - Phase 1 Task 1.6: Visually-block custom elements split pieces (FR-6)
- **Implemented:** `createBlockClassifier()` per `extractPieces` call. Known block tags / `data-as` as before; ambiguous tags (`SPAN`, custom `x-*`, `HTMLUnknownElement`) read computed `display` once (Map cache) and split when block-level (`block|flex|grid|list-item|flow-root|table*`, never `inline-*`). Custom elements also split when not embedded in running text (no non-whitespace text sibling). Anchor walk-up stops at a block-rendered inline tag.
- **Files changed:** content/domWalker.ts, content/__tests__/domWalker.hardening.test.ts
- **Learnings:**
  - Context: jsdom does implement `getComputedStyle().display` (div→block, span/custom→inline, inline `style` honored), so FR-6 is unit-testable; spy on `window.getComputedStyle` and call it via `ownerDocument.defaultView`.
  - Gotchas: custom elements default to `display:inline` in browsers and jsdom; a pure computed-style rule would never split unstyled `<x-card>`s, while an unconditional rule splits GitHub's inline `<relative-time>` out of its sentence — hence the prose-adjacency tie-breaker.
---

## [2026-10-09] - Phase 1 gate
- tsc 0 errors; lint back to the 38 baseline after fixing one `prefer-const` the gate caught; `pnpm test` 755/757 with 2 × 5 s timeouts in `subtitleCoordinator.test.ts` (known load-sensitive file; isolated reruns 2/3 green with a moving failing case).
---

## [2026-10-09] - Phase 2 Task 1: Append-only LI/TD/TH insertion (FR-7)
- **Implemented:** contained hosts are marked in place (`data-anyllm-contained` + role=original/TRANSLATED) instead of wrapping children; translation appended (or prepended for "above"); inline clone goes right after the inline element inside the host.
- **Files changed:** content/translationDisplay.ts, content/sectionTranslate.ts, styles/inject.css, content/__tests__/translationDisplay.test.ts
- **Learnings:**
  - Patterns: Marking the host itself as role=original keeps every existing ownership check (ownerOriginalFor, hasOwnedArtifacts, mutation watcher originalHostFor, walker TRANSLATED skip) working with zero changes.
  - Gotchas: Bare text nodes cannot be hidden by a selector — translation-only hides contained source via host `font-size:0` + child restore from a captured `--anyllm-host-font-size` var (read before the state flips, batched in setPageState).
  - Gotchas: every role=original theme/position rule (side-by-side 48%, above order/display) must be scoped `:not([data-anyllm-contained])` or it resizes the LI/TD itself.
  - Context: legacy `data-anyllm-original-wrapper` unwrap stays in cleanup paths for pages translated by older builds.
---

## [2026-10-09] - Phase 2 Task 2: Debounce translation-only inline copy sync (FR-8)
- **Implemented:** `showInlineLoadingPlaceholder` uses `debouncedSyncInlineSiblings`; `scheduleDomWrite` now drops a function already queued for the frame.
- **Files changed:** content/translationDisplay.ts, lib/performance.ts, content/__tests__/translationDisplay.inlineSync.test.ts
- **Learnings:**
  - Gotchas: `scheduleDomWrite` batched into one rAF but queued duplicates, so "debounced" sync still ran N times per frame — identity dedupe in the queue was the actual fix.
  - Patterns: rAF-debounce tests go in their own file with `vi.useFakeTimers({ toFake: ['requestAnimationFrame'] })` + `advanceTimersToNextFrame()`; module-level queue state from earlier tests in the same file can leave a real rAF pending.
---

## [2026-10-09] - Phase 2 gate: Display safety
- **Result:** tsc 0; lint 38 (baseline); pnpm test 762/763.
- **Learnings:**
  - Gotchas: this run's flake was `background.streamStats.test.ts` (dedupe case, `expected undefined to be defined`), failing 2/3 isolated reruns with no `services/` diff — matches the workflow.md load-sensitive class, not a regression.
---

## [2026-10-09] - Phase 3 Task 1: Retry classifier and pause rules (FR-10)
- **Implemented:** `lib/webTranslateRetry.ts` — `isRetryableWebTranslationError` (408/429/5xx/network/timeout/parse/pool; never 401/402/403/key/quota/billing) and `isProviderPauseError` (auth/quota + pool/rate-limit). content.ts uses them for all three auto-retry sites and the pause; `isTransientTranslationError` is negative-cache-only again.
- **Files changed:** lib/webTranslateRetry.ts, lib/__tests__/webTranslateRetry.test.ts, entrypoints/content.ts, content/__tests__/webTranslateLifecycle.test.ts
- **Learnings:**
  - Gotchas: `vi.doMock` factory spies in webTranslateLifecycle's FR-1b block survive `vi.resetModules()` across tests — `mockClear()` notification/display spies before counting calls.
  - Patterns: auth/quota check runs first in the retry classifier so a pool-exhaustion wrapper ("All providers failed: 401") pauses instead of retrying.
---

## [2026-10-09] - Phase 3 Task 2: Automatic retry never clears the pause (FR-9)
- **Implemented:** `translatePieces` gains `userRetry` (error chip); only it clears/bypasses `systemicPause` and the resume-restore guard. `skipFailureCache` now only means "bypass the negative cache". An auto retry pending when another batch paused is skipped and its pieces get retryable error chips (per-piece error kept in `autoRetryErrors`).
- **Files changed:** entrypoints/content.ts, content/__tests__/webTranslateLifecycle.test.ts
- **Learnings:**
  - Gotchas: overloaded flags — `skipFailureCache` doubled as "user intent", so the silent auto retry cleared the banner and re-observed everything. Name intent separately from transport options.
  - Patterns: concurrency tests use per-id deferred `sendMessage` promises; a re-dispatch should resolve immediately so a regression fails on an assertion, not a 5 s timeout.
---

## [2026-10-09] - Phase 3 Task 3: Live-text churn freeze (FR-11)
- **Implemented:** `content/churnGuard.ts` (`ChurnGuard`: WeakMap of change timestamps + WeakSet of frozen elements, injectable clock). The mutation callback records each changed piece parent after `retirePiece` (which already removes the translation); on the 4th change in 60 s the parent is frozen and dropped from forced roots, normal roots and newly extracted pieces. Reset in `teardownPageTranslationSession` (Start and Stop).
- **Files changed:** content/churnGuard.ts, content/__tests__/churnGuard.test.ts, entrypoints/content.ts, content/__tests__/webTranslateLifecycle.test.ts
- **Learnings:**
  - Gotchas: freezing must filter three paths — forced roots, normal roots (the watcher delivers the frozen element itself once its markers are gone) and extracted pieces whose parent is frozen.
  - Patterns: lifecycle churn tests build each mocked piece from the live text node so `isPieceSourceUnchanged` sees the real detach on `textContent =`.
---

## [2026-10-09] - Phase 3 Task 4: Abortable non-streaming translate (FR-12)
- **Implemented:** `webTranslateControllers` (tab → frame → AbortController) in services/background.ts; the `translate` action passes `{ signal }` to `handleTranslate`, whose existing cancellation path (throwIfCancelled, raceWithAbort, pool `isCancelled` no-failover, no cache write) now covers non-streaming too. `restore` / new `CANCEL_PAGE_TRANSLATE` abort the sending frame, or every frame when only `tabId` is given (popup); tab close aborts all. Content `teardownPageTranslationSession` sends `CANCEL_PAGE_TRANSLATE` when requests are in flight.
- **Files changed:** services/background.ts, types/messages.ts, entrypoints/content.ts, services/__tests__/background.translate.test.ts, content/__tests__/webTranslateLifecycle.test.ts
- **Learnings:**
  - Patterns: key cancellation by frame as well as tab — a subframe's Stop must not abort the top frame's work; a lazily recreated controller (replace when aborted) serves a new session without explicit registration/cleanup per request.
  - Gotchas: the request semaphore serializes page translate in tests — cancellation tests must not assume two concurrent fetches.
---

## [2026-10-09] - Phase 3 gate: Cost and reliability
- **Result:** tsc 0; lint 38; every tracked test file green (829/829).
- **Learnings:**
  - Gotchas: vitest's include glob picks up untracked scratch dirs (`.review-scratch/__tests__/repro.test.ts` — intentional failing repros from another review). Read the FAIL paths before treating a gate as red; never delete or stage another session's scratch files.
---

## [2026-10-09] - Phase 4 Task 1: Release detached pieces fully (FR-13)
- **Implemented:** `ViewportObserver.unobserve(piece)` (drops the piece from its target list, pending batch and dispatch ids; unobserves the target once empty). `pruneDetachedPieces` calls it plus `removePieceArtifacts`; `retirePiece` uses it instead of `release`. Test hook `__pieceElementCountForTest`.
- **Files changed:** content/viewportObserver.ts, content/translationDisplay.ts, entrypoints/content.ts, content/__tests__/observers.test.ts, content/__tests__/translationDisplay.test.ts, content/__tests__/webTranslateLifecycle.test.ts
- **Learnings:**
  - Gotchas: a block translation is inserted AFTER its original, so a site that removes the original leaves the translation connected — pruning must remove artifacts, not just forget the piece.
  - Patterns: `findPieceElement` already self-heals the id→element map for detached elements; the leak was in observer `pieceMap` (IntersectionObserver kept detached targets alive).
---

## [2026-10-09] - Phase 4 Task 2: Indexed mutation flush (FR-14)
- **Implemented:** `piecesByParent` (WeakMap<Element, Set<piece>>) and `pieceByTextNode` (WeakMap<Text, piece>) maintained by register/unregister and reset in `replaceAllPieces`. The flush walks up from each delivered element and scans its subtree for indexed parents; subsumption goes through the text-node index. 5,000 pieces × 50 added: 510,000 → <1,020 `Node.contains` calls.
- **Files changed:** entrypoints/content.ts, content/__tests__/webTranslateLifecycle.test.ts
- **Learnings:**
  - Gotchas: `replaceAllPieces(next)` adopts the caller's array and `retirePiece` splices it — tests must capture a piece before triggering a retire, not index the original array afterwards.
  - Patterns: the descendant direction (`el.contains(parent)`) is an index probe over `el.querySelectorAll('*')` — O(subtree), same shadow-boundary semantics as `contains`.
  - Context: lint baseline is now 37 (the removed subsumption loop carried a non-null assertion).
---

## [2026-10-09] - Phase 4 Task 3: Throttled, layout-free status (FR-15)
- **Implemented:** `ViewportObserver` gains two membership IntersectionObservers (near = VIEWPORT_MARGIN, ahead = `0 0 900px 0`) that, unlike the dispatch IO, keep watching after dispatch; `isNearViewport(el)` / `isInLookaheadBand(el)` read their Sets. `buildStatusResponse` and `scheduleLookaheadPrefetch` use them instead of `getBoundingClientRect`. `sendStatusUpdate` is leading + trailing throttled at 250 ms (`broadcastStatus` does the work); the timer is cleared in `destroyZombie`.
- **Files changed:** content/viewportObserver.ts, lib/lookaheadPrefetch.ts, lib/webTranslateStatus.ts, entrypoints/content.ts, content/__tests__/observers.test.ts, content/__tests__/webTranslateLifecycle.test.ts, lib/__tests__/throttling.test.ts, lib/__tests__/webResume.test.ts
- **Learnings:**
  - Gotchas: existing observer tests take the dispatch IO as `MockIntersectionObserver.instances.at(-1)`, so the dispatch IO is constructed last.
  - Patterns: membership is tracked per target with a piece Set so `unobserve` (FR-13) detaches the membership IOs once the last piece on a target goes — no detached-target leak.
  - Context: `redispatchVisible` still reads geometry; Task 5.5 can switch it to `nearTargets`.
---

## [2026-10-09] - Phase 4 gate: Memory and performance
- **Result:** tsc 0, lint 37 (baseline 38), tracked tests 824/824. The untracked `.review-scratch` repro file (20 tests, 8 intentionally failing) is excluded.
- **Learnings:**
  - Gotchas: the Phase 3 gate note's "829/829" counted 12 passing scratch tests; tracked was 817 then. Count tracked tests with `vitest run --exclude '.review-scratch/**'`, not total minus failures.
---
