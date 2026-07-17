# Spec: BabelDOC-parity PDF pipeline

**Track:** `pdf-babeldoc-parity_20260717`  
**Type:** Feature  
**Predecessor:** `pdf-composition_20260717` (runs, formulas, `{vN}`, selective mask, table protect)

## Overview

Bring AnyLLMTranslate’s PDF translator closer to **BabelDOC-class scientific paper translation and bilingual comparison** while staying **extension-only TypeScript** (PDF.js + pdf-lib). Build on the archived composition foundation; reimplement public methodology only — **no AGPL BabelDOC source, no PyMuPDF, no DocLayout models**.

Deliver four capability pillars:

1. **Dual PDF export** — side-by-side + alternating, plus keep mono  
2. **Typesetting ladder** — shared fit algorithms for Layout overlay **and** download  
3. **Document term extraction** — automatic pre-pass (toggleable)  
4. **Scanned-PDF detect + OCR workaround** — automatic with toggles  

## Functional Requirements

### FR-1 Dual PDF export

- Download UI offers: **Mono**, **Dual side-by-side**, **Dual alternating**
- Side-by-side: page width = orig + translated; left original, right translated
- Alternating: O1, T1, O2, T2…
- Dual pages reuse mono generation quality (same typesetting + selective mask)
- Progress/cancel works for all export modes
- Filename suffixes distinguish formats (e.g. `.translated.pdf`, `.dual.pdf`, `.dual.alt.pdf`)

### FR-2 Typesetting ladder (overlay + download)

- Pure helper (e.g. `pdfTypesetting.ts`) implementing BabelDOC-inspired fit:
  - Place at natural size within paragraph box  
  - Reduce line spacing within bounds  
  - Scale font down (soft floor ~0.6; hard min ~0.1 with overflow flag)  
  - Expand box into free horizontal space when available  
- Used by Layout overlay and `translatedPdfGenerator`
- Overlay may still grow page slot when text cannot fit without illegible scale
- Math/figure kinds remain unmasked

### FR-3 Document glossary / term extraction

- Before multi-page translation (or first batch), sample prose paragraphs → LLM term list  
- Inject into PDF translation context (reuse glossary plumbing where possible)  
- Default **ON**; toggle under PDF Translator card  
- Fail-open: extraction failure does not block translation  
- Optional merge with user glossary  
- Session cache per document URL + language pair  

### FR-4 Scanned detection + OCR workaround

- Detect pages with little/no extractable text vs page area  
- If document heavily scanned: surface status; enable **OCR workaround** path (white underlay + forced text overlay assumptions) when settings allow  
- Default detect **ON**; OCR workaround auto-enable when heavily scanned (toggleable)  
- Clear UX when PDF cannot be translated (pure scan with no text layer)

### FR-5 Settings surface

- Options → Advanced → PDF Translator gains toggles:
  - Auto term extraction (`autoExtractTerms`, default true)  
  - Scanned detection (`detectScanned`, default true)  
  - Auto OCR workaround (`autoOcrWorkaround`, default true)  
- Download format choice lives in PDF viewer download UI  

### FR-6 Compatibility / methodology

- Reimplement methodology only; module headers note “inspired by BabelDOC public design, no AGPL paste”  
- Table protect-by-default and formula placeholders remain as composition track left them  

## Non-Functional Requirements

- TDD for pure helpers (typesetting, dual assembly, scan scoring, term parse)  
- No large ML model in the extension bundle  
- Viewport streaming translation remains default for interactive reading  
- Download may still require translate-all-pages as today  
- License-safe; no BabelDOC code copy  

## Acceptance Criteria

- [ ] User can download mono, dual side-by-side, and dual alternating PDFs from the viewer  
- [ ] Side-by-side dual shows original and translation on one wide page; alternating interleaves pages  
- [ ] Layout overlay and download share the same typesetting ladder behavior for prose boxes  
- [ ] With term extraction ON, multi-page scientific PDFs get more consistent technical terms vs OFF  
- [ ] Heavily scanned PDFs are detected; OCR workaround or clear failure messaging applies per settings  
- [ ] All new toggles persist in settings and have tests  
- [ ] Unit tests cover pure modules; existing PDF tests remain green  
- [ ] No AGPL/source vendoring of BabelDOC  

## Out of Scope

- Embedding BabelDOC, PDFMathTranslate, PyMuPDF, or DocLayout ONNX  
- Full content-stream IL rewrite (true character-level PDF reconstruction)  
- Remote layout RPC / cloud OCR services  
- Zotero plugins  
- Changing non-PDF (web/subtitle) pipelines except shared glossary helpers if reused  

## Technical Approach (summary)

| Pillar | Primary modules |
|--------|-----------------|
| Typesetting | `pdfTypesetting.ts` → `PdfTranslationPane`, `translatedPdfGenerator` |
| Dual export | `pdfDualExport.ts` → `usePdfDownload`, download UI |
| Terms | `pdfTermExtract.ts` → `pdfTranslation` / `translateAllPages` |
| Scanned | `pdfScannedDetect.ts` → load/translate gate, mask path |
| Settings | `types/config.ts` `PdfSettings`, `AdvancedSection` PDF card |
