# Spec: Page Translation Hardening

**Track ID:** `page-translation-hardening_20261009`
**Type:** Bug / hardening
**Priority:** High
**Source:** Page-translation pipeline analysis, 2026-10-09 (findings 1–19; finding 13, iframe coverage, is out of scope).

## Overview

The page-translation lifecycle (session guards, Start/Stop mutex, scroll anchoring, failure cache) is sound. The defects are in text extraction, rich-markup encoding, DOM insertion, error classification, and long-session resource handling. Several are visible on most pages because rich translate is on by default. Findings 1 and 2 were reproduced with a throwaway Vitest probe:

| Input | Piece text sent | Problem |
|---|---|---|
| `<p>Plain<br>break</p>` | `Plainbreak` | `<br>` drops the word break |
| `<p>Tom &amp; Jerry<br>x <a>link</a></p>` (rich) | `Tom &amp; Jerry<br>x <z id="0">link</z>` | Literal `&amp;` and `<br>` rendered |
| `<li>Item <a>here</a><ul><li>Sub</li></ul></li>` (rich) | `Item <z id="0">here</z><ul><li>Sub item text</li></ul>` | Nested block duplicated as raw HTML |

## Functional Requirements

### A. Extraction correctness (`content/domWalker.ts`, `lib/richTranslate.ts`)

- **FR-1: Rich text is built from the piece's own group.** Rich encoding must not use `anchorElement.innerHTML`. It is built from the piece's tracked text nodes plus their inline ancestors up to the anchor. Block descendants, walker-rejected subtrees (exclude selectors, `translate="no"`, `.notranslate`, `SKIP_ELEMENTS`), and comments never appear in the piece text.
- **FR-2: Entities and void tags.** Rich text carries decoded characters (`&`, not `&amp;`). `<br>` becomes `\n`. Other void elements (`img`, `wbr`) are dropped from the LLM text; `img` may keep its `alt` text. Decoded output must never render a literal tag or entity that was not in the visible source.
- **FR-3: Line breaks in plain mode.** `<br>` between text nodes contributes `\n` to the piece text, so adjacent words are never glued together.
- **FR-4: Code blocks are not translated by default.** `pre` (and block-level code containers) are skipped when smart excludes are on (the default). Inline `code` keeps its current soft-preserve behaviour.
- **FR-5: CJK-aware splitting.** `splitAtSentenceBoundary` also breaks at `。！？；` and fullwidth equivalents. In rich mode it never splits inside a `<z id="N">` open tag or a `</z>` close tag, and every part keeps balanced `<z>` pairs.
- **FR-6: Visually-block custom elements split pieces.** Custom elements (tag name containing `-`) and elements whose computed `display` is block-level (`block`, `flex`, `grid`, `list-item`, `table*`) split pieces like `BLOCK_ELEMENTS`. Computed style is read only for non-standard or ambiguous tags and is cached per element for the walk.

### B. Display safety (`content/translationDisplay.ts`)

- **FR-7: Site nodes are never re-parented.** `LI`/`TD`/`TH` translations are appended as the last child without moving existing children into a wrapper. Translation-only mode hides originals with CSS (marker attribute on the host plus a hide rule scoped to non-translation children), not by moving nodes. Existing `ORIGINAL_WRAPPER_ATTR` cleanup still restores pages translated by older builds.
- **FR-8: Translation-only inline copies are debounced.** `showInlineLoadingPlaceholder` uses the debounced copy sync (`debouncedSyncInlineSiblings`), so N short pieces cost O(N), not O(N²).

### C. Cost and reliability (`entrypoints/content.ts`, `lib/`, `services/background.ts`)

