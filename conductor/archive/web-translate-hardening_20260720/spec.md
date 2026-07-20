# Track: Web Translate Lifecycle & Bilingual Display Hardening

**Track ID:** `web-translate-hardening_20260720`
**Type:** Hardening / bug-fix (improvement)
**Priority:** High
**Depends on:** none
**Predecessors:** `web-translate-v3_20260714`, `web-pipeline-hardening_20260708`,
  `web-bilingual-quality_20260707`, `bilingual-display-ux_20260505`
**Source:** Deep analysis of web page translation + bilingual display (2026-07-20 Amp thread)

---

## Overview

Harden bilingual **web page** translation end-to-end after v3. The pipeline is
architecturally sound (viewport-first, rich markup, list/table-aware injection,
non-stream session guard). Remaining risk is **cross-lifecycle consistency**,
**SPA scale**, and **host-layout isolation** — not basic paragraph translation.

**Approach (hybrid):**
1. Phases 1–2 — TDD regressions for P0/P1 lifecycle, cache, SPA structure
   (thin session contract: id + abort registry + guard every DOM write)
2. Phases 3–4 — deliberate bilingual display / a11y / status redesign with fixtures
3. Phase 5 — quality-gate fixtures covering residual edge cases

**Default policy:** Correctness fixes always-on. Layout strategies that rewrite
host structure stay conservative (pair wrapper only where safe; flex/grid-aware
insertion preferred over blanket wrap). No subtitle/PDF feature work unless a
shared seam is required (regression-guard only).

**Definition of done (track):** Unit tests + Vitest/jsdom integration fixtures
for each finding class; `pnpm test` + `pnpm lint` green. Optional real-site smoke
is phase-verification polish, not a blocking archive gate.

---

## Functional Requirements

### Phase 1 — P0 Lifecycle correctness

**FR-1 — Cancellable translation sessions**
- Every normal and streaming request carries a `translationSession` id.
- Stream `piece` events MUST check session before any DOM write.
- Active ports/controllers live in a session registry; disconnect/abort on
  stop, restore, restart, and body-swap re-init.
- Non-stream already has a late-response guard; extend the same contract to stream.

**FR-2 — Stop writes resume snapshot before clearing**
- `stopTranslation()` must snapshot translated pieces **before** `allPieces = []`.
- `writeResumeSnapshot()` no-ops when empty — current order makes Stop a no-op for resume.
- Regression: translate → stop → load snapshot → entries present.

**FR-3 — Serialize start/stop transitions**
- Lifecycle mutex (or equivalent init state) so concurrent
  `startTranslation` / stop / body-swap cannot interleave mid-await.
- Bump session before async startup; re-check session after every await.
- Command handlers await and surface structured results where practical.

**FR-4 — Resume before observe (no restore/network race)**
- Apply snapshot (or mark restore-pending) **before** viewport observes pieces,
  or gate dispatch until restore settles.
- Validate snapshot `targetLanguage` + a translation-config fingerprint
  (at minimum: target lang; prefer model/prompt/glossary version when available).
- Same-session restore must not race a fresh LLM request for the same piece.

**FR-5 — Section dismiss uses canonical restore**
- `removeSectionTranslation` must remove original roles, unwrap
  `data-anyllm-original-wrapper`, and clear markers the same way as
  `removeAllTranslations`.
- Translation-only mode must not leave originals `display:none` after dismiss.
- Fixture: section translate → translation-only → dismiss → originals visible.

**FR-6 — Cache key fingerprint**
- Success (and negative) cache keys include a stable fingerprint of:
  provider/endpoint identity, model, source/target language, effective prompt
  version, glossary/term-memory version or content hash, category/context mode,
  temperature/deterministic settings, rich-translation format version.
- Backward-compatible migration: old keys miss (safe); no silent cross-config hits.
- Document Advanced guidance when model/prompt/glossary changes.

### Phase 2 — P1 SPA stability & scale

**FR-7 — Indexed piece registry + prune detached**
- `Map<pieceId, piece>` and parent/text identity index
  (e.g. `WeakMap<Element, Map<textHash, piece>>`).
