# Track: Web Page Translation — UX, Performance & Quality v3

**Track ID:** `web-translate-v3_20260714`
**Type:** Feature (improvement)
**Priority:** High
**Depends on:** none (builds on archived `web-bilingual-quality_20260707` + `web-pipeline-hardening_20260708`)
**Source:** Deep analysis of current web translation pipeline (2026-07-14)

---

## Overview

Close remaining product gaps in bilingual **web page** translation after the quality and pipeline-hardening tracks. Work spans four pillars:

1. **UX** — honest progress, streaming by default, clear pause/failure chrome, content-scope presets, in-page control
2. **Performance** — parallel sub-batches, session settings cache, look-ahead, adaptive batching, mutation dirtying, content orchestrator split
3. **Quality** — term memory, JSON repair, richer lang detect, optional model-scoped cache, category prompt snippets, quality self-check, safer aside defaults
4. **Reliability** — resume de-dup, stream/pageContext parity, shadow DOM (opt-in), characterData thrash guards, layout containment (opt-in)

**Default policy: Balanced.** High-ROI, reverse-safe defaults flip on; site-risky or cache-breaking features stay opt-in. Subtitle and PDF paths are regression-guarded only (no feature work unless a shared seam is required).

---

## Default policy (Balanced)

### New defaults ON (or always-on internal)

| Item | Behavior |
|------|----------|
| Streaming translation | `enableStreamingTranslation` default → `true`; keep non-stream fallback |
| Aside caps | `enableAsideCaps` default → `true` |
| Viewport-aware progress | Popup/status copy reflects visible vs remaining-as-you-scroll |
| Systemic-pause banner | Sticky in-page bar with Retry / Open settings |
| Parallel sub-batches | Always-on in `handleTranslate` (bounded concurrency) |
| Parallel cache lookups | Always-on |
| Session settings cache | Always-on for a translation session; invalidate on storage change |
| Expanded lang detect | Always-on when source-lang detection is enabled |
| Document term memory | Automatic, capped; no toggle required |
| JSON parse repair | Automatic before error UI |
| Stream + pageContext parity | Always-on correctness fix |
| characterData thrash guards | Always-on |
| Resume identity de-dup | Always-on |

### Stay opt-in / Advanced

| Item | Gate |
|------|------|
| Layout-break containment | `enableLayoutContainment` (default off) |
| Model/provider in cache key | `cacheKeyIncludesModel` (default off) |
| Shadow DOM piercing | `enableShadowDomWalk` (default off) or site-list later |
| Adaptive batch size | `enableAdaptiveBatching` (default off until calibrated) |
| Quality self-check | `enableTranslationQualityCheck` (default off) |
| Body-tag whitelist | remains existing setting (default off); preset can turn on |

### Escape hatch

- Options preset **Classic** restores pre-track defaults: streaming off, aside caps off, full-page walk, no layout containment, no model-scoped cache.
- Presets: **Classic** | **Balanced** (default) | **Main content only** | **Full page**.

---

## Functional Requirements

### Phase 1 — Quick wins (UX + cheap perf)

**FR-1 — Viewport-aware progress**  
Status payload distinguishes `translatedCount`, `totalCount`, `visiblePending` (or equivalent). Popup shows honest copy (e.g. “Reading area ready · N more as you scroll”) instead of implying whole-page completion while off-screen pieces remain.

**FR-2 — Streaming default ON**  
Flip `enableStreamingTranslation` default to `true` with migration-safe deepMerge. Document fallback path. No regression when stream fails.

**FR-3 — Systemic pause / failure sticky banner**  
When `systemicPause` is set (or equivalent pool failure), show a non-auto-dismiss (or long-lived) in-page bar: error summary, **Retry**, **Dismiss**, link/path to providers. Clear on successful batch or user stop.

**FR-4 — Page-scope presets**  
Single control mapping to smart excludes / body whitelist / aside caps combinations. Balanced = product default after track.

**FR-5 — Session settings cache + parallel cache lookups**  
Cache `loadSettings()` for the active translation session; invalidate on `chrome.storage.onChanged`. Parallelize success/failure cache lookups per batch (`Promise.all`).

**FR-6 — Aside caps default ON**  
`enableAsideCaps` default `true` (Classic preset turns off).

### Phase 2 — Throughput

**FR-7 — Parallel sub-batches in `handleTranslate`**  
After split/dedup, run sub-batches with bounded concurrency (reuse `lib/concurrency.ts` / `runWithConcurrency`), composing with existing semaphore + pool. Preserve partial success / failure caching semantics.

**FR-8 — Look-ahead prefetch**  
Beyond fixed `VIEWPORT_MARGIN`, schedule next-viewport pieces at lower priority when active work is below a threshold. Must not overwhelm rate limits.

