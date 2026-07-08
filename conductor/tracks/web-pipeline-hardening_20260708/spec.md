# Spec — Bilingual Page-Translation Pipeline Hardening v2

## Overview
Close five remaining gaps between our bilingual web-page translation pipeline and Immersive Translate, identified by side-by-side architectural analysis. All changes target the DOM-extraction → batching → mutation-watcher path (`content/domWalker.ts`, `lib/textBatching.ts`, `services/background.ts`, `content/mutationWatcher.ts`, `entrypoints/content.ts`). No changes to display/theme logic, subtitles, or PDF.

## Background / Problem
A comparison against ImmersiveTranslate v1.30.3 surfaced 5 issues in three buckets:
- **Correctness**: a single MutationObserver on `document.body` is silently orphaned when an SPA framework replaces the entire `<body>` node (Next.js App Router, Astro view transitions, Turbo Drive, React re-hydration). Translation never resumes after such swaps.
- **Performance**: `element.matches(selector)` runs uncached for every element × every exclude selector during the walk (`domWalker.ts:53`); the walk descends into every subtree under `<body>` rather than restricting to top-level content containers.
- **Quality / Cost**: all pieces are batched flat, interleaving article prose with sidebar/nav text (loses coherent context); "related articles" boxes with many short links get fully translated (token waste + page clutter).

## Functional Requirements

### FR-1 — Body-swap observer (SPA `<body>` replacement)
- Add a second `MutationObserver` on `document.documentElement` observing `{ childList: true }`.
- On detecting a NEW `<body>` child node (different identity than the previously-seen body, or a body added after having been removed), debounced, re-initialize translation on the new body via `startTranslation()`.
- Idempotent: must not double-fire; guard against the same body identity triggering more than once.
- Honors the existing translation session guard (stale writes from the pre-swap session are dropped).
- Torn down on `stopTranslation()` / restore.

### FR-2 — Selector-match cache
- Memoize `element.matches(selector)` results in a `WeakMap<Element, Map<string, boolean>>`.
- Consumed by `domWalker.ts` `shouldSkipElement` (and any other hot-path `.matches()` call in the page path).
- GC-safe: entries vanish when elements leave the DOM; no manual eviction needed.

### FR-3 — In-article vs out-of-article batch separation
- During extraction, tag each `TranslationPiece` with `inArticleContext: boolean` using the **semantic/ID heuristic**: nearest block ancestor is `<article>`, `<main>`, `[role="main"]`, `#main`, `#content`, or `#primary` → `true`; else `false`.
- The background `handleTranslate` partitions pieces into two groups and builds separate batches per group (both still respect `maxTextGroupLengthPerRequest` / `maxTextLengthPerRequest`).
- The `inArticleContext` flag is carried on the piece, survives the message round-trip, and does not affect caching keys or display.

### FR-4 — Body-tag traversal whitelist (opt-in)
- New setting `enableBodyTagWhitelist: boolean` (default **off**).
- When ON, the walk under `<body>` only descends into direct children whose tag is in a whitelist (`MAIN`, `ARTICLE`, `SECTION`, `DIV`); other top-level tags (`NAV`, `ASIDE`, `HEADER`, `FOOTER`, `FORM`, `TABLE`, …) are skipped entirely.
- Excludes/selectors still apply within whitelisted containers. Composable with smart-excludes.

### FR-5 — Aside text caps (opt-in)
- New setting `enableAsideCaps: boolean` (default **off**).
- When ON, within any "aside region" (elements matching `ASIDE`, `[role="complementary"]`, or our `SMART_EXCLUDE` sidebar selectors), apply per-paragraph and per-region text caps:
  - per-paragraph: skip pieces longer than `asideMaxTextPerParagraph` (default 67 chars, matching ImmersiveTranslate)
  - per-region: stop translating a region once cumulative chars exceed `asideMaxTextPerRegion` (default 1000)
- Cap values are not user-configurable in this track (constants); future track can surface them.

## Non-Functional Requirements
- No new external dependencies.
- All new settings default to OFF (FR-4, FR-5) or are pure optimizations (FR-1, FR-2, FR-3) — zero behavior change for existing users unless they opt in.
- No regression to the 999-test suite.
- No change to display classes, data attributes, or cache key format.

## Acceptance Criteria
1. On a page that replaces `<body>` mid-session (simulated in jsdom), translation re-initializes on the new body and the new content is translated.
2. Repeated `.matches()` calls for the same element+selector hit the cache (verified by spy: second call returns cached boolean without re-invoking the underlying matcher in a deterministic test).
3. A batch sent to the background contains pieces tagged `inArticleContext`; article and sidebar pieces arrive in separate LLM request payloads (verified by inspecting the translated message batches).
4. With `enableBodyTagWhitelist` ON, top-level `<nav>`/`<aside>` subtrees are not walked (verified by spy on the walker entry).
5. With `enableAsideCaps` ON, an aside region with 40 short links translates at most the capped number.
6. All toggles OFF → behavior identical to current (regression test).

## Out of Scope
- Batch pattern detection (#7 from the analysis — niche, deferred).
- Parsed-paragraph dirty marker for mutation efficiency (#6 — separate efficiency track).
- UI for configuring cap thresholds (kept as constants here).
- Per-site overrides of the whitelist/caps (global only).