- Prune disconnected nodes on mutation flush and/or periodic sweep.
- Eliminate O(N×M) `allPieces.some` duplicate scans.

**FR-8 — Route / document revision handling**
- Detect meaningful SPA navigation beyond body swap:
  `pushState` / `replaceState` / `popstate` and/or content-root revision.
- On revision: reset pieces, page context, resume identity, observers as needed;
  bump session (drop in-flight writes).

**FR-9 — Incremental mutation extraction**
- Queue smallest stable block ancestors; coalesce overlapping roots.
- Idle/time budget per flush; consume or remove unused `data-anyllm-walked`.
- Observe newly discovered open shadow roots when shadow walk is enabled.

**FR-10 — Per-piece inline clone updates**
- Replace document-wide clone remove/rebuild with piece-id-owned clone map.
- Mode switches and single-piece updates only touch affected clones.

**FR-11 — Bounded cache lookup concurrency**
- Cap parallel IDB lookups or use batched multi-get per batch
  (reuse/extend `lib/parallelCacheLookup.ts` patterns).

**FR-12 — Provider throttle + adaptive metrics isolation**
- Atomic/reserved key throttle (no parallel workers bursting past min interval).
- Adaptive latency EMA keyed by provider/model (and request class if needed).

**FR-13 — Safer source-language skip gate**
- Do not map script families to a single language when ambiguous
  (Cyrillic ≠ always Russian; Han+kana → Japanese path; etc.).
- Higher bar before marking a piece complete with no translation node.
- Prefer “translate unnecessarily” over silent skip of valid foreign text.

**FR-14 — Streaming partial fallback**
- On stream error, re-request only unfinished piece ids
  (already-applied stream results must not be paid for twice).

**FR-15 — Hover in-flight dedup**
- Per-element pending promise map so leave/re-enter before completion
  does not double-dispatch.

**FR-16 — Stronger response validation**
- Verify rich token ids/counts/balance/allowed tags where rich mode is on;
  revalidate repair output; reject incomplete id maps before DOM apply.

### Phase 3 — P2 Bilingual layout isolation

**FR-17 — Context-aware insertion strategy**
- Separate paths: normal flow, flex parent, grid parent, lists, table cells,
  table rows, headings, interactive controls.
- Avoid blind sibling injection into flex/grid item slots
  (pair wrapper or contained insertion where safe).

**FR-18 — Translation-only theme full reset**
- Clear theme effects that survive current TO rules: `filter`, `opacity`,
  animations, text-decoration, forced widths, bubble pseudo-elements,
  side-by-side sizing. Mask must not leave blurred text when original is hidden.

**FR-19 — Inline mode-correct rendering**
- Store raw translation separately; re-render on dual ↔ translation-only.
- Single spacing source (text space XOR CSS margin).
- `dir="auto"` (and bidi isolation where needed) on successful inline nodes.
- Rich compact output gets a clear bilingual delimiter when dual.

**FR-20 — Side layout robustness**
- Narrow fallback for generic `translationPosition="side"`.
- Prefer container width / measured width over viewport-only breakpoints
  where feasible.

**FR-21 — Table colspan correctness**
- Compute effective columns from cell `colSpan` sums; sensible header-row handling.
- Document/skip virtualized or complex grid tables when insertion is unsafe.

**FR-22 — Contained wrapper safety**
- Avoid unconditional `<span>` wrapping of block children in LI/TD/TH when
  invalid; prefer structure-preserving strategy and full unwrap on restore.

**FR-23 — Custom theme border-none fix**
- Root attribute/class for custom border style so CSS can clear padding;
  stop matching child inline `style*=` for a variable declared on `<html>`.

**FR-24 — Constrained-layout cache invalidation**
- Invalidate on resize / relevant mutation / ResizeObserver;
  or scope cache to a single render pass.

### Phase 4 — P2 A11y, status, site rules polish

**FR-25 — Accessible retry controls**
- Real button (or role=button + tabindex + keyboard) for piece errors;
  clones inherit retry behavior in translation-only.

**FR-26 — Semantic original↔translation relationship (lightweight)**
- Stable ids + `aria-describedby` or pair-group labeling without noisy
  live-region floods on bulk page translate.

