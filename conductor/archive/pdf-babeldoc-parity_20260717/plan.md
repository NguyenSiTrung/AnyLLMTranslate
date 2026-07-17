# Plan: BabelDOC-parity PDF pipeline

**Track:** `pdf-babeldoc-parity_20260717`  
**Spec:** [spec.md](./spec.md)  
**Methodology:** TDD — tests with or before implementation; commit per task when practical.  
**Execution:** sequential (all phases)  
**Predecessor:** `pdf-composition_20260717`

---

## Phase 1: Settings + pure typesetting core

- [x] **Task 1.1: Extend `PdfSettings` + defaults + config tests**
  <!-- files: types/config.ts, types/__tests__/config.test.ts -->
  - [x] Add `autoExtractTerms` (default `true`), `detectScanned` (default `true`), `autoOcrWorkaround` (default `true`)
  - [x] Keep existing composition toggles (`translateTableText`, `strictMathSkip`, auto-open fields)
  - [x] Tests for defaults / merge

- [x] **Task 1.2: TDD — typesetting ladder pure API**
  <!-- files: entrypoints/pdf-viewer/lib/__tests__/pdfTypesetting.test.ts -->
  - [x] Natural fit when short
  - [x] Reduce line spacing when slightly long
  - [x] Scale font when still overflow
  - [x] Expand box into free space when neighbors allow
  - [x] Floor: never below hard min scale without `overflow: true`

- [x] **Task 1.3: Implement `pdfTypesetting.ts`**
  <!-- files: entrypoints/pdf-viewer/lib/pdfTypesetting.ts -->
  - [x] BabelDOC-inspired Algorithms 1–3 (methodology only; no AGPL paste)
  - [x] Input: box, text, font metrics hook, optional free-space
  - [x] Output: `{ fontSize, lineHeight, box, lines, overflow }`

- [x] **Task 1.4: Phase 1 verification**
  - [x] `pnpm exec vitest run` for typesetting + config tests
  - [x] Capture learnings

---

## Phase 2: Wire typesetting into Layout + mono download

- [x] **Task 2.1: Integrate typesetting into Layout overlay**
  <!-- files: entrypoints/pdf-viewer/components/PdfTranslationPane.tsx, entrypoints/pdf-viewer/lib/fontMetrics.ts -->
  - [x] Prose boxes use ladder before grow-page-slot
  - [x] Math/figure still never masked

- [x] **Task 2.2: Integrate typesetting into `translatedPdfGenerator`**
  <!-- files: entrypoints/pdf-viewer/lib/translatedPdfGenerator.ts -->
  - [x] Replace/augment wrap+clamp with ladder result
  - [x] Keep selective mask via `getProseMaskRects`

- [x] **Task 2.3: TDD — generator / overlay regression fixtures**
  <!-- files: entrypoints/pdf-viewer/lib/__tests__/ (composition / generator as needed) -->
  - [x] Short text unchanged; long text scales or expands; math skip preserved

- [x] **Task 2.4: Phase 2 verification**
  - [x] Run pdf-viewer unit tests covering overlay + generator paths
  - [x] Capture learnings

---

## Phase 3: Dual PDF export (side-by-side + alternating)

- [x] **Task 3.1: TDD — dual assembly pure helpers**
  <!-- files: entrypoints/pdf-viewer/lib/__tests__/pdfDualExport.test.ts -->
  - [x] Side-by-side page geometry (width sum, height max)
  - [x] Alternating page order O1,T1,O2,T2…
  - [x] Empty/missing translation page fallback

- [x] **Task 3.2: Implement dual export builders**
  <!-- files: entrypoints/pdf-viewer/lib/pdfDualExport.ts -->
  - [x] `buildSideBySideDualPdf(monoBytes, originalBytes)` via pdf-lib embed
  - [x] `buildAlternatingDualPdf(monoBytes, originalBytes)`
  - [x] Shared progress callback

- [x] **Task 3.3: Extend download orchestration + UI**
  <!-- files: entrypoints/pdf-viewer/hooks/usePdfDownload.ts, entrypoints/pdf-viewer/components/DownloadProgressModal.tsx, entrypoints/pdf-viewer/App.tsx -->
  - [x] User picks: Mono | Dual side-by-side | Dual alternating
  - [x] Pipeline: translate-all → mono generate → dual assemble (if dual) → download
  - [x] Filename suffixes: `.translated.pdf`, `.dual.pdf`, `.dual.alt.pdf`

