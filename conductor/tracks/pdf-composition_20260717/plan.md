# Plan: PDF Composition Pipeline (BabelDOC-inspired)

**Track:** `pdf-composition_20260717`  
**Spec:** [spec.md](./spec.md)  
**Methodology:** TDD — tests with or before implementation; commit per task when practical.

---

## Phase 1: Run-level extraction model
<!-- execution: sequential -->

- [x] **Task 1.1: Define run/paragraph types and keep backward compatibility**
  <!-- files: entrypoints/pdf-viewer/lib/pdfTextExtraction.ts -->
  - [x] Add `PdfTextRun` (`text`, `fontName`, `fontSize`, `x`, `y`, `width`, `height`)
  - [x] Extend `PdfParagraph` with optional `runs?: PdfTextRun[]` (aggregated `text` + bbox still required)
  - [x] Export types used by detect/translate/renderer

- [x] **Task 1.2: TDD — run grouping from PDF.js-like text items**
  <!-- files: entrypoints/pdf-viewer/lib/__tests__/pdfTextExtraction.test.ts -->
  - [x] Fixtures: same-line items with different fonts/sizes
  - [x] Fixtures: multi-line paragraph preserves run order and boxes
  - [x] Assert aggregated `text` matches current join rules (spaces, hyphen join)

- [x] **Task 1.3: Implement run-aware `extractPageText`**
  <!-- files: entrypoints/pdf-viewer/lib/pdfTextExtraction.ts -->
  - [x] Capture `fontName` from `TextItem` (and height/transform as today)
  - [x] Build runs while grouping lines → paragraphs
  - [x] Keep rotated-text filter behavior
  - [x] All new tests green

- [x] **Task 1.4: Phase 1 verification**
  - [x] `pnpm exec vitest run entrypoints/pdf-viewer/lib/__tests__/pdfTextExtraction`
  - [x] Capture learnings if any

---

## Phase 2: Multi-signal formula detection
<!-- execution: sequential -->
<!-- depends: phase1 -->

- [x] **Task 2.1: TDD — font-name and size-ratio formula signals**
  <!-- files: entrypoints/pdf-viewer/lib/__tests__/pdfContentDetect.test.ts -->
  - [x] Cases: TeX/CM/Symbol-like fontName → formula run
  - [x] Cases: body font + normal size → prose
  - [x] Cases: run height &lt; ~0.79× line median → formula (sub/sup)
  - [x] Cases: existing Unicode/LaTeX paths still pass

- [x] **Task 2.2: Implement run-level classification APIs**
  <!-- files: entrypoints/pdf-viewer/lib/pdfContentDetect.ts -->
  - [x] `isFormulaFontName(fontName: string): boolean` (reimplemented heuristics; no AGPL paste)
  - [x] `classifyRuns(runs, options?: { strictMath?: boolean }): Array<'prose'|'formula'>`
  - [x] `classifyMathParagraph` remains for text-only callers; optionally reuses run path when runs present
  - [x] `strictMath` tightens density/font thresholds

- [x] **Task 2.3: Wire extraction output into detectors (unit integration)**
  <!-- files: entrypoints/pdf-viewer/lib/pdfContentDetect.ts, entrypoints/pdf-viewer/lib/__tests__/pdfContentDetect.test.ts -->
  - [x] Helper: paragraph with runs → formula-dominated `math` vs mixed compositions
  - [x] Tests green

- [x] **Task 2.4: Phase 2 verification**
  - [x] Run detect + extraction tests
  - [x] Capture learnings

---

## Phase 3: Placeholders + translation pipeline
<!-- execution: sequential -->
<!-- depends: phase2 -->

- [x] **Task 3.1: TDD — placeholder build / reinsert / hallucination strip**
  <!-- files: entrypoints/pdf-viewer/lib/__tests__/pdfComposition.test.ts (new) -->
  - [x] Build `"prose {v0} prose"` from mixed runs
  - [x] Reinsert after translation preserves formula run boxes/text
  - [x] Strip invented `{v9}` not in map
  - [x] Pure-formula paragraph → no LLM string (or identity)

- [x] **Task 3.2: Implement composition helpers**
  <!-- files: entrypoints/pdf-viewer/lib/pdfComposition.ts (new) -->
  - [x] `buildTranslatePayload(paragraph): { text, placeholders, formulaRuns }`
  - [x] `reassembleTranslation(translated, placeholders): { displayText, compositions }`
  - [x] Stable `{vN}` format; document in module header