- **FR-9: Automatic retries do not clear the provider-failure pause.** Only a user-initiated retry (an error-chip click or the banner's Retry) or a successful batch clears `systemicPause`. An automatic retry runs with `skipFailureCache` but leaves the pause and banner untouched, and skips dispatch while paused.
- **FR-10: Retry and pause classification.** Content-side automatic retry uses a retry classifier (retry 408/429/5xx/network/parse; never retry 401/403/invalid-key/quota/billing). Auth, key, quota and billing failures enter the provider-failure pause with a settings link. `isTransientTranslationError` stays negative-cache-only.
- **FR-11: Live-text churn freeze.** An element whose source text changes more than 3 times within 60 s is frozen for the session. It is no longer re-extracted or re-translated, and its last translation is removed so stale text does not mislead. The freeze is per element (WeakMap) and resets on Start/Stop.
- **FR-12: Non-streaming requests are cancellable.** Stop, restore, and session teardown abort in-flight non-streaming `translate` work for that tab. The background keeps a per-tab AbortController map, threaded as `signal` into `handleTranslate`. A cancelled request produces no DOM writes, no cache writes for unfinished batches, and no pool failover.

### D. Memory and performance (`entrypoints/content.ts`, `content/viewportObserver.ts`, `content/translationDisplay.ts`)

- **FR-13: Detached pieces release every reference.** `pruneDetachedPieces` unobserves the parent in `ViewportObserver` (new `unobserve(piece)` that drops it from `pieceMap` and from the IntersectionObserver when no pieces remain), clears dispatch state, and untracks or removes display artifacts (`pieceElements`).
- **FR-14: Mutation flush is not quadratic.** Affected pieces are found by walking up from each delivered element through a parent→pieces index, not by looping over all pieces × added elements. Subsumption uses a textNode→piece index.
- **FR-15: Status updates avoid forced layout.** `sendStatusUpdate` is throttled (rAF or ≥250 ms trailing). Near-viewport membership comes from IntersectionObserver state (a tracked visible-parent set), not `getBoundingClientRect` on every piece. The look-ahead step uses the same source.

### E. Lifecycle and small fixes

- **FR-16: bfcache-safe teardown.** Interaction-feature cleanup moves from `beforeunload` to `pagehide`. On `pageshow` with `persisted === true`, features are re-initialized. A cancelled "Leave site?" dialog no longer kills features.
- **FR-17: SPA route awareness for page translation.** Fix the SPA watcher's comment: the isolated world cannot see page-script `pushState`, so polling is the real signal. On a route change during page translation, reset session term memory and write the resume snapshot under the pre-navigation URL.
- **FR-18: Cache scope matches the serving provider.** The web cache model and fingerprint come from the provider slot that actually produced the translation, not the first enabled provider. Cache reads must still hit across slots that are configured identically.
- **FR-19: Backfill detection is explicit.** The provider marks back-filled ids explicitly (a set on `TranslationResult`). `handleTranslate` no longer infers a backfill from `partial && text === source`.
- **FR-20: Small cleanups.**
  - Stop writing `data-anyllm-walked` onto site elements (use a WeakSet) or remove it if unused.
  - Replace the hardcoded `200` in `viewportObserver.redispatchVisible` with a value parsed from `VIEWPORT_MARGIN`.
  - Restore the O(n) last-kept check in `deduplicateAncestors` for same-tree inputs, keeping the full check only across shadow boundaries.

## Non-Functional Requirements

- No regression in the existing page-translation suites (`content/__tests__/webTranslateLifecycle.test.ts` and the related suites). The coverage floor stays ≥70%.
- ESLint error count must not grow beyond the 38 recorded at HEAD.
- No new host-page style pollution. New CSS stays scoped to `data-anyllm-*` attributes.
- Every finding gets a failing test first (TDD), reproducing the behaviour above.

## Acceptance Criteria

1. The three probe inputs in the Overview produce `Plain\nbreak`, `Tom & Jerry\nx <z id="0">link</z>`, and `Item <z id="0">here</z>` respectively, and decoding shows no literal tags or entities.
2. A `<pre>` block on a site with no site rule is not extracted with default settings.
3. A 2,000-character Chinese paragraph splits only at `。！？` boundaries. A rich piece over the limit splits with balanced `<z>` tags.
4. With a React-rendered list (simulated in jsdom by holding child references and calling `parent.removeChild(child)` after translation), no `NotFoundError` is thrown in either display mode.
5. In a test with two concurrent failing batches, the pause stays active after an automatic retry. A 401 error causes no automatic retry and enters the pause.
6. An element updated 5 times in 60 s triggers at most 3 translation requests, then none.
7. After Stop, a pending non-streaming request's provider call receives an aborted signal and writes nothing.
8. After 1,000 detach/append cycles, `ViewportObserver.observedCount` and the display tracking map stay bounded by the live piece count.
9. A mutation flush with 5,000 pieces and 50 added elements completes without O(N×M) `contains` calls (asserted with a spy or counter).
10. A `pageshow` with `persisted: true` re-enables hover, selection, inline translate and shortcuts.
11. `pnpm test` is green apart from the known flaky files (per `workflow.md`), and `pnpm lint` reports ≤38 errors.

## Out of Scope

- **Finding 13: iframe / `allFrames` coverage.** Excluded by the user.
- Closed shadow roots.
- Any change to subtitle, PDF, or inline-input translation pipelines.
- New user-facing settings. Thresholds (churn 3/60 s, throttle 250 ms) are constants.