**FR-9 — Adaptive batch size (opt-in)**  
When enabled, adjust effective group/char budgets from rolling latency; when off, keep fixed settings.

**FR-10 — Reading-strip priority**  
Prefer top-of-fold / heading pieces when many pieces become visible at once.

### Phase 3 — Quality / results

**FR-11 — Document term memory**  
Per-session map of notable terms from page title + early translations; inject a capped block into subsequent batch prompts (untrusted-data style, same as pageContext).

**FR-12 — JSON parse repair + missing-id re-request**  
On partial/malformed maps, extract salvageable pairs; optionally one repair request for missing ids before error UI.

**FR-13 — Expanded language detection**  
Add Latin languages beyond en/vi/es/fr/de/pt (at least it, id, nl, ro or equivalent) with unique-signal + stopword strategies; keep confidence threshold discipline.

**FR-14 — Optional model-scoped cache key**  
When on, cache key includes model (and/or provider id). Default off. Clear guidance when model changes.

**FR-15 — Category prompt snippets**  
Small, static per-category rule blocks appended when category is known (docs, news, e-comm, etc.).

**FR-16 — Quality self-check (opt-in)**  
After first successful batch sample, detect obvious failures (source-as-translation when langs differ, dropped `<z>` tags); one automatic re-prompt with stricter instruction.

### Phase 4 — Hard problems / reliability

**FR-17 — Mutation dirty markers**  
Nodes already walked are marked; mutation path only re-extracts new/dirty subtrees (addresses deferred item from pipeline hardening).

**FR-18 — Layout containment (opt-in)**  
Reduce flex/grid/card breakage (contain translation in original box / safer insertion heuristics). Default off.

**FR-19 — Rich translate on sentence-split pieces**  
Preserve or re-encode rich markup for pieces that exceed `MAX_PIECE_CHARS` and split (today degrades to plain).

**FR-20 — Resume identity de-dup**  
Match resume snapshots by stronger identity than bare text alone (e.g. parent identity + text, or local context hash) so identical paragraphs map correctly.

**FR-21 — Stream / pageContext / glossary parity**  
Streaming web path carries the same context, glossary, and category as non-streaming.

**FR-22 — characterData thrash guard**  
Ignore mutation thrash when normalized text already handled.

**FR-23 — Shadow DOM walk (opt-in)**  
Optional piercing of open shadow roots during extract; default off.

**FR-24 — content.ts orchestrator split**  
Refactor into focused modules (`translateSession`, stream client, resume, status) with no intentional behavior change; tests guard public entrypoints.

**FR-25 — In-page mini progress / stop (if not fully covered by FR-3)**  
Thin page chrome for count + Stop while translating (complements popup).

---

## Non-Functional Requirements

- **No subtitle/PDF feature work** unless a shared pure helper must move; full test suite must stay green for those paths.
- **Bundle budget:** track delta; aim ≤ +40KB gzipped for the whole track (soft).
- **TDD** for pure libs (`lib/*`); integration tests for background batching and content orchestration seams.
- **Settings triple:** any new field updates interface + `DEFAULT_SETTINGS` + `extractSettings()`.
- **Migration:** deepMerge preserves user overrides; only *defaults* change for Balanced policy.
- **Security:** term memory / page context remain untrusted data in prompts; no `innerHTML` of model output; rich decode stays createElement-based.
- **MV3:** no long-lived blocking on the service worker; keepalive patterns unchanged or improved.

---

## Acceptance Criteria

1. **Tests:** New unit/integration coverage for pure helpers and wired seams; full `pnpm test` green.
2. **Lint/typecheck:** Track is lint-neutral; no new intentional `tsc` errors.
3. **Manual smoke matrix:** long article; SPA body-swap; rate-limit/systemic pause + retry; streaming fallback; cache-hit path; at least one flex/grid-heavy page (with containment off and, if enabled, on).
4. **Measurable:**
   - Streaming default is `true` for new installs / unset field.
   - Multi-batch viewport flushes issue concurrent sub-batch work (cap ≥ 2) rather than pure serial-only.
   - Progress UI does not report “complete” while only off-screen work remains (or copy clearly says scroll-to-continue).
5. **Regressions:** Subtitle and PDF suites pass; web dual/translation-only, section translate, selection/hover still work.
6. **Escape hatch:** Classic preset restores streaming off + aside caps off + no layout containment + no model-scoped cache.

---

## Out of Scope

- Subtitle pipeline features (ASR, handlers, overlay UX).
- PDF viewer features (beyond shared helper reuse).
- New LLM providers / pool architecture redesign.
- WASM CLD3 language detection.
- Closed shadow roots / cross-origin iframe translation.
- Full Immersive feature parity outside listed FRs.
- i18n of all extension strings (keep English copy consistent with project).