- [x] **Task 3.3: Integrate into `translateParagraphs`**
  <!-- files: entrypoints/pdf-viewer/lib/pdfTranslation.ts, services/base.ts (prompt only if needed) -->
  - [x] After math/table/prose split: for mixed paragraphs send placeholder text only
  - [x] Preserve formula segments in results (`kind: math` segments or composition metadata)
  - [x] Prompt: do not alter placeholders (extend PDF system prompt if needed)
  - [x] Streaming path: piece ids still map to paragraph ids; final reassembly after piece complete
  - [x] Cache write-through uses original source text (or documented key policy)

- [x] **Task 3.4: Extend `pdfTranslation` tests + mocks**
  <!-- files: entrypoints/pdf-viewer/lib/__tests__/pdfTranslation.test.ts -->
  - [x] Mixed paragraph: LLM sees `{v0}`, not formula body
  - [x] Result kind/composition correct
  - [x] Fail-open paths unchanged for classify

- [x] **Task 3.5: Phase 3 verification**
  - [x] Run pdfTranslation + pdfComposition tests
  - [x] Capture learnings

---

## Phase 4: Table regions + setting
<!-- execution: sequential -->
<!-- depends: phase3 -->

- [x] **Task 4.1: TDD — table region clustering**
  <!-- files: entrypoints/pdf-viewer/lib/__tests__/pdfContentDetect.test.ts -->
  - [x] Multi-row multi-column short cells → region ids
  - [x] Long prose outside grid not included
  - [x] Caption-like sentences near table remain eligible for prose

- [x] **Task 4.2: Implement `classifyTableRegions`**
  <!-- files: entrypoints/pdf-viewer/lib/pdfContentDetect.ts -->
  - [x] Bounding region from cell clusters (extend beyond `classifyTableLikeParagraphs`)
  - [x] Mark contained paragraphs as `figure` by default
  - [x] Numeric cells always protected

- [x] **Task 4.3: Setting `pdfSettings.translateTableText`**
  <!-- files: types/config.ts, lib/config.ts (migration/defaults), entrypoints/pdf-viewer/lib/pdfTranslation.ts -->
  - [x] Default `false` in `DEFAULT_SETTINGS` / types
  - [x] When true: non-numeric table-region text may translate; numbers stay figure
  - [x] Pipeline reads setting in `translateParagraphs`

- [x] **Task 4.4: Phase 4 verification**
  - [x] Unit tests for regions + setting branch
  - [x] Capture learnings

---

## Phase 5: Multi-column reading order
<!-- execution: sequential -->
<!-- depends: phase1 -->

- [x] **Task 5.1: TDD — column clustering**
  <!-- files: entrypoints/pdf-viewer/lib/__tests__/pdfReadingOrder.test.ts (new) -->
  - [x] Synthetic two-column layout: left column fully before right
  - [x] Single column unchanged
  - [x] Wide centered title not forced into wrong column (heuristic guard)

- [x] **Task 5.2: Implement reading-order sort**
  <!-- files: entrypoints/pdf-viewer/lib/pdfReadingOrder.ts (new), entrypoints/pdf-viewer/lib/pdfTextExtraction.ts -->
  - [x] Cluster by x-gap / midpoints
  - [x] Sort within column top→bottom, columns left→right
  - [x] Apply after paragraph flush (or as final reorder)

- [x] **Task 5.3: Phase 5 verification**
  - [x] Reading-order + extraction tests green
  - [x] Capture learnings

---

## Phase 6: Selective mask — Layout overlay + download
<!-- execution: sequential -->
<!-- depends: phase3, phase4 -->

- [ ] **Task 6.1: TDD — generator skips formula/figure compositions**
  <!-- files: entrypoints/pdf-viewer/lib/__tests__/ (generator tests if present; else new) -->
  - [ ] Prose masked; math/figure not masked
  - [ ] Mixed paragraph: only prose sub-rects if available; else conservative full-para policy documented

- [ ] **Task 6.2: Update `translatedPdfGenerator`**
  <!-- files: entrypoints/pdf-viewer/lib/translatedPdfGenerator.ts -->
  - [ ] Prefer `paragraphKinds` + composition/run metadata
  - [ ] Keep legacy `translated === original` fallback

