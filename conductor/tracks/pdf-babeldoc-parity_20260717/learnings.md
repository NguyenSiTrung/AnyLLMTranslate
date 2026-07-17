# Track Learnings: pdf-babeldoc-parity_20260717

Patterns, gotchas, and context discovered during implementation.

## Codebase Patterns (Inherited)

### From `conductor/patterns.md` (PDF-relevant)

- Prefer pure helpers for detect/composition (no chrome.runtime) for unit tests.
- Mock `chrome.runtime.sendMessage` / streaming ports carefully in `pdfTranslation` tests.
- **`vi.waitFor` inside `act(async ...)` deadlocks under React 19** — use bounded poll loops instead.
- Layout mode: canvas + absolute overlay with white mask on original text only; never mask math/figure kinds.
- Download generator: original page background + white rect + drawText; skip math/figure by explicit kind.
- Propagate paragraph `kind` end-to-end (`prose` | `math` | `figure`); do not rediscover via `translated === original` alone.
- Cache keys always use original paragraph text, never placeholder payload.

### From archived `pdf-composition_20260717`

- **Rule-based vs LLM classification split:** Pure-math detection is deterministic and client-side. Figure/table LLM classify must fail-open to prose.
- **Classification belongs inside `translateParagraphs`:** Atomic retry, unified cache (`source→source` for skips), keeps `extractPageText` pure.
- Run-level model: `PdfTextRun` + optional `runs` on `PdfParagraph`; synthetic join spaces live only on aggregated `text`.
- Formula placeholders: `{vN}` build/reassemble/strip; consecutive formula runs collapse to one slot; fail-open append if model drops tokens.
- Table regions protect-by-default; `translateTableText` opt-in; numeric cells always protected.
- Multi-column reading order: columns L→R, within column top→bottom.
- Selective mask: `getProseMaskRects` returns `null` to skip; Run.y is baseline — convert to top-edge (`y + height`) for para.y-compatible mask API.
- Font patterns must not use leading `\b` — PDF.js names use underscores.

### External methodology (do not copy AGPL source)

- **BabelDOC:** dual PDF (side-by-side + alternating), typesetting ladder (fit / scale / expand box), AutomaticTermExtractor, scanned detect + OCR workaround, formula placeholders, table protect-by-default.
- **PDFMathTranslate:** font-name formula flag, size-ratio subscripts (already in composition track).
- Reference only: `BabelDOC-main/` in repo for design study — **never paste** into production modules.

### Similar archived tracks

- `pdf-composition_20260717` — composition pipeline (direct predecessor)
- `pdf-download_20260618` — mono download foundation
- `pdf-perf-ux_20260703` — streaming, kinds, download parallel translate
- `pdf-elastic-overlay_20260616` — Layout overlay geometry
- `pdf-translation_20260612` — extraction foundations

---

<!-- Learnings from implementation will be appended below -->

## [2026-07-17] - Phase 1: Settings + pure typesetting core
- **Implemented:** PdfSettings gains `autoExtractTerms`, `detectScanned`, `autoOcrWorkaround` (all default true). Pure `fitTextToBox` ladder in `pdfTypesetting.ts`.
- **Files changed:** `types/config.ts`, `types/__tests__/config.test.ts`, `entrypoints/pdf-viewer/lib/pdfTypesetting.ts`, tests
- **Learnings:**
  - Patterns: Typesetting ladder is pure + pluggable `FontMetricsHook` so overlay (canvas) and download (pdf-lib) share one algorithm.
  - Gotchas: Line-spacing-only tests need carefully chosen geometry so compact LH fits without scaling.
  - Context: Soft min scale 0.6 / hard min 0.1 matches BabelDOC public methodology (no AGPL paste).

## [2026-07-17] - Phase 2: Wire typesetting into Layout + mono download
- **Implemented:** Overlay + generator call `fitTextToBox` before grow/draw; `createCanvasMetricsHook` in fontMetrics.
- **Files changed:** `PdfTranslationPane.tsx`, `fontMetrics.ts`, `translatedPdfGenerator.ts`, regression tests
- **Learnings:**
  - Patterns: Free horizontal space = page edge − box right; vertical residual overflow still grows page slot.
  - Gotchas: Layout boxes need CSS `lineHeight` from ladder result so measured DOM height matches fit.

## [2026-07-17] - Phase 3: Dual PDF export
- **Implemented:** `pdfDualExport.ts` (side-by-side + alternating), format picker modal, assemble stage in download pipeline.
- **Files changed:** `pdfDualExport.ts`, `usePdfDownload.ts`, `DownloadProgressModal.tsx`, `App.tsx`, `style.css`
- **Learnings:**
  - Patterns: Dual always builds from mono bytes (reuse typesetting + selective mask quality).
  - Gotchas: Missing mono page → original-only fallback; filename via `dualExportFilename`.

## [2026-07-17] - Phase 4: Document term extraction
- **Implemented:** `pdfTermExtract` parse/merge/sample + `EXTRACT_PDF_TERMS` background path; inject `termMemoryBlock` on PDF translate/stream.
- **Files changed:** `pdfTermExtract.ts`, `pdfTranslation.ts`, `types/messages.ts`, `services/background.ts`
- **Learnings:**
  - Patterns: Reuse `preScanSystemPrompt` + `returnRawResponse` like dictionary/film glossary paths.
  - Gotchas: Session cache keyed by url+lang pair; user glossary wins on collision; fail-open never blocks translate.

## [2026-07-17] - Phase 5–6: Scanned detect, OCR workaround, Options UI
- **Implemented:** `pdfScannedDetect` density heuristics; session state; pure-scan skip LLM + banner; OCR full-para white underlay; Options toggles.
- **Files changed:** `pdfScannedDetect.ts`, `pdfScanSession.ts`, `usePdfPageTranslations.ts`, generator/pane, `AdvancedSection.tsx`, `App.tsx`
- **Learnings:**
  - Patterns: Pure-scan (no text) → message, not OCR workaround; OCR workaround only when heavy scan with some text.
  - Gotchas: Assess once per document URL on first loaded pages (sample ≤3).