- [x] **Task 3.4: Phase 3 verification**
  - [x] Dual unit tests + download orchestration tests
  - [x] Capture learnings

---

## Phase 4: Document term extraction pre-pass

- [x] **Task 4.1: TDD — term list parse + merge**
  <!-- files: entrypoints/pdf-viewer/lib/__tests__/pdfTermExtract.test.ts -->
  - [x] Parse LLM JSON term pairs; strip junk; merge with user glossary
  - [x] Fail-open empty list

- [x] **Task 4.2: Implement `pdfTermExtract.ts` + background path**
  <!-- files: entrypoints/pdf-viewer/lib/pdfTermExtract.ts, entrypoints/pdf-viewer/lib/pdfTranslation.ts, types/messages.ts as needed -->
  - [x] Sample first N pages / char budget of prose paragraphs
  - [x] One LLM extract call (pool path) when `autoExtractTerms`
  - [x] Inject terms into PDF translate context for subsequent batches
  - [x] Cache terms per document URL + lang pair for session

- [x] **Task 4.3: Wire into `usePdfPageTranslations` / `translateAllPages`**
  <!-- files: entrypoints/pdf-viewer/hooks/usePdfPageTranslations.ts, entrypoints/pdf-viewer/lib/translateAllPages.ts -->
  - [x] Extract once before first batch when enabled
  - [x] Fail-open never blocks page translate

- [x] **Task 4.4: Phase 4 verification**
  - [x] Term tests + translate mocks
  - [x] Capture learnings

---

## Phase 5: Scanned detect + OCR workaround

- [x] **Task 5.1: TDD — scanned score pure heuristics**
  <!-- files: entrypoints/pdf-viewer/lib/__tests__/pdfScannedDetect.test.ts -->
  - [x] Empty text layer + large page → high scan score
  - [x] Dense text → low score
  - [x] Threshold for “heavily scanned” document

- [x] **Task 5.2: Implement `pdfScannedDetect.ts`**
  <!-- files: entrypoints/pdf-viewer/lib/pdfScannedDetect.ts -->
  - [x] Use PDF.js text content density vs page area
  - [x] Prefer pure helpers for unit testing

- [x] **Task 5.3: OCR workaround path**
  <!-- files: entrypoints/pdf-viewer/lib/pdfComposition.ts, entrypoints/pdf-viewer/lib/translatedPdfGenerator.ts, entrypoints/pdf-viewer/components/PdfTranslationPane.tsx -->
  - [x] When enabled + page/doc flagged: force white underlay for prose, black text (BabelDOC OCR spirit)
  - [x] Pure-scan no-text: user-visible message, skip useless LLM

- [x] **Task 5.4: Wire detection into document load / translate gate**
  <!-- files: entrypoints/pdf-viewer/hooks/usePdfDocument.ts or usePdfPageTranslations.ts, entrypoints/pdf-viewer/App.tsx -->
  - [x] Run sample on first pages when `detectScanned`
  - [x] Auto-enable OCR workaround when `autoOcrWorkaround` + heavy scan

- [x] **Task 5.5: Phase 5 verification**
  - [x] Detect tests + banner/state coverage
  - [x] Capture learnings

---

## Phase 6: Options UI + polish polish

- [x] **Task 6.1: Advanced → PDF Translator card**
  <!-- files: entrypoints/options/sections/AdvancedSection.tsx -->
  - [x] Toggles: Auto extract terms, Detect scanned, Auto OCR workaround
  - [x] Persist via existing `pdfSettings` shallow-merge pattern

- [x] **Task 6.2: Viewer download UX polish**
  <!-- files: entrypoints/pdf-viewer/App.tsx, entrypoints/pdf-viewer/components/DownloadProgressModal.tsx -->
  - [x] Clear format picker; progress labels for dual stage
  - [x] Error copy for scanned-only docs

- [x] **Task 6.3: Full suite gate**
  - [x] `pnpm exec vitest run entrypoints/pdf-viewer` (+ config tests)
  - [x] Elevate reusable patterns to `conductor/patterns.md` if any
  - [x] Capture final learnings