- [ ] **Task 6.3: Update Layout overlay (`PdfTranslationPane`)**
  <!-- files: entrypoints/pdf-viewer/components/PdfTranslationPane.tsx -->
  - [ ] Never white-mask math/figure kinds
  - [ ] Mixed: show translated prose; leave formula runs unmasked (transparent / skip box)
  - [ ] Text mode: optional show placeholders when setting on (Phase 7 can finish wiring)

- [ ] **Task 6.4: Progress store / session kinds persistence**
  <!-- files: entrypoints/pdf-viewer/lib/pdfProgressStore.ts -->
  - [ ] Ensure kinds (and any composition fields needed for remount) survive restore

- [ ] **Task 6.5: Phase 6 verification**
  - [ ] Generator + contentDetect + translation tests
  - [ ] Capture learnings

---

## Phase 7: Power-user PDF card (Options UI)
<!-- execution: sequential -->
<!-- depends: phase4 -->

- [ ] **Task 7.1: Settings types + defaults**
  <!-- files: types/config.ts, lib/config.ts, stores if needed -->
  - [ ] `translateTableText: boolean` (default false)
  - [ ] `showFormulaPlaceholders: boolean` (default false)
  - [ ] `strictMathSkip: boolean` (default false)
  - [ ] Migration: missing keys → defaults

- [ ] **Task 7.2: Options UI — PDF Translator power card**
  <!-- files: entrypoints/options/sections/ (Advanced PDF section components) -->
  - [ ] Three toggles with short helper text
  - [ ] Group under Advanced → PDF Translator
  - [ ] Persist via existing settings store

- [ ] **Task 7.3: Wire settings into viewer pipeline**
  <!-- files: entrypoints/pdf-viewer/lib/pdfTranslation.ts, pdfContentDetect.ts, PdfTranslationPane.tsx -->
  - [ ] `strictMathSkip` → detect options
  - [ ] `translateTableText` → table path
  - [ ] `showFormulaPlaceholders` → Text mode display of raw placeholder strings when useful for debug

- [ ] **Task 7.4: Phase 7 verification**
  - [ ] Settings/config tests if present; manual smoke checklist in learnings
  - [ ] Capture learnings

---

## Phase 8: Integration, regression, closeout
<!-- execution: sequential -->
<!-- depends: phase5, phase6, phase7 -->

- [ ] **Task 8.1: Full PDF unit suite**
  - [ ] `pnpm exec vitest run entrypoints/pdf-viewer`
  - [ ] Fix regressions (streaming, cooling, kinds)

- [ ] **Task 8.2: Lint + typecheck on touched surface**
  - [ ] `pnpm lint` (or project equivalent) for changed files
  - [ ] Fix introduced issues only

- [ ] **Task 8.3: Manual verification checklist (document in learnings)**
  - [ ] arXiv-style two-column PDF: order + math
  - [ ] Table-heavy page: protect default / opt-in translate
  - [ ] Layout overlay + download selective mask
  - [ ] Pool cooling path still shows countdown

- [ ] **Task 8.4: Elevate reusable patterns to `conductor/patterns.md`**
  - [ ] Composition/placeholder patterns, table-region default, multi-column sort notes

- [ ] **Task 8.5: Track closeout**
  - [ ] All plan tasks checked
  - [ ] Ready for `/conductor-archive` when user confirms

---

## Parallel execution notes

| Mode | Phases |
|------|--------|
| Sequential default | 1 → 2 → 3 → 4 → 6 → 7 → 8 |
| Optional overlap | Phase 5 (reading order) depends only on Phase 1 types; can start after 1.3 in parallel with Phase 2–3 if desired |
| No phase-level parallel by default | Avoid dual writers on `pdfTranslation.ts` / `pdfContentDetect.ts` |

---

## Risk register

| Risk | Mitigation |
|------|------------|
| PDF.js fontName sparse/missing | Fall back to Unicode/size; never require font alone |
| Over-aggressive formula → under-translate | `strictMathSkip` default off; fail-open mixed prose |
| Placeholder broken by LLM | Hallucination strip + identity fallback for formula slots |
| Table region false positives on short prose | Require multi-cell multi-row grid; exclude long sentences |
| Overlay mixed-run geometry hard | Ship paragraph-level skip first if run-level mask incomplete; document |

---

## Definition of done (track)

All FR-1–FR-8 acceptance criteria met; phases 1–8 tasks complete; tests green; learnings elevated; user can use power-user PDF card with safe defaults.