**FR-27 — Status semantics + tab scoping**
- Distinguish viewport-complete vs page-complete vs paused vs partial-failure.
- Status broadcasts carry real tab identity; popup ignores other tabs.

**FR-28 — Site-rule & blocklist correctness**
- Prefer most-specific match (or document first-match clearly + UI order).
- Fix inline blocklist wildcard boundary (`*.figma.com` must not match
  `evilfigma.com`).

**FR-29 — Safer piece element lookup**
- Piece-id → element map and/or `CSS.escape(pieceId)` for queries.
- Root-aware lookup for open shadow roots when enabled.

### Phase 5 — Integration fixtures & residual hardening

**FR-30 — Fixture matrix (required DoD)**
jsdom fixtures covering at least:
- stop after translate → resume snapshot non-empty
- stream late chunk after stop/restart → no DOM write
- restore settles before network dispatch for same pieces
- section dismiss under translation-only
- flex parent insertion does not create rogue flex item column
- table row with colspan cells
- inline dual → translation-only → dual reformatting
- mask theme + translation-only (no residual blur)
- mid-stream start mutex / double start
- detached piece prune after node removal
- cache miss across glossary/model fingerprint change
- langDetect does not skip Ukrainian/Japanese-kanji-heavy text as ru/zh incorrectly

**FR-31 — Regression guard shared seams**
- Subtitle and PDF paths: no intentional behavior change; run full suite.
- Shared cache/provider changes must keep subtitle cache namespace isolation.

---

## Non-Functional Requirements

- **NFR-1** TDD for pure libs; fixture tests at content lifecycle wire points.
- **NFR-2** Named exports; TypeScript strict; no `any` leaks.
- **NFR-3** Host-page CSS: no Tailwind on inject path; prefer existing
  `data-anyllm-*` + `styles/inject.css` patterns; minimize new `!important`.
- **NFR-4** MV3: abort/disconnect must not leave orphan ports; SW restart safe
  (content owns page lifecycle).
- **NFR-5** Performance: large infinite-scroll pages must not grow piece arrays
  unboundedly after prune; clone updates O(changed pieces).
- **NFR-6** Privacy: no new network endpoints; cache fingerprint uses local hashes only.
- **NFR-7** Backward compatible settings: new keys default-safe; Classic/Balanced
  presets remain valid.

---

## Acceptance Criteria

1. All FR-1…FR-31 implemented or explicitly deferred with user approval in learnings.
2. Every P0 finding from the 2026-07-20 analysis has a regression fixture that fails
   on pre-fix behavior and passes after fix.
3. `pnpm test` and `pnpm lint` green at each phase gate.
4. Translation-only + dual mode switch does not leave hidden originals, blurred
   mask text, or orphaned inline clones after stop/section-dismiss.
5. Stop → reload (with resume enabled) can restore previously translated pieces
   when content hash matches.
6. Streaming stop/restart never re-injects stale piece events.
7. Cache does not return hits across different model/glossary/prompt fingerprints
   when fingerprinting is enabled (default on for new fingerprint dimensions
   introduced by this track — document any opt-out).
8. No intentional subtitle/PDF regressions (full suite).
9. Track learnings updated per phase; patterns elevated at track end.

---

## Out of Scope

- New translation themes or theme marketplace
- Subtitle feature work (except shared-seam regression guards)
- PDF / Scientific bridge feature work
- Closed shadow DOM support
- Cross-origin iframe translation orchestration
- Full Playwright E2E suite as track DoD
- Rewriting content.ts into a new framework
- i18n string extraction project-wide
- Changing default display mode set beyond dual / translation-only

---

## Technical Approach (summary)

- Extend existing `translationSession` into a thin session contract (id + abort
  registry + guard on every DOM write), not a large state-machine rewrite.
- Hybrid delivery: lifecycle/cache TDD first, then SPA structure, then
  display/a11y redesign with jsdom fixtures.
- Cache fingerprint is always-on for dimensions introduced here; old keys miss safely.
- Layout: context-aware insertion / selective pair wrapper — avoid blanket host rewrites.
