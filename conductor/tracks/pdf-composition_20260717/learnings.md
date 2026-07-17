# Track Learnings: pdf-composition_20260717

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

### PDF Content Classification & Layout
- **Rule-based vs LLM classification split:** Pure-math detection is deterministic and client-side. Figure/table LLM classify must fail-open to prose so classification failure never makes the page worse than translate-all.
- **Classification belongs inside `translateParagraphs`:** Atomic retry, unified cache (`source→source` for skips), keeps `extractPageText` pure.
- **Propagate paragraph `kind` end-to-end:** Carry `kind: prose|math|figure` on results → `paragraphKinds` on `PageTranslations` → renderer; do not rediscover via `translated === original` alone.

### PDF Viewer
- **Paragraph grouping:** lines by `transform[5]` within Y_TOLERANCE; paragraphs by LINE_GAP_FACTOR × lineHeight; hyphen rejoin.
- **Layout mode:** canvas + absolute overlay with white mask on original text only; never mask math/figure kinds.
- **Download generator:** original page background + white rect + drawText; skip math/figure by explicit kind.

### Testing
- Prefer pure helpers for detect/composition (no chrome.runtime) for unit tests.
- Mock `chrome.runtime.sendMessage` / streaming ports carefully in `pdfTranslation` tests.
- Avoid `vi.waitFor` inside `act(async)` under React 19 (deadlock).

### Similar archived tracks
- `pdf-perf-ux_20260703` — streaming, kinds, classify short-circuit
- `pdf-elastic-overlay_20260616` — Layout overlay geometry
- `pdf-translation_20260612` — extraction foundations

### External methodology (do not copy AGPL source)
- BabelDOC: IL compositions, formula placeholders `{vN}`, table protect-by-default, DocLayout labels
- PDFMathTranslate: font-name formula flag, size-ratio subscripts, protect figure/table/formula regions

---

<!-- Learnings from implementation will be appended below -->

## [2026-07-17] - Phase 1 Tasks 1.1–1.4: Run-level extraction
- **Implemented:** `PdfTextRun` + optional `runs` on `PdfParagraph`; pure `paragraphsFromTextItems` for tests; run-aware line/paragraph grouping in `extractPageText`.
- **Files changed:** `pdfTextExtraction.ts`, `pdfTextExtraction.test.ts`
- **Learnings:**
  - Patterns: Export pure `paragraphsFromTextItems` + `PdfTextItemLike` so unit tests avoid PDFPageProxy mocks.
  - Gotchas: Synthetic join spaces live only on aggregated `text`, not as separate runs — formula reassembly should use run texts.
  - Context: Rotated-text filter unchanged; `fontName` defaults to `''` when sparse.
---

## [2026-07-17] - Phase 2 Tasks 2.1–2.4: Multi-signal formula detection
- **Implemented:** `isFormulaFontName`, `classifyRuns`, `isFormulaDominated`, `classifyMathParagraphFromParagraph`, `strictMath` thresholds.
- **Files changed:** `pdfContentDetect.ts`, `pdfContentDetect.test.ts`
- **Learnings:**
  - Patterns: Font patterns must not use leading `\b` — PDF.js names use underscores (`g_d0_CMMI10`) and JS `\b` treats `_` as word char.
  - Gotchas: Greek letters in "prose" runs trip strong-marker path when word count ≤ 4; fixtures should avoid Greek in body runs.
  - Context: Formula-dominated uses char-weight ratio (0.55 default / 0.4 strict); mixed stays prose for placeholder path.
---

## [2026-07-17] - Phase 3 Tasks 3.1–3.5: Placeholders + pipeline
- **Implemented:** `pdfComposition.ts` (build/reassemble/strip); wired into `translateParagraphs`; prompt rule for `{vN}`; `compositions` on `TranslationResultItem`.
- **Files changed:** `pdfComposition.ts`, `pdfComposition.test.ts`, `pdfTranslation.ts`, `pdfTranslation.test.ts`, `types/messages.ts`, `services/base.ts`
- **Learnings:**
  - Patterns: Cache keys always use original paragraph text, never placeholder payload.
  - Gotchas: Streaming `onPiece` must reassemble before UI update; consecutive formula runs collapse to one `{vN}`.
  - Context: Fail-open appends original formulas if model drops all placeholders.
---

## [2026-07-17] - Phase 4 Tasks 4.1–4.4: Table regions + setting
- **Implemented:** `classifyTableRegions`, `isProtectedTableCell`, `translateTableText` on PdfSettings, pipeline branch.
- **Learnings:**
  - Patterns: `classifyTableLikeParagraphs` delegates to regions for backward compat.
  - Gotchas: When translateTableText is on, still force-protect all numeric fragments page-wide.
---

## [2026-07-17] - Phase 5 Tasks 5.1–5.3: Multi-column reading order
- **Implemented:** `pdfReadingOrder.ts` + applied in `paragraphsFromTextItems`.
- **Learnings:**
  - Patterns: Spanning width ratio 0.55 keeps full-width titles out of side columns.
  - Context: Columns left→right, within column top→bottom (PDF y descending).
---

