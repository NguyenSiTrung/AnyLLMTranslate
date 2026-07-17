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

