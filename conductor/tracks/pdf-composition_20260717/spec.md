# Spec: PDF Composition Pipeline (BabelDOC-inspired)

**Track id:** `pdf-composition_20260717`  
**Type:** Feature  
**Status:** Confirmed  
**Date:** 2026-07-17  

## Overview

Upgrade the PDF viewer’s extract → classify → translate → overlay/download pipeline using **BabelDOC-style methodology**, while remaining pure browser (PDF.js + pdf-lib; no YOLO/ONNX; no AGPL source copy):

1. **Run-level intermediate model** (text runs with font/size/geometry)
2. **Multi-signal formula detection** (font name, size ratio, Unicode/LaTeX — extends `pdfContentDetect`)
3. **Formula placeholders + reinsert** for mixed prose + math
4. **Table region protection** (default verbatim) + opt-in “Translate table text”
5. **Multi-column reading order**
6. **Selective masking** in Layout overlay and download (prose only)
7. **Power-user PDF card** in Options

Success: scientific PDFs keep equations and tables visually correct in Layout mode and exported PDFs; prose still translates via the user’s LLM pool.

## Decisions (confirmed)

| Topic | Choice |
|-------|--------|
| Table body cells | Verbatim by default + opt-in `pdfSettings.translateTableText` (default off); captions stay prose when sentence-like |
| Inline math | Formula placeholders + reinsert original formula runs; mask only prose |
| Scope | Full pipeline A–D (no YOLO/WASM, no BabelDOC sidecar) |
| Settings UI | Power-user PDF card: translate table text, show placeholders in Text mode, strict math skip |

## Functional Requirements

### FR-1 — Rich extraction (runs)

- `extractPageText` preserves **runs**: `text`, `fontName`, `fontSize`, `box` (x/y/w/h), optional transform flags.
- Paragraphs are ordered lists of runs (backward-compatible: still expose aggregated `text` + bbox for existing UI).
- Unit tests for run grouping and paragraph assembly.

### FR-2 — Multi-signal formula detection

- Extend pure detectors (no network):
  - Font-name heuristics (TeX/math/symbol families; PDF.js `fontName`)
  - Subscript/superscript size ratio vs line median (~0.79×)
  - Existing Unicode/LaTeX/density rules in `pdfContentDetect.ts`
- Outputs: run-level `formula | prose`; paragraph `kind` may be `math` when formula-dominated, else compositions.

### FR-3 — Formula placeholders + reinsert

- Mixed paragraphs become strings like `"The loss is {v0} where λ is …"`.
- Only prose segments go to the LLM; formulas are never rewritten as free text.
- Reassemble translated prose + original formula runs.
- Prompt rules: do not alter `{vN}`; strip hallucinated placeholders.
- Cache keys must remain correct for placeholder-bearing sources.

### FR-4 — Table regions + setting

- Detect table **regions** (grids of short cells / multi-row clusters / numeric grids), not only isolated cells.
- Default: paragraphs inside table regions are `figure` (verbatim); **do not mask** in Layout/download.
- Captions outside regions (e.g. “Table 1: …”) remain prose when sentence-like.
- Setting: `pdfSettings.translateTableText` (default `false`). When true, allow translation of non-numeric table text inside regions.

### FR-5 — Multi-column reading order

- Cluster lines/paragraphs by column (x-midpoint / gap), then top→bottom within columns, then columns left→right.
- Improves arXiv-style two-column papers without vision models.

### FR-6 — Selective mask (Layout + download)

- Layout overlay and `translatedPdfGenerator`: mask/draw only **prose** boxes/runs.
- Never mask `math` runs, pure-math paragraphs, or protected table/figure regions.
- Prefer explicit `kind` / run composition over text-equality; keep equality as legacy fallback.

### FR-7 — Power-user PDF card (Options → Advanced → PDF Translator)

- **Translate table text** (default off)
- **Show formula placeholders in Text mode** (debug-oriented; default off)
- **Strict math skip** (more aggressive formula classification when on; default off)
- Existing auto-open / never-auto-open hosts remain.

### FR-8 — Tests & regression

- Unit tests for: font math, size-ratio, placeholders round-trip, table regions, column order, selective mask.
- Extend existing `pdfContentDetect` / `pdfTranslation` / generator tests.
- No YOLO fixtures required.

## Non-Functional Requirements

- **Browser-only:** no native modules, no DocLayout-YOLO/WASM in this track.
- **License:** reimplement algorithms from public methodology; do **not** copy BabelDOC/PDFMathTranslate source (AGPL-3.0).
- **Fail-open:** detection errors must not drop page content; prefer translate-as-prose when ambiguous (except default table-region protect).
- **Perf:** run detection is synchronous/local; no extra LLM call beyond existing classify/translate. Prefer fewer classify calls when runs already decide kind.
- **MV3:** no new host permissions; stay within pdf-viewer + background message patterns.
- **TDD:** tests with implementation per `conductor/workflow.md`.

## Acceptance Criteria

1. Mixed prose+inline-math paragraph: translated prose, formula run unchanged and unmasked in Layout and download.
2. Pure display equation: `kind: math`, not sent as free translation target, not white-masked.
3. Dense table grid: protected by default; left-pane table still visible under Layout overlay.
4. With **Translate table text** on, non-numeric table labels can translate; pure numbers stay safe.
5. Two-column page: reading order is column-aware (unit tests on synthetic geometry).
6. Power-user PDF card exposes the three controls with agreed defaults.
7. `pnpm test` / lint green for touched modules; existing PDF streaming/pool cooling paths still work.

## Out of Scope

- DocLayout-YOLO / onnxruntime-web
- Local BabelDOC HTTP “precise export” sidecar
- Full content-stream PDF rewrite (PyMuPDF-style)
- KaTeX/MathJax re-render of formulas
- Scanned-PDF OCR
- Cross-page paragraph merge
- Figure axis-label recovery beyond current figure heuristics (except as side effect of table regions)

## Technical approach

| Area | Primary files |
|------|----------------|
| Extraction | `entrypoints/pdf-viewer/lib/pdfTextExtraction.ts` |
| Detect | `entrypoints/pdf-viewer/lib/pdfContentDetect.ts` (+ tests) |
| Pipeline | `entrypoints/pdf-viewer/lib/pdfTranslation.ts` |
| Overlay | `entrypoints/pdf-viewer/components/PdfTranslationPane.tsx` |
| Download | `entrypoints/pdf-viewer/lib/translatedPdfGenerator.ts` |
| Settings | `types/config.ts`, Advanced PDF section, migration if needed |
| Session/cache | `pdfProgressStore.ts` / memory cache if kinds/runs need persistence |

**Predecessors:** `docs/superpowers/specs/2026-07-14-pdf-layout-math-table-kind-design.md`, archived `pdf-perf-ux_20260703`, `pdf-elastic-overlay_20260616`.

## Reference methodology (not dependencies)

- [BabelDOC](https://github.com/funstory-ai/BabelDOC) — IL compositions, formula placeholders, layout labels, table protect-by-default
- [PDFMathTranslate](https://github.com/PDFMathTranslate/PDFMathTranslate) — font `vflag`, formula carve-out, YOLO protect regions
